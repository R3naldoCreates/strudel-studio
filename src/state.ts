// ─── Central state store ─────────────────────────────────────────────────────
import type { Song, Selection, SelectionKind, Track } from './types';
import { emptySong, makeTrack } from './types';
import type { SampleBank } from './samples';
import type { SessionEvent, SessionEventKind } from './recorder';
import { paramLabel, makeEventId } from './recorder';

// ── persistence ──────────────────────────────────────────────────────────────
const SONG_KEY = 'strudel-studio.song.v1';

function loadPersisted(): Song | null {
  try {
    const raw = localStorage.getItem(SONG_KEY);
    if (!raw) return null;
    const song = JSON.parse(raw);
    if (song?.formatVersion !== 1 || !Array.isArray(song.tracks)) return null;
    return song as Song;
  } catch {
    return null;
  }
}

function persistSong(song: Song): void {
  try {
    localStorage.setItem(SONG_KEY, JSON.stringify(song));
  } catch {
    /* quota — ignore */
  }
}

function persistGet(key: string): string | null {
  try {
    return localStorage.getItem(`strudel-studio.${key}`);
  } catch {
    return null;
  }
}

function persistSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(`strudel-studio.${key}`);
    else localStorage.setItem(`strudel-studio.${key}`, value);
  } catch {
    /* ignore */
  }
}

interface StoreState {
  song: Song;
  selection: Selection;
  isPlaying: boolean;
  /** incremented whenever code should be re-evaluated */
  revision: number;
  /** true when the user typed into the editor directly (code view no longer guaranteed model-clean) */
  handEdited: boolean;
  /** while an inspector slider is dragging, skip inspector re-renders so the thumb survives */
  inspectorHold: boolean;
  customSamplesPath: string | null;
  sampleBanks: SampleBank[];
}

interface HistoryEntry {
  song: Song;
  selection: Selection;
}

type Listener = () => void;

const HISTORY_CAP = 120;
const COALESCE_MS = 900;

class Store {
  state: StoreState;
  private listeners = new Set<Listener>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  /** when set, touch() does not capture a history snapshot (used by undo/redo) */
  private applyingHistory = false;
  private lastPushKey = '';
  private lastPushTime = 0;

  // ── recorder wiring ──────────────────────────────────────────────────────
  /** true while the capture badge is on */
  recorderArmed = false;
  /** true once a take exists — session keeps logging until cleared */
  recorderAlwaysLog = false;
  /** when set, only events touching this track are logged (post-Add focus mode) */
  recorderFocus: string | null = null;
  /** deck-owned hook receiving recorded events (null when not recording) */
  recorderSink: ((ev: SessionEvent) => void) | null = null;

  constructor() {
    this.state = {
      song: loadPersisted() ?? defaultSong(),
      selection: { kind: 'none' },
      isPlaying: false,
      revision: 0,
      handEdited: false,
      inspectorHold: false,
      customSamplesPath: persistGet('samplesPath'),
      sampleBanks: [],
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    persistSong(this.state.song);
    for (const fn of this.listeners) fn();
  }

  // ── history ───────────────────────────────────────────────────────────────
  private snapshot(): HistoryEntry {
    return {
      song: JSON.parse(JSON.stringify(this.state.song)) as Song,
      selection: { ...this.state.selection },
    };
  }

  private pushUndo(coalesceKey?: string): void {
    if (this.applyingHistory) return;
    const now = Date.now();
    if (coalesceKey && coalesceKey === this.lastPushKey && now - this.lastPushTime < COALESCE_MS) {
      this.lastPushTime = now;
      return; // merge with the entry captured when this gesture began
    }
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > HISTORY_CAP) this.undoStack.shift();
    this.redoStack = [];
    this.lastPushKey = coalesceKey ?? '';
    this.lastPushTime = now;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(this.snapshot());
    this.restoreSnapshot(entry);
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(this.snapshot());
    this.restoreSnapshot(entry);
  }

  private restoreSnapshot(entry: HistoryEntry): void {
    this.applyingHistory = true;
    this.state.song = JSON.parse(JSON.stringify(entry.song)) as Song;
    // keep selection if the selected track still exists
    const sel = entry.selection;
    const stillThere = sel.trackId && this.state.song.tracks.some((t) => t.id === sel.trackId);
    this.state.selection = stillThere ? { ...sel } : { kind: 'none' };
    this.applyingHistory = false;
    this.touch();
  }

  // ── selection ─────────────────────────────────────────────────────────────
  select(sel: Selection): void {
    this.state.selection = sel;
    this.emit();
  }

  selectTrack(trackId: string, kind: SelectionKind = 'track'): void {
    this.select({ kind, trackId });
  }

  selectedTrack(): Track | undefined {
    const id = this.state.selection.trackId;
    return this.state.song.tracks.find((t) => t.id === id);
  }

  // ── song mutations ────────────────────────────────────────────────────────
  /** emit a recorded event to the recorder (no-op when no take exists) */
  private logEvent(partial: Omit<SessionEvent, 'id'>): void {
    if (!this.recorderArmed && !this.recorderAlwaysLog) return;
    const trackId = partial.trackId ?? null;
    if (this.recorderFocus) {
      // focus mode: keep only this track's events
      if (!trackId || trackId !== this.recorderFocus) return;
    }
    this.recorderSink?.({ ...partial, id: makeEventId() });
  }

  setBpm(bpm: number): void {
    const before = this.state.song.bpm;
    this.pushUndo('bpm');
    this.state.song.bpm = clamp(Math.round(bpm), 20, 300);
    this.logEvent({ kind: 'bpm', field: 'bpm', before, after: this.state.song.bpm, label: `${before}→${this.state.song.bpm}`, trackId: null, t: 0 });
    this.touch();
  }

  /** Add a track and select it. */
  addTrack(track: Track): void {
    this.pushUndo();
    this.state.song.tracks.push(track);
    this.state.selection = { kind: track.source === 'drums' ? 'drums-pattern' : 'synth-pattern', trackId: track.id };
    this.logEvent({ kind: 'track-add', trackId: track.id, before: undefined, after: JSON.parse(JSON.stringify(track)), label: `+ ${track.name}`, t: 0 });
    this.touch();
  }

  updateTrack(id: string, patch: Partial<Track>): void {
    const t = this.state.song.tracks.find((t) => t.id === id);
    if (!t) return;
    const beforeAll = JSON.parse(JSON.stringify(t)) as Track;
    this.pushUndo(`track:${id}:${Object.keys(patch).sort().join(',')}`);
    Object.assign(t, patch);
    for (const key of Object.keys(patch) as (keyof Track & string)[]) {
      const kind: SessionEventKind = key === 'fx' ? 'fx' : 'param';
      this.logEvent({ kind, field: key, trackId: id, before: beforeAll[key], after: patch[key], label: paramLabel(key, beforeAll[key], patch[key]), t: 0 });
    }
    this.touch();
  }

  removeTrack(id: string): void {
    const idx = this.state.song.tracks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this.pushUndo();
    const snapshot = this.state.song.tracks[idx];
    this.state.song.tracks.splice(idx, 1);
    this.state.selection = { kind: 'none' };
    this.logEvent({ kind: 'track-remove', trackId: id, before: JSON.parse(JSON.stringify(snapshot)), after: undefined, label: `− ${snapshot.name}`, t: 0 });
    this.touch();
  }

  duplicateTrack(id: string): void {
    const t = this.state.song.tracks.find((t) => t.id === id);
    if (!t) return;
    this.pushUndo();
    const copy: Track = JSON.parse(JSON.stringify(t));
    copy.id = `${t.kind}-${Math.random().toString(36).slice(2, 8)}`;
    copy.name = `${t.name} copy`;
    copy.fx = copy.fx.map((f) => ({ ...f, id: `fx-${Math.random().toString(36).slice(2, 8)}` }));
    const idx = this.state.song.tracks.findIndex((x) => x.id === id);
    this.state.song.tracks.splice(idx + 1, 0, copy);
    this.state.selection = { kind: 'track', trackId: copy.id };
    this.logEvent({ kind: 'track-add', trackId: copy.id, before: undefined, after: JSON.parse(JSON.stringify(copy)), label: `+ ${copy.name}`, t: 0 });
    this.touch();
  }

  moveTrack(id: string, dir: -1 | 1): void {
    const arr = this.state.song.tracks;
    const i = arr.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const beforeOrder = arr.map((x) => x.id);
    this.pushUndo();
    const [t] = arr.splice(i, 1);
    arr.splice(j, 0, t);
    this.logEvent({ kind: 'track-reorder', trackId: null, before: beforeOrder, after: arr.map((x) => x.id), label: 'reorder', t: 0 });
    this.touch();
  }

  setSong(song: Song): void {
    this.pushUndo();
    const before = this.state.song;
    this.state.song = song;
    this.state.selection = { kind: 'none' };
    this.logEvent({ kind: 'song-load', trackId: null, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(song)), label: 'load song', t: 0 });
    this.touch();
  }

  /** Apply a song without recording it (used by the recorder's scrub/replay). */
  replaceSongSilent(song: Song): void {
    this.state.song = song;
    this.bumpRevision();
  }

  /** Bump revision so the editor regenerates its code (no undo entry). */
  bumpRevision(): void {
    this.state.revision += 1;
    this.state.handEdited = false;
    this.emit();
  }

  /** Clear every effect from a track (undoable). */
  clearFx(id: string): void {
    const t = this.state.song.tracks.find((t) => t.id === id);
    if (!t || t.fx.length === 0) return;
    this.updateTrack(id, { fx: [] });
  }

  /** Bypass or re-enable every effect on a track (undoable). */
  setFxBypassAll(id: string, bypassed: boolean): void {
    const t = this.state.song.tracks.find((t) => t.id === id);
    if (!t) return;
    this.updateTrack(id, { fx: t.fx.map((f) => ({ ...f, bypassed })) });
  }

  /** Remove all additives: fx, automation, variation, octave, orbit (undoable). */
  clearAdditives(id: string): void {
    const t = this.state.song.tracks.find((t) => t.id === id);
    if (!t) return;
    this.updateTrack(id, { fx: [], automation: null, sampleIndex: 0, octave: 0, orbit: null });
  }

  /** Any model change: bump revision, persist, notify. */
  touch(): void {
    this.state.revision += 1;
    this.state.handEdited = false;
    this.emit();
  }

  setPlaying(playing: boolean): void {
    this.state.isPlaying = playing;
    this.emit();
  }

  setHandEdited(v: boolean): void {
    if (this.state.handEdited === v) return;
    this.state.handEdited = v;
    this.emit();
  }

  setInspectorHold(v: boolean): void {
    if (this.state.inspectorHold === v) return;
    this.state.inspectorHold = v;
    // no emit — holding is a render concern, not a model change
  }

  setCustomSamplesPath(p: string | null): void {
    this.state.customSamplesPath = p;
    persistSet('samplesPath', p);
    this.emit();
  }

  setSampleBanks(banks: SampleBank[]): void {
    this.state.sampleBanks = banks;
    this.emit();
  }
}

export const store = new Store();

export function defaultSong(): Song {
  const s = emptySong();
  s.name = 'Untitled Song';
  s.bpm = 132;
  s.tracks.push(
    makeTrack('drums', { name: 'Drums', drumPattern: 'bd ~ sd ~, hh*8', gain: 0.9 }),
    makeTrack('bass', { name: 'Bass', notePattern: 'c2 ~ c2 eb2', wave: 'square', gain: 0.65, fx: [{ id: 'fx-init-bass-lpf', type: 'lpf', value: 900 }] }),
    makeTrack('lead', { name: 'Lead', notePattern: '<c3 e3 g3 b3>*2', wave: 'sawtooth', gain: 0.35, fx: [{ id: 'fx-init-lead-lpf', type: 'lpf', value: 2400 }], automation: { target: 'lpf', wave: 'sine', rate: 8, depth: 0.55 } }),
  );
  return s;
}


export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
