// ─── Recorder core: session-state event log + deterministic replay ──────────
// This is NOT a note recorder. It captures *what the user does* in the app:
//   - a layer was added / removed / reordered
//   - a parameter changed (gain, mute, solo, pattern, wave, orbit, …)
//   - an effect was added / removed / tweaked
//   - the tempo changed
// Scrubbing the timeline = re-applying events with t ≤ T on top of the base
// snapshot captured at arm time. Forward playback applies events live.

import type { Song, Track, FxEntry, Automation } from './types';
import { FX_MAP } from './fx';

export type SessionEventKind =
  | 'bpm'
  | 'track-add'
  | 'track-remove'
  | 'track-reorder'
  | 'param'
  | 'fx'
  | 'song-load';

export interface SessionEvent {
  id: string;
  /** seconds since the recorder was armed */
  t: number;
  /** the affected track, or null for global events */
  trackId: string | null;
  kind: SessionEventKind;
  /** param events: the model field ('gain', 'muted', …); fx events: 'fx-chain' */
  field?: string;
  before?: unknown;
  after?: unknown;
  /** coalesced events span from t..t+duration */
  duration?: number;
  label: string;
}

const str = (v: unknown): string => (v == null ? '—' : String(v));

function fmtFxValue(fxType: string, value: number | string): string {
  const def = FX_MAP[fxType];
  if (def?.enumValues) return String(value).toUpperCase();
  const p = def?.params?.[0];
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const dp = p?.dp ?? 2;
  return p?.unit ? `${n.toFixed(dp)} ${p.unit}` : n.toFixed(dp);
}

const fxName = (type: string): string => (FX_MAP[type]?.label ?? type).toLowerCase();
/** short one-word-ish label for a single fx entry */
const fxShort = (type: string): string => fxName(type).split(' ')[0];

/** Compute a compact label for fx-chain changes (before → after whole arrays). */
export function fxChainLabel(before: FxEntry[] | undefined, after: FxEntry[] | undefined): string {
  const b = before ?? [];
  const a = after ?? [];
  const bMap = new Map(b.map((f) => [f.id, f]));
  const aMap = new Map(a.map((f) => [f.id, f]));
  const added = a.filter((f) => !bMap.has(f.id));
  const removed = b.filter((f) => !aMap.has(f.id));
  const parts: string[] = [];
  if (added.length > 0) {
    parts.push(`+${added.slice(0, 2).map((f) => fxShort(f.type)).join(', ')}${added.length > 2 ? ` +${added.length - 2}` : ''}`);
  }
  if (removed.length > 0) {
    parts.push(`−${removed.slice(0, 2).map((f) => fxShort(f.type)).join(', ')}`);
  }
  // value or bypass changes on surviving fx
  for (const f of a) {
    const prev = bMap.get(f.id);
    if (!prev) continue;
    if (prev.value !== f.value) {
      parts.push(`${fxShort(f.type)} ${fmtFxValue(f.type, prev.value)}→${fmtFxValue(f.type, f.value)}`);
    } else if (!!prev.bypassed !== !!f.bypassed) {
      parts.push(f.bypassed ? `${fxShort(f.type)} off` : fxShort(f.type));
    }
  }
  return parts.join(' · ') || 'effects';
}

export function paramLabel(field: string, before: unknown, after: unknown): string {
  switch (field) {
    case 'muted':
      return after ? 'mute' : 'unmute';
    case 'solo':
      return after ? 'solo' : 'unsolo';
    case 'gain': {
      const f = typeof before === 'number' ? before.toFixed(2) : str(before);
      const t = typeof after === 'number' ? after.toFixed(2) : str(after);
      return `gain ${f}→${t}`;
    }
    case 'notePattern':
    case 'drumPattern': {
      const s = str(after);
      return s.length > 30 ? `pattern “${s.slice(0, 30)}…”` : `pattern “${s}”`;
    }
    case 'wave':
      return `wave → ${str(after)}`;
    case 'octave':
      return `octave ${str(after)}`;
    case 'orbit':
      return after === null ? 'orbit off' : `orbit ${str(after)}`;
    case 'sampleIndex':
      return `n ${str(after)}`;
    case 'name':
      return `name → ${str(after)}`;
    case 'automation': {
      const a = after as Automation | null;
      if (!a) return 'LFO off';
      const tgt = a.target ?? 'gain';
      return a.bypassed ? `LFO ${tgt} off` : `LFO → ${tgt}`;
    }
    case 'fx':
      return fxChainLabel(before as FxEntry[] | undefined, after as FxEntry[] | undefined);
    default:
      return `${field} → ${str(after)}`;
  }
}

/** Apply one event to a song, mutating it in place (internal use). Tolerant of missing tracks. */
export function applyEvent(song: Song, ev: SessionEvent): void {
  switch (ev.kind) {
    case 'song-load': {
      const next = cloneSong(ev.after as Song);
      song.bpm = next.bpm;
      song.tracks = next.tracks;
      return;
    }
    case 'bpm':
      if (typeof ev.after === 'number') song.bpm = ev.after;
      return;
    case 'track-add': {
      const t = cloneTrack(ev.after as Track);
      if (!song.tracks.some((x) => x.id === t.id)) song.tracks.push(t);
      return;
    }
    case 'track-remove': {
      const id = ev.trackId ?? (ev.before as Track | undefined)?.id;
      const idx = song.tracks.findIndex((t) => t.id === id);
      if (idx >= 0) song.tracks.splice(idx, 1);
      return;
    }
    case 'track-reorder': {
      const order = (ev.after as string[]) ?? [];
      const map = new Map(song.tracks.map((t) => [t.id, t]));
      song.tracks = order.map((id) => map.get(id)).filter((t): t is Track => !!t);
      return;
    }
    case 'param':
    case 'fx': {
      const t = song.tracks.find((x) => x.id === ev.trackId);
      if (!t) return;
      const field = ev.field as keyof Track & string;
      if (field && field in t) {
        // fx / automation / nested objects are stored whole
        (t as unknown as Record<string, unknown>)[field] = cloneValue(ev.after);
      }
      return;
    }
  }
}

export function applyEventsUpTo(base: Song, events: SessionEvent[], t: number): Song {
  const song = cloneSong(base);
  for (const ev of events) {
    if (ev.t <= t) applyEvent(song, ev);
  }
  return song;
}

export function cloneSong(song: Song): Song {
  return JSON.parse(JSON.stringify(song)) as Song;
}

export function cloneTrack(track: Track): Track {
  return JSON.parse(JSON.stringify(track)) as Track;
}

function cloneValue<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

let eventCounter = 0;
export function makeEventId(): string {
  eventCounter += 1;
  return `ev-${Date.now().toString(36)}-${eventCounter.toString(36)}`;
}
