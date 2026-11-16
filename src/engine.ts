// ─── Strudel engine host ─────────────────────────────────────────────────────
// Wraps @strudel/web: one init, play/stop/evaluate, scope tap, sample loading.

import {
  initStrudel,
  evaluate as strudelEvaluate,
  hush,
  samples,
  aliasBank,
  getAudioContext,
  getAnalyserById,
  getAnalyzerData,
  getSuperdoughAudioController,
  getCps,
  getTime,
  superdough,
} from '@strudel/web';
import { registerGMInstruments } from './soundfonts';

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
    // GM soundfonts (125 instruments) — registered into the engine's OWN sound
    // map (via @strudel/web primitives, see soundfonts.ts); each font streams
    // from the webaudiofontdata CDN on first play.
    try {
      registerGMInstruments();
    } catch (err) {
      console.warn('[engine] soundfont registration failed (online playback of gm_* will not work)', err);
    }
    samplesPromise = Promise.all([loadBundledSamples(), loadRemotePacks()]).then(([, failed]) => {
      if (failed.length) {
        console.warn('[engine] instrument packs unavailable (needs internet):', failed);
      }
    });
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

/**
 * The packs strudel.cc prebakes by default — the banks Bakery examples assume.
 * Every map registers by name only; the audio bytes download lazily on first
 * play. Any failure is non-fatal (offline = those sounds stay silent).
 */
const DIRT_SAMPLES: Record<string, string[]> = {
  casio: ['casio/high.wav', 'casio/low.wav', 'casio/noise.wav'],
  crow: ['crow/000_crow.wav', 'crow/001_crow2.wav', 'crow/002_crow3.wav', 'crow/003_crow4.wav'],
  insect: ['insect/000_everglades_conehead.wav', 'insect/001_robust_shieldback.wav', 'insect/002_seashore_meadow_katydid.wav'],
  wind: [
    'wind/000_wind1.wav', 'wind/001_wind10.wav', 'wind/002_wind2.wav', 'wind/003_wind3.wav', 'wind/004_wind4.wav',
    'wind/005_wind5.wav', 'wind/006_wind6.wav', 'wind/007_wind7.wav', 'wind/008_wind8.wav', 'wind/009_wind9.wav',
  ],
  jazz: [
    'jazz/000_BD.wav', 'jazz/001_CB.wav', 'jazz/002_FX.wav', 'jazz/003_HH.wav', 'jazz/004_OH.wav',
    'jazz/005_P1.wav', 'jazz/006_P2.wav', 'jazz/007_SN.wav',
  ],
  metal: [
    'metal/000_0.wav', 'metal/001_1.wav', 'metal/002_2.wav', 'metal/003_3.wav', 'metal/004_4.wav',
    'metal/005_5.wav', 'metal/006_6.wav', 'metal/007_7.wav', 'metal/008_8.wav', 'metal/009_9.wav',
  ],
  east: [
    'east/000_nipon_wood_block.wav', 'east/001_ohkawa_mute.wav', 'east/002_ohkawa_open.wav', 'east/003_shime_hi.wav',
    'east/004_shime_hi_2.wav', 'east/005_shime_mute.wav', 'east/006_taiko_1.wav', 'east/007_taiko_2.wav', 'east/008_taiko_3.wav',
  ],
  space: [
    'space/000_0.wav', 'space/001_1.wav', 'space/002_11.wav', 'space/003_12.wav', 'space/004_13.wav', 'space/005_14.wav',
    'space/006_15.wav', 'space/007_16.wav', 'space/008_17.wav', 'space/009_18.wav', 'space/010_2.wav', 'space/011_3.wav',
    'space/012_4.wav', 'space/013_5.wav', 'space/014_6.wav', 'space/015_7.wav', 'space/016_8.wav', 'space/017_9.wav',
  ],
  numbers: [
    'numbers/0.wav', 'numbers/1.wav', 'numbers/2.wav', 'numbers/3.wav', 'numbers/4.wav',
    'numbers/5.wav', 'numbers/6.wav', 'numbers/7.wav', 'numbers/8.wav',
  ],
  num: [
    'num/00.wav', 'num/01.wav', 'num/02.wav', 'num/03.wav', 'num/04.wav', 'num/05.wav', 'num/06.wav', 'num/07.wav', 'num/08.wav', 'num/09.wav',
    'num/10.wav', 'num/11.wav', 'num/12.wav', 'num/13.wav', 'num/14.wav', 'num/15.wav', 'num/16.wav', 'num/17.wav', 'num/18.wav', 'num/19.wav', 'num/20.wav',
  ],
};

const CDN = 'https://strudel.b-cdn.net';

export interface PackInfo {
  id: string;
  label: string;
  status: 'ok' | 'failed';
}

interface PackDef {
  id: string;
  label: string;
  url?: string;
  inline?: Record<string, string[]>;
  base: string;
  options?: { tag?: string };
}

const PACK_DEFS: PackDef[] = [
  { id: 'uzu-wavetables', label: 'uzu-wavetables (synth wavetables)', url: `${CDN}/uzu-wavetables.json`, base: `${CDN}/uzu-wavetables/` },
  { id: 'drum-machines', label: 'tidal-drum-machines (683 machine kits)', url: `${CDN}/tidal-drum-machines.json`, base: `${CDN}/tidal-drum-machines/machines/`, options: { tag: 'drum-machines' } },
  { id: 'vcsl', label: 'VCSL (orchestral & world instruments)', url: `${CDN}/vcsl.json`, base: `${CDN}/VCSL/` },
  { id: 'mridangam', label: 'mridangam', url: `${CDN}/mridangam.json`, base: `${CDN}/mrid/`, options: { tag: 'drum-machines' } },
  { id: 'piano', label: 'Salamander grand piano', url: `${CDN}/piano.json`, base: `${CDN}/piano/` },
  { id: 'dirt-samples', label: 'dirt-samples (classic drum & perc names)', inline: DIRT_SAMPLES, base: `${CDN}/Dirt-Samples/` },
];

/** registration outcome per pack — populated by loadRemotePacks() */
const packStatus: Record<string, 'ok' | 'failed'> = {};

/** register the remote banks; returns the ids of the ones that failed */
async function loadRemotePacks(): Promise<string[]> {
  await Promise.allSettled(
    PACK_DEFS.map(async (pack) => {
      try {
        await samples(pack.inline ?? pack.url!, pack.base, { ...pack.options, prebake: true });
        packStatus[pack.id] = 'ok';
      } catch (err) {
        console.warn(`[engine] pack ${pack.id} failed (needs internet)`, err);
        packStatus[pack.id] = 'failed';
      }
    }),
  );
  try {
    await aliasBank(`${CDN}/tidal-drum-machines-alias.json`);
  } catch (err) {
    console.warn('[engine] drum-machine alias map failed', err);
    packStatus['drum-machines-alias'] = 'failed';
  }
  return PACK_DEFS.filter((p) => packStatus[p.id] === 'failed').map((p) => p.id);
}

/** packs that failed to register (offline at first play, blocked CDN, …) */
export function remotePackFailures(): PackInfo[] {
  return PACK_DEFS.filter((p) => packStatus[p.id] === 'failed').map((p) => ({
    id: p.id,
    label: p.label,
    status: 'failed',
  }));
}

/** re-attempt registration of one pack — used by the paste-import dialog */
export async function retryRemotePack(id: string): Promise<boolean> {
  const pack = PACK_DEFS.find((p) => p.id === id);
  if (!pack) return false;
  try {
    await samples(pack.inline ?? pack.url!, pack.base, { ...pack.options, prebake: true });
    packStatus[pack.id] = 'ok';
    if (id === 'drum-machines') {
      try {
        await aliasBank(`${CDN}/tidal-drum-machines-alias.json`);
        delete packStatus['drum-machines-alias'];
      } catch {
        packStatus['drum-machines-alias'] = 'failed';
      }
    }
    return true;
  } catch {
    packStatus[pack.id] = 'failed';
    return false;
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
