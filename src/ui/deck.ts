// ─── Recorder — a session-state timeline for what the user does ──────────────
// REC arms the log. Every action after that — layers added/removed, mutes,
// solos, gain drags, FX, pattern edits, BPM — lands on a timeline as one
// event per thing that changed (a drag is coalesced into a single event).
// The whole take is replayable: scrubbing seeks the app to the exact state
// at that moment; pressing play re-performs the take from the playhead.
import { store } from '../state';
import { BLOCK_GROUPS } from '../blocks';
import { applyEvent, applyEventsUpTo, cloneSong, paramLabel, type SessionEvent } from '../recorder';
import type { Song, Track } from '../types';

export type Snap = 'free' | '1/4' | '1/8' | '1/16';
export interface RecordedEvent extends SessionEvent {}

interface DeckState {
  armed: boolean;
  /** song snapshot at arm time — seeks apply events on top of this */
  base: Song | null;
  events: SessionEvent[];
  /** playhead position in seconds */
  playhead: number;
  /** seconds since arming (wall clock — never resets while the take exists) */
  elapsed: number;
  /** take replay active */
  playing: boolean;
  /** wall-clock seconds since arming (never resets while the take exists) */
  armOffset: number | null;
  /** armed in "paused" capture mode — edits are not logged */
  paused: boolean;
  /** when set, only this track's events are logged */
  focusTrackId: string | null;
  selectedId: string | null;
  snap: Snap;
  minimized: boolean;
  playFrom: number;
  playStartMs: number;
  lastPlayPos: number;
}

const PX_PER_SEC = 40;
const MERGE_WINDOW_SEC = 1.2;

// minimized persisted — the deck hides only after an explicit "—"
const savedMinimized = (() => {
  try {
    return localStorage.getItem('strudel-studio.deck.v1') === '1';
  } catch {
    return false;
  }
})();

const state: DeckState = {
  armed: false,
  base: null,
  events: [],
  playhead: 0,
  elapsed: 0,
  playing: false,
  paused: true,
  focusTrackId: null,
  selectedId: null,
  snap: '1/16',
  minimized: savedMinimized,
  armOffset: null,
  playFrom: 0,
  playStartMs: 0,
  lastPlayPos: 0,
};

let deckEl: HTMLElement | null = null;
let pillEl: HTMLElement | null = null;
let lanesEl: HTMLElement | null = null;
let selRowEl: HTMLElement | null = null;
let clockTimer: number | null = null;
let playTimer: number | null = null;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function isRecording(): boolean {
  return state.armed;
}

// ── construction ──────────────────────────────────────────────────────────────
export function initDeck(): void {
  buildPill();
  buildDeckElement();
  // the transport's REC toggles capture
  $('btn-rec').addEventListener('click', () => toggleRecord());
  $('deck-pill').addEventListener('click', () => {
    state.minimized = false;
    renderShellVisibility();
    renderDeck();
  });
  // capture every logged model event into the take
  store.recorderSink = (ev) => pushEvent(ev);
  // armed-ish mirrors: keep local flags in sync with store-arm changes
  restoreTake();
  renderShellVisibility();
  renderDeck();
}

function buildDeckElement(): void {
  const deck = document.createElement('div');
  deck.id = 'deck';
  deck.className = 'deck';
  deck.hidden = state.minimized;
  deck.innerHTML = `
    <div class="deck-head" id="deck-head">
      <span class="deck-title"><span class="deck-dot" aria-hidden="true"></span>Recorder</span>
      <span class="deck-head-actions">
        <span class="deck-focus-chip" id="deck-focus-chip" hidden></span>
        <button class="deck-icon-btn" id="deck-close" title="Close recorder" aria-label="Close recorder">×</button>
      </span>
    </div>
    <div class="deck-body">
      <div class="deck-controls">
        <div class="deck-select-wrap">
          <label for="deck-snap">Snap</label>
          <select class="deck-select" id="deck-snap">
            <option value="1/16">1/16</option>
            <option value="1/8">1/8</option>
            <option value="1/4">1/4</option>
            <option value="free">Free</option>
          </select>
        </div>
        <div class="spacer"></div>
        <button class="mini-btn accent" id="deck-add-layer" title="Add a layer at the playhead — captured from here">+ Add layer</button>
        <button class="mini-btn" id="deck-clear" title="Discard the take">Clear take</button>
      </div>

      <div class="deck-timeline-wrap">
        <div class="deck-timeline-label"><span>RECORDING TIMELINE</span><span class="deck-event-count" id="deck-count">0 events</span></div>
        <div class="deck-lanes" id="deck-lanes"></div>
        <div class="deck-sel-row" id="deck-sel-row" hidden>
          <span class="deck-sel-chip" id="deck-sel-chip">Mute</span>
          <span class="deck-sel-time" id="deck-sel-time">0:00</span>
          <button class="deck-icon-btn danger" id="deck-del" title="Delete event (Del)">×</button>
        </div>
      </div>

      <div class="deck-hint">REC logs everything you do — add a layer, mute, drag a fader — one event per action, coalesced over time. Stop to scrub the timeline; press play to re-perform the take.</div>

      <div class="deck-foot">
        <button class="deck-rec-btn" id="deck-rec"><span class="deck-rec-dot"></span><span>REC</span></button>
        <button class="deck-play-btn" id="deck-play" title="Play the take from the playhead">
          <svg id="deck-icon-play" viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
          <svg id="deck-icon-stop" viewBox="0 0 24 24" width="18" height="18" style="display:none"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>
        </button>
        <span class="deck-time" id="deck-time">0:00 / 0:00</span>
        <div class="deck-foot-right"></div>
      </div>
    </div>
  `;
  document.body.appendChild(deck);
  deckEl = deck;
  lanesEl = deck.querySelector('#deck-lanes');
  selRowEl = deck.querySelector('#deck-sel-row');

  deck.querySelector<HTMLSelectElement>('#deck-snap')!.addEventListener('change', (e) => {
    state.snap = (e.target as HTMLSelectElement).value as Snap;
  });
  deck.querySelector('#deck-add-layer')!.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAddLayerMenu();
  });
  deck.querySelector('#deck-clear')!.addEventListener('click', () => clearTake());
  deck.querySelector('#deck-del')!.addEventListener('click', () => deleteSelected());
  deck.querySelector('#deck-play')!.addEventListener('click', () => toggleTakePlayback());
  deck.querySelector('#deck-rec')!.addEventListener('click', () => toggleRecord());
  deck.querySelector('#deck-close')!.addEventListener('click', () => {
    if (state.armed) stopRecording();
    // Closing and minimizing were the same action — one X now hides the deck
    // and shows the top-bar pill; REC or the pill brings it back.
    setMinimized(true);
  });
  deck.querySelector('#deck-focus-chip')!.addEventListener('click', () => setFocus(null));

  // click / drag the timeline background to seek (locked while armed)
  const lanes = deck.querySelector<HTMLElement>('#deck-lanes')!;
  lanes.addEventListener('pointerdown', (e) => {
    if (state.armed) {
      toast('Stop the recorder to scrub the timeline');
      return;
    }
    if ((e.target as HTMLElement).closest('.event-block, .deck-sel-row')) return;
    const trackEl = (e.target as HTMLElement).closest?.('.lane-track') as HTMLElement | null;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const t = Math.max(0, (e.clientX - rect.left) / PX_PER_SEC);
    seekTo(t);
  });

  // drag the deck around by its header
  const head = deck.querySelector<HTMLElement>('#deck-head')!;
  let dragging = false;
  let startX = 0, startY = 0, originX = 0, originY = 0;
  head.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, .deck-focus-chip')) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = deck.getBoundingClientRect();
    originX = rect.left; originY = rect.top;
    deck.style.right = 'auto';
    deck.style.bottom = 'auto';
    deck.style.left = `${rect.left}px`;
    deck.style.top = `${rect.top}px`;
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    deck.style.left = `${Math.max(0, originX + e.clientX - startX)}px`;
    deck.style.top = `${Math.max(0, originY + e.clientY - startY)}px`;
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try { head.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);
}

function buildPill(): void {
  const pill = document.createElement('button');
  pill.id = 'deck-pill';
  pill.hidden = true;
  const right = document.querySelector('.topbar-right');
  right?.insertBefore(pill, right.firstChild);
  pillEl = pill;
}

// ── event intake (coalesced) ──────────────────────────────────────────────────
let pendingEventTime: number | null = null;

function pushEvent(ev: SessionEvent): void {
  const now = performance.now() / 1000;
  // coalescing: merge with the previous event when the same param keeps changing
  const last = state.events[state.events.length - 1];
  const t = pendingEventTime ?? Math.max(0, now - (state.armOffset ?? 0));
  pendingEventTime = null;
  if (last && canMerge(last, ev) && t - (last.t + (last.duration ?? 0)) < MERGE_WINDOW_SEC) {
    last.after = ev.after;
    last.duration = t - last.t;
    last.label = relabel(last);
    state.elapsed = last.t + (last.duration ?? 0);
    renderLanes();
    persistTake();
    return;
  }
  state.events.push({ ...ev, t });
  state.elapsed = t;
  sortEvents();
  renderLanes();
  persistTake();
}

function canMerge(a: SessionEvent, b: SessionEvent): boolean {
  if (a.kind !== b.kind || a.field !== b.field || a.trackId !== b.trackId) return false;
  if (a.kind === 'param' || a.kind === 'fx') {
    if (typeof a.after === 'boolean' || typeof b.after === 'boolean') return false;
    if (a.field === 'muted' || a.field === 'solo') return false;
    return true;
  }
  return a.kind === 'bpm';
}

function relabel(ev: SessionEvent): string {
  if (ev.kind === 'bpm') return `${ev.before}→${ev.after}`;
  return paramLabel(ev.field ?? '', ev.before, ev.after);
}

// ── armed / paused / stop ─────────────────────────────────────────────────────
export function toggleRecord(): void {
  const recBtn = $('btn-rec');
  const firstTime = !state.base;
  state.armed = !state.armed;
  if (state.armed) {
    // arming the recorder brings the timeline into view
    if (state.minimized) setMinimized(false);
    if (firstTime) {
      state.base = cloneSong(store.state.song);
      state.events = [];
      state.playhead = 0;
      state.elapsed = 0;
      state.armOffset = performance.now() / 1000;
      state.selectedId = null;
      state.focusTrackId = null;
      state.paused = false;
      store.recorderArmed = true;
      store.recorderAlwaysLog = true;
      store.recorderFocus = null;
      window.dispatchEvent(new CustomEvent('studio.autoplay'));
    } else {
      // resume capture — same take continues
      state.paused = false;
      store.recorderArmed = true;
      state.armOffset = performance.now() / 1000 - state.elapsed;
    }
    syncRecordChrome();
    startClock();
  } else {
    pauseCapture();
  }
}

function pauseCapture(): void {
  state.armed = false;
  state.paused = true;
  store.recorderArmed = false;
  syncRecordChrome();
  stopClock();
}

function stopRecording(): void {
  pauseCapture();
}

function syncRecordChrome(): void {
  document.getElementById('app')?.classList.toggle('recording', state.armed);
  document.getElementById('bottom')?.classList.toggle('recording', state.armed);
  const recBar = document.getElementById('rec-bar');
  if (recBar) recBar.hidden = !state.armed;
  const recBtn = $('btn-rec');
  recBtn.classList.toggle('recording', state.armed);
  recBtn.setAttribute('aria-pressed', String(state.armed));
  const deckRec = deckEl?.querySelector('#deck-rec');
  if (deckRec) {
    deckRec.classList.toggle('recording', state.armed);
    deckRec.querySelector('span:last-child')!.textContent = state.armed ? 'STOP' : 'REC';
  }
  const dot = deckEl?.querySelector('.deck-dot');
  dot?.classList.toggle('recording', state.armed);
}

function startClock(): void {
  if (clockTimer !== null) return;
  clockTimer = window.setInterval(() => {
    if (state.armed) {
      state.elapsed = performance.now() / 1000 - (state.armOffset ?? 0);
      state.playhead = state.elapsed;
      updateTimeDisplay();
    }
  }, 80);
}
function stopClock(): void {
  if (clockTimer !== null) { window.clearInterval(clockTimer); clockTimer = null; }
}
function updateTimeDisplay(): void {
  const el = deckEl?.querySelector('#deck-time');
  if (!el) return;
  const total = Math.max(state.elapsed, state.events[state.events.length - 1]?.t ?? 0);
  el.textContent = `${fmtTime(state.playhead)} / ${fmtTime(total)}`;
}
function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── lanes / events rendering ──────────────────────────────────────────────────
function allLaneIds(): string[] {
  const ids = new Set<string>();
  for (const t of state.base?.tracks ?? []) ids.add(t.id);
  for (const ev of state.events) if (ev.trackId) ids.add(ev.trackId);
  return [...ids];
}

function trackName(id: string): string {
  const inBase = state.base?.tracks.find((t) => t.id === id);
  if (inBase) return inBase.name;
  const added = state.events.find((e) => e.kind === 'track-add' && e.trackId === id);
  return added ? (added.after as Track)?.name ?? 'Track' : 'Track';
}

function laneColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 85% 62%)`;
}

function trackExists(id: string): boolean {
  return store.state.song.tracks.some((t) => t.id === id);
}

function renderLanes(): void {
  if (!lanesEl) return;
  const lanes = allLaneIds();
  const widthSec = Math.max(16, Math.ceil(Math.max(state.elapsed, state.events[state.events.length - 1]?.t ?? 0) + 2));
  const width = widthSec * PX_PER_SEC;

  lanesEl.innerHTML = '';
  if (lanes.length === 0 && state.events.length === 0) {
    lanesEl.innerHTML = `<div class="lanes-empty">Press REC, then do your thing — the layers you touch appear here with every change logged.</div>`;
    updateEventCount();
    return;
  }

  // BPM global lane (always first)
  lanesEl.appendChild(renderLane('__bpm__', null, width));

  for (const id of lanes) {
    lanesEl.appendChild(renderLane(id, id, width));
  }
  updateEventCount();
}

function renderLane(laneId: string, trackId: string | null, width: number): HTMLElement {
  const laneEl = document.createElement('div');
  laneEl.className = 'lane';
  laneEl.style.width = `${width + 72}px`;

  const label = document.createElement('div');
  if (trackId === null) {
    label.className = 'lane-label bpm';
    label.textContent = 'BPM';
    label.style.setProperty('--lane-color', '#ffd166');
  } else {
    label.className = 'lane-label';
    label.textContent = trackName(trackId);
    label.style.setProperty('--lane-color', laneColor(trackId));
    if (!trackExists(trackId)) {
      const tag = document.createElement('span');
      tag.className = 'lane-removed';
      tag.textContent = 'removed';
      label.appendChild(tag);
    }
  }
  laneEl.appendChild(label);

  const area = document.createElement('div');
  area.className = 'lane-track';
  area.style.width = `${width}px`;

  // grid lines every second + stronger bar lines every 4
  for (let s = 0; s <= Math.floor(width / PX_PER_SEC); s++) {
    const line = document.createElement('div');
    line.className = s % 4 === 0 ? 'lane-grid bar' : 'lane-grid';
    line.style.left = `${s * PX_PER_SEC}px`;
    area.appendChild(line);
  }

  for (const ev of state.events) {
    if (ev.trackId !== trackId) continue;
    const block = document.createElement('button');
    block.className = `event-block k-${ev.kind}${state.selectedId === ev.id ? ' selected' : ''}`;
    block.style.left = `${ev.t * PX_PER_SEC}px`;
    block.style.setProperty('--lane-color', trackId === null ? '#ffd166' : laneColor(trackId));
    block.dataset.id = ev.id;
    block.textContent = glyphFor(ev);
    block.title = `${ev.label} @ ${fmtTime(ev.t)}`;
    block.addEventListener('pointerdown', (e) => {
      if (state.armed) return; // locked while recording
      startBlockDrag(e, ev, block);
    });
    area.appendChild(block);
  }
  laneEl.appendChild(area);

  // playhead
  const ph = document.createElement('div');
  ph.className = 'playhead';
  ph.style.left = `${state.playhead * PX_PER_SEC}px`;
  area.appendChild(ph);

  return laneEl;
}

function glyphFor(ev: SessionEvent): string {
  switch (ev.kind) {
    case 'bpm': return '♩';
    case 'track-add': return '+';
    case 'track-remove': return '−';
    case 'track-reorder': return '⇅';
    case 'fx': return '◉';
    case 'song-load': return '⇣';
    case 'param': {
      switch (ev.field) {
        case 'muted': return '✕';
        case 'solo': return 'S';
        case 'gain': return 'g';
        case 'automation': return '〰';
        case 'notePattern':
        case 'drumPattern': return '✎';
        case 'wave': return '∿';
        case 'orbit': return '◎';
        case 'octave': return '˄';
        case 'sampleIndex': return 'n';
        case 'name': return 'a';
        default: return '•';
      }
    }
    default: return '•';
  }
}

function updateEventCount(): void {
  const el = document.getElementById('deck-count');
  if (el) el.textContent = `${state.events.length} event${state.events.length === 1 ? '' : 's'}`;
}

function renderSelectionRow(): void {
  if (!selRowEl) return;
  const ev = state.events.find((e) => e.id === state.selectedId) ?? null;
  if (!ev) {
    selRowEl.hidden = true;
    return;
  }
  selRowEl.hidden = false;
  const chip = selRowEl.querySelector('#deck-sel-chip') as HTMLElement;
  chip.textContent = ev.label;
  (selRowEl.querySelector('#deck-sel-time') as HTMLElement).textContent = fmtTime(ev.t);
}

// ── seek / replay ─────────────────────────────────────────────────────────────
export function seekTo(t: number): void {
  if (state.armed) return; // locked while recording
  state.playhead = Math.max(0, t);
  if (state.base) {
    const next = applyEventsUpTo(state.base, state.events, state.playhead);
    store.replaceSongSilent(next);
  }
  renderLanes();
  renderSelectionRow();
  updateTimeDisplay();
}

export function toggleTakePlayback(): void {
  if (state.playing) {
    stopTakePlayback();
    window.dispatchEvent(new CustomEvent('studio.pause-playback'));
    return;
  }
  // seek first so the state matches the playhead
  if (!state.armed && state.base) {
    const next = applyEventsUpTo(state.base, state.events, state.playhead);
    store.replaceSongSilent(next);
  }
  state.playFrom = state.playhead;
  state.playStartMs = performance.now();
  state.lastPlayPos = state.playhead;
  state.playing = true;
  window.dispatchEvent(new CustomEvent('studio.play-from')); // engine starts
  startPlayTimer();
  updatePlayButton();
}

export function stopTakePlayback(): void {
  state.playing = false;
  if (playTimer !== null) { window.clearInterval(playTimer); playTimer = null; }
  updatePlayButton();
}

function startPlayTimer(): void {
  if (playTimer !== null) window.clearInterval(playTimer);
  const tick = () => {
    if (!state.playing) return;
    const pos = state.playFrom + (performance.now() - state.playStartMs) / 1000;
    // apply every event that came due between lastPos and pos
    for (const ev of state.events) {
      if (ev.t > state.lastPlayPos && ev.t <= pos) {
        applyEvent(store.state.song, ev);
      }
    }
    state.lastPlayPos = pos;
    state.playhead = pos;
    store.bumpRevision(); // regenerate code + persist + refresh UI
    updateTimeDisplay();
    // stop at take end
    const end = state.events[state.events.length - 1]?.t ?? 0;
    if (pos >= end && state.events.length > 0) {
      stopTakePlayback();
      window.dispatchEvent(new CustomEvent('studio.pause-playback'));
    }
  };
  playTimer = window.setInterval(tick, 40);
}

function updatePlayButton(): void {
  const play = deckEl?.querySelector<HTMLElement>('#deck-icon-play');
  const stop = deckEl?.querySelector<HTMLElement>('#deck-icon-stop');
  if (play && stop) {
    play.style.display = state.playing ? 'none' : '';
    stop.style.display = state.playing ? '' : 'none';
  }
}

// ── add layer ────────────────────────────────────────────────────────────────
let addLayerEl: HTMLElement | null = null;

function toggleAddLayerMenu(): void {
  if (addLayerEl) {
    addLayerEl.remove();
    addLayerEl = null;
    return;
  }
  const menu = document.createElement('div');
  menu.className = 'add-layer-menu';
  menu.innerHTML = `<div class="alm-head">Add layer at ${fmtTime(state.playhead)}</div>`;
  for (const group of BLOCK_GROUPS) {
    const gh = document.createElement('div');
    gh.className = 'alm-group';
    gh.textContent = group.title;
    menu.appendChild(gh);
    const grid = document.createElement('div');
    grid.className = 'alm-grid';
    for (const item of group.items) {
      const btn = document.createElement('button');
      btn.className = 'alm-item';
      btn.innerHTML = `<span class="alm-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg></span><span>${item.label}</span>`;
      btn.title = item.desc;
      btn.addEventListener('click', () => {
        addLayerAtPlayhead(item.create);
        menu.remove();
        addLayerEl = null;
      });
      grid.appendChild(btn);
    }
    menu.appendChild(grid);
  }
  document.body.appendChild(menu);
  // position near the button
  const anchorEl = deckEl?.querySelector<HTMLElement>('#deck-add-layer') ?? null;
  const anchorRect = anchorEl?.getBoundingClientRect();
  if (anchorRect) {
    menu.style.right = `${Math.max(8, window.innerWidth - anchorRect.right)}px`;
    menu.style.bottom = `${Math.max(8, window.innerHeight - anchorRect.top + 8)}px`;
  }
  addLayerEl = menu;
  const close = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && e.target !== anchorEl) {
      menu.remove();
      addLayerEl = null;
      window.removeEventListener('mousedown', close, true);
    }
  };
  window.addEventListener('mousedown', close, true);
}

function addLayerAtPlayhead(create: () => Track): void {
  const track = create();
  // stamp the new layer at the playhead position (or at elapsed, if armed — the same thing)
  if (state.base) pendingEventTime = state.playhead;
  store.addTrack(track);
  pendingEventTime = null;
  if (!state.armed && state.base) {
    sortEvents();
    seekTo(state.playhead);
  }
  setFocus(track.id);
}

// ── focus (additive recording) ───────────────────────────────────────────────
function setFocus(trackId: string | null): void {
  state.focusTrackId = trackId;
  store.recorderFocus = trackId;
  const chip = deckEl?.querySelector<HTMLButtonElement>('#deck-focus-chip');
  if (chip) {
    if (trackId) {
      chip.hidden = false;
      chip.textContent = `● ${trackName(trackId)} — capturing this layer only ✕`;
      chip.title = 'Click to record all layers again';
    } else {
      chip.hidden = true;
    }
  }
}

// ── clear take ────────────────────────────────────────────────────────────────
function clearTake(): void {
  state.base = null;
  state.events = [];
  state.playhead = 0;
  state.elapsed = 0;
  state.playing = false;
  state.paused = true;
  state.armed = false;
  state.focusTrackId = null;
  state.selectedId = null;
  store.recorderArmed = false;
  store.recorderFocus = null;
  store.recorderAlwaysLog = false;
  persistTake();
  stopClock();
  updatePlayButton();
  syncRecordChrome();
  renderDeck();
}

// ── drag events within the timeline ──────────────────────────────────────────
function startBlockDrag(e: PointerEvent, ev: SessionEvent, block: HTMLElement): void {
  e.preventDefault();
  e.stopPropagation();
  state.selectedId = ev.id;
  renderLanes();
  renderSelectionRow();
  const fresh = lanesEl?.querySelector<HTMLElement>(`[data-id="${ev.id}"]`) ?? block;
  try { fresh.setPointerCapture(e.pointerId); } catch { /* untrusted pointer */ }
  const startX = e.clientX;
  const startTime = ev.t;
  const step = snapStepSeconds();
  const move = (me: PointerEvent) => {
    const dt = (me.clientX - startX) / PX_PER_SEC;
    let t = Math.max(0, startTime + dt);
    if (step) t = Math.round(t / step) * step;
    ev.t = t;
    fresh.style.left = `${ev.t * PX_PER_SEC}px`;
  };
  const up = (ue: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    try { fresh.releasePointerCapture(ue.pointerId); } catch { /* ignore */ }
    sortEvents();
    renderLanes();
    renderSelectionRow();
    persistTake();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function sortEvents(): void {
  state.events.sort((a, b) => a.t - b.t);
}

function snapStepSeconds(): number {
  const bpm = store.state.song.bpm || 120;
  if (state.snap === '1/4') return 60 / bpm;
  if (state.snap === '1/8') return 30 / bpm;
  if (state.snap === '1/16') return 15 / bpm;
  return 0;
}

function deleteSelected(): void {
  const id = state.selectedId;
  if (!id) return;
  state.events = state.events.filter((e) => e.id !== id);
  state.selectedId = null;
  // re-apply state at playhead so the deleted event's effect disappears
  const next = applyEventsUpTo(state.base ?? cloneSong(store.state.song), state.events, state.playhead);
  store.replaceSongSilent(next);
  renderLanes();
  renderSelectionRow();
  persistTake();
}

// ── persistence ───────────────────────────────────────────────────────────────
const TAKE_KEY = 'strudel-studio.take.v1';

function persistTake(): void {
  try {
    localStorage.setItem(TAKE_KEY, JSON.stringify({
      base: state.base,
      events: state.events,
      playhead: state.playhead,
      elapsed: state.elapsed,
      focusTrackId: state.focusTrackId,
    }));
  } catch { /* quota */ }
}

function restoreTake(): void {
  try {
    const raw = localStorage.getItem(TAKE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data?.base || !Array.isArray(data?.events)) return;
    state.base = data.base;
    state.events = data.events;
    state.playhead = typeof data.playhead === 'number' ? data.playhead : 0;
    state.elapsed = typeof data.elapsed === 'number' ? data.elapsed : state.playhead;
    state.focusTrackId = data.focusTrackId ?? null;
  } catch { /* corrupt — ignore */ }
}

// ── pill / minimized ──────────────────────────────────────────────────────────
function setMinimized(value: boolean): void {
  state.minimized = value;
  try {
    localStorage.setItem('strudel-studio.deck.v1', value ? '1' : '0');
  } catch {
    /* quota */
  }
  renderShellVisibility();
}
function renderShellVisibility(): void {
  if (deckEl) deckEl.hidden = state.minimized;
  if (pillEl) {
    pillEl.hidden = !state.minimized;
    updatePill();
  }
}
function updatePill(): void {
  if (!pillEl) return;
  const dot = state.armed ? '<span class="pill-rec"></span>' : '';
  pillEl.innerHTML = `${dot}Take · ${state.events.length} evt`;
  pillEl.title = 'Open the recorder';
}

// ── keyboard ──────────────────────────────────────────────────────────────────
function deckKeyHandler(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName ?? '';
  const isForm = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target?.isContentEditable ?? false);
  if (isForm) return;
  if (e.key === 'Escape') {
    state.selectedId = null;
    renderSelectionRow();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedId) {
      e.preventDefault();
      deleteSelected();
    }
  }
}

export function renderDeck(): void {
  renderLanes();
  renderSelectionRow();
  syncRecordChrome();
  updatePill();
  updateTimeDisplay();
  updatePlayButton();
}

function toast(text: string): void {
  window.dispatchEvent(new CustomEvent('studio.toast', { detail: { kind: 'info', text } }));
}
