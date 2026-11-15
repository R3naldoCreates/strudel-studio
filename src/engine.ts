// ─── Strudel engine host ─────────────────────────────────────────────────────
// Wraps @strudel/web: one init, play/stop/evaluate, scope tap, sample loading.

import {
  initStrudel,
  evaluate as strudelEvaluate,
  hush,
  samples,
  getAudioContext,
  getAnalyserById,
  getAnalyzerData,
  getSuperdoughAudioController,
  getCps,
  getTime,
  superdough,
} from '@strudel/web';
import { registerSoundfonts } from '@strudel/soundfonts';

let initPromise: Promise<void> | null = null;
let samplesPromise: Promise<void> | null = null;
let scopeTapped = false;
let lastError: string | null = null;
let currentPattern: unknown = null;

export interface HapFlash {
  /** absolute char offsets into the evaluated source string */
  locations: { from: number; to: number }[];
  /** glow window in milliseconds */
  durationMs: number;
  /** sound name (drums/synths) or note name (notes), e.g. "bd" / "c3" */
  input: string;
  /** drum-family input (sound name) vs melodic input (note) */
  kind: 'drum' | 'note';
}

type FlashListener = (flash: HapFlash) => void;
const flashListeners = new Set<FlashListener>();

/** subscribe to per-event haps (used by the editor playhead + recorder) */
export function onHapFlash(fn: FlashListener): () => void {
  flashListeners.add(fn);
  return () => flashListeners.delete(fn);
}

export interface ScopeFrame {
  kind: 'time' | 'frequency';
  data: Float32Array;
}

export async function initEngine(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // initStrudel must run inside a user gesture (it creates/resumes AudioContext)
    await initStrudel();
    // GM soundfonts (125 instruments) — registered here; each font is fetched
    // from the web the first time it's played. Registration itself is offline-safe.
    try {
      registerSoundfonts();
    } catch (err) {
      console.warn('[engine] soundfont registration failed (online playback of gm_* will not work)', err);
    }
    samplesPromise = loadBundledSamples();
    listenToLog();
  })();
  return initPromise;
}

async function loadBundledSamples(): Promise<void> {
  try {
    await samples('./samples/uzu-drumkit/strudel.json');
  } catch (err) {
    console.warn('[engine] bundled sample pack failed to load', err);
    lastError = 'Failed to load bundled drum kit';
  }
}

function listenToLog(): void {
  window.addEventListener('strudel.log', ((e: CustomEvent) => {
    const detail = e.detail as { message?: string; type?: string } | undefined;
    if (!detail?.message) return;
    if (detail.type === 'error') {
      lastError = detail.message;
      window.dispatchEvent(new CustomEvent('studio.toast', { detail: { kind: 'error', text: cleanMessage(detail.message) } }));
    }
  }) as EventListener);
}

function cleanMessage(msg: string): string {
  return msg.replace(/^\[[^\]]+\]\s*error:\s*/i, '').slice(0, 220);
}

/** Register (or re-register) a sample map. Passing a blob URL of a strudel.json works. */
export async function registerSampleJson(url: string): Promise<void> {
  await samples(url);
}

/** well-known remote banks from the strudel ecosystem (fetched from the web) */
export const REMOTE_PACK_URLS: Record<string, string> = {
  'vcsl': 'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
  'tidal-drum-machines': 'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json',
  'dirt-samples': 'https://raw.githubusercontent.com/tidalcycles/dirt-samples/master/strudel.json',
  'mridangam': 'https://raw.githubusercontent.com/felixroos/dough-samples/main/mridangam.json',
  'piano': 'https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json',
  'EmuSP12': 'https://raw.githubusercontent.com/felixroos/dough-samples/main/EmuSP12.json',
};

const registeredPacks = new Set<string>();

/**
 * Register a remote bank by id (vcsl / tidal-drum-machines / dirt-samples / …).
 * Idempotent. Resolves when the map is loaded; the sample bytes themselves
 * download lazily on first playback.
 */
export async function registerRemotePack(id: string): Promise<boolean> {
  if (registeredPacks.has(id)) return true;
  const url = REMOTE_PACK_URLS[id];
  if (!url) return false;
  await samples(url);
  registeredPacks.add(id);
  return true;
}

/**
 * Play a one-shot sound right now — the pad trigger path for the recorder deck.
 * Params mirror a strudel hap: { s: 'bd', n: 0 }, { s: 'sawtooth', note: 'c3' }…
 */
export async function triggerOneShot(p: {
  s?: string;
  note?: string;
  n?: number;
  gain?: number;
  wave?: string;
}): Promise<void> {
  await initEngine();
  await samplesPromise;
  const ctx = getAudioContext();
  const params: Record<string, unknown> = { gain: p.gain ?? 0.85 };
  if (p.s) {
    params.s = p.s;
    if (p.n !== undefined) params.n = p.n;
  } else if (p.wave) {
    params.s = p.wave;
  }
  if (p.note) params.note = p.note;
  try {
    await superdough(params as never, ctx.currentTime + 0.03, 0.5, getCps(), getTime());
  } catch (err) {
    console.warn('[engine] one-shot failed', err);
  }
}

/** Evaluate + start (or hot-swap) the pattern. Must be called from a gesture or after one. */
export async function enginePlay(code: string): Promise<void> {
  await initEngine();
  await samplesPromise;
  lastError = null;
  tapScope();
  currentPattern = await strudelEvaluate(code, true);
  startQueryLoop();
}

export function engineStop(): void {
  stopQueryLoop();
  currentPattern = null;
  try {
    hush();
  } catch {
    /* engine not initialised yet — nothing to silence */
  }
}

// The scheduler caches its trigger at construction, so we can't intercept it
// from outside. Instead we poll the pattern's own queryArc on a rAF loop —
// the same data the UI would query — and flash whatever fires.
let queryLoopHandle: number | null = null;
const recentFlashKeys = new Map<string, number>();

function startQueryLoop(): void {
  stopQueryLoop();
  const tick = (): void => {
    if (!currentPattern) {
      queryLoopHandle = null;
      return; // stopped — engineStop nulls the pattern
    }
    try {
      const now = getTime();
      const pattern = currentPattern as {
        queryArc?: (from: number, to: number) => unknown[];
      };
      const haps = pattern.queryArc?.(Math.max(0, now - 0.05), now + 0.22) ?? [];
      const cps = safeCps();
      const nowMs = performance.now();
      for (const hap of haps) {
        const hasOnset = (hap as { hasOnset?: () => boolean })?.hasOnset;
        if (typeof hasOnset === 'function' && !hasOnset.call(hap)) continue;
        const locations = extractLocations(hap);
        if (locations.length === 0) continue;
        const whole = (hap as { whole?: { begin?: unknown; duration?: unknown } }).whole;
        const begin = String(whole?.begin ?? '');
        const durationCycles = Number(whole?.duration) || 0.25;
        const value = (hap as { value?: Record<string, unknown> }).value ?? {};
        const input = String(value.note ?? value.s ?? '?');
        const kind: HapFlash['kind'] = value.note !== undefined ? 'note' : 'drum';
        const key = `${begin}|${locations.map((l) => `${l.from}-${l.to}`).join(',')}`;
        const last = recentFlashKeys.get(key);
        const glowMs = Math.min(1100, Math.max(140, (durationCycles / cps) * 1000));
        if (last !== undefined && nowMs - last < glowMs * 0.8) continue;
        recentFlashKeys.set(key, nowMs);
        const flash: HapFlash = { locations, durationMs: glowMs, input, kind };
        for (const listener of flashListeners) listener(flash);
      }
      if (recentFlashKeys.size > 600) {
        for (const [k, v] of recentFlashKeys) {
          if (nowMs - v > 5000) recentFlashKeys.delete(k);
        }
      }
    } catch {
      /* transient query failure — skip this frame */
    }
  };
  // setInterval keeps firing when the window is hidden (rAF does not)
  queryLoopHandle = window.setInterval(tick, 33);
}

function stopQueryLoop(): void {
  recentFlashKeys.clear();
  if (queryLoopHandle !== null) {
    window.clearInterval(queryLoopHandle);
    queryLoopHandle = null;
  }
}

function extractLocations(hap: unknown): { from: number; to: number }[] {
  const locs = (hap as { context?: { locations?: unknown } })?.context?.locations;
  if (!Array.isArray(locs)) return [];
  const out: { from: number; to: number }[] = [];
  for (const entry of locs) {
    if (!entry) continue;
    if (Array.isArray(entry) && entry.length >= 2) {
      const from = Number(entry[0]);
      const to = Number(entry[1]);
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) out.push({ from, to });
      continue;
    }
    const e = entry as { start?: unknown; end?: unknown; from?: unknown; to?: unknown };
    const from = Number(e.start ?? e.from);
    const to = Number(e.end ?? e.to);
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) out.push({ from, to });
  }
  return out;
}

function safeCps(): number {
  try {
    const c = getCps();
    return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : 0.5;
  } catch {
    return 0.5;
  }
}

/** Hard reset of global effects (room/delay sends etc.) — used on “HUSH”. */
export function enginePanic(): void {
  engineStop();
}

export function engineLastError(): string | null {
  return lastError;
}

function tapScope(): void {
  if (scopeTapped) return;
  try {
    const ctx = getAudioContext();
    const controller = getSuperdoughAudioController() as unknown as {
      output?: { destinationGain?: AudioNode };
    };
    const destinationGain = controller?.output?.destinationGain;
    if (!destinationGain) return;
    const analyser = getAnalyserById('studio-scope', 2048, 0.82);
    destinationGain.connect(analyser as unknown as AudioNode);
    scopeTapped = true;
    void ctx; // keep ref
  } catch (err) {
    console.warn('[engine] scope tap failed', err);
  }
}

/** Pull a scope frame, or null if the analyser isn't ready. */
export function readScope(kind: 'time' | 'frequency'): ScopeFrame | null {
  if (!scopeTapped) return null;
  try {
    const data = getAnalyzerData(kind, 'studio-scope') as Float32Array;
    return { kind, data };
  } catch {
    return null;
  }
}

// ── sample waveform decoding ─────────────────────────────────────────────────
let decoder: AudioContext | null = null;
const peaksCache = new Map<string, Float32Array>();

/** Fetch + decode a sample URL, reduce to `buckets` min/max peak pairs. */
export async function decodePeaks(url: string, buckets = 220): Promise<Float32Array> {
  const cacheKey = `${url}#${buckets}`;
  const cached = peaksCache.get(cacheKey);
  if (cached) return cached;
  if (!decoder) decoder = new AudioContext();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
  const buf = await decoder.decodeAudioData(await res.arrayBuffer());
  const channel = buf.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / buckets));
  const peaks = new Float32Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    const start = b * block;
    let min = 1, max = -1;
    for (let i = start; i < Math.min(start + block, channel.length); i += 16) {
      const v = channel[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
  }
  peaksCache.set(cacheKey, peaks);
  return peaks;
}
