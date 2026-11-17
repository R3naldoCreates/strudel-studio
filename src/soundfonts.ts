// ─── GM soundfonts registered into the ENGINE's sound map ─────────────────────
// @strudel/web's dist bundle carries its OWN copy of superdough, so calling
// registerSoundfonts() from the @strudel/soundfonts npm package landed the 125
// gm_* instruments in a *different* sound map and the engine never found them
// ("[getTrigger] error: sound gm_piano not found").
// This module mirrors that package's loader/register algorithm — same felixroos
// webaudiofontdata CDN, same zone/buffer loat — but imports every primitive
// from @strudel/web so the fonts land in the same map the engine reads.
import {
  getADSRValues,
  getParamADSR,
  getPitchEnvelope,
  getVibratoOscillator,
  getAudioContext,
  getSoundIndex,
  noteToMidi,
  freqToMidi,
  registerSound,
  onceEnded,
  releaseAudioNode,
} from '@strudel/web';
import gm from '@strudel/soundfonts/gm.mjs';

const FONT_BASE = 'https://felixroos.github.io/webaudiofontdata/sound';

import { parseFontZones, type GmZone } from './fontData';

type GmMap = Record<string, string[]>;
const instruments = gm as unknown as GmMap;

const fontUrl = (name: string): string => `${FONT_BASE}/${name}.js`;

// font files are `console.log(...); var _tone_x={ zones:[ ... ] };` — parsed
// as a data literal, never executed (see fontData.ts).
const loadCache = new Map<string, Promise<GmZone[]>>();
function loadFont(name: string): Promise<GmZone[]> {
  const cached = loadCache.get(name);
  if (cached) return cached;
  const load = (async () => {
    const res = await fetch(fontUrl(name));
    if (!res.ok) throw new Error(`font ${name}: ${res.status}`);
    return parseFontZones(await res.text());
  })();
  loadCache.set(name, load);
  return load;
}

const bufferCache = new Map<string, Promise<{ buffer: AudioBuffer; zone: GmZone }>>();
async function getBuffer(zone: GmZone, ctx: AudioContext): Promise<AudioBuffer> {
  if (zone.sample) {
    // base64 16-bit PCM
    const f = atob(zone.sample);
    const buffer = ctx.createBuffer(1, Math.floor(f.length / 2), zone.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < f.length / 2; i++) {
      let a = f.charCodeAt(i * 2);
      let b = f.charCodeAt(i * 2 + 1);
      if (a < 0) a += 256;
      if (b < 0) b += 256;
      let v = b * 256 + a;
      if (v >= 65536 / 2) v -= 65536;
      ch[i] = v / 65536;
    }
    return buffer;
  }
  if (zone.file) {
    const f = zone.file.length;
    const bytes = new Uint8Array(f);
    const n = atob(zone.file);
    for (let i = 0; i < f; i++) bytes[i] = n.charCodeAt(i);
    return new Promise((resolve) => ctx.decodeAudioData(bytes.buffer as ArrayBuffer, resolve));
  }
  throw new Error('soundfont zone has neither sample nor file');
}

function getFontPitch(fontName: string, midi: number, ctx: AudioContext) {
  const key = `${fontName}:::${midi}`;
  const cached = bufferCache.get(key);
  if (cached) return cached;
  const load = (async () => {
    const zones = await loadFont(fontName);
    const zone = zones.find((z) => z.keyRangeLow <= midi && z.keyRangeHigh + 1 >= midi);
    if (!zone) throw new Error(`no zone in ${fontName} for pitch ${midi}`);
    const buffer = await getBuffer(zone, ctx);
    return { buffer, zone };
  })();
  bufferCache.set(key, load);
  return load;
}

async function getFontBufferSource(fontName: string, hapValue: Record<string, unknown>, ctx: AudioContext) {
  const note = hapValue.note as string | number | undefined;
  const freq = hapValue.freq as number | undefined;
  let midi: number;
  if (freq !== undefined && Number.isFinite(freq)) {
    midi = freqToMidi(freq);
  } else if (typeof note === 'number') {
    midi = note;
  } else {
    midi = noteToMidi(String(note ?? 'c3'));
  }
  const { buffer, zone } = await getFontPitch(fontName, midi, ctx);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const root = zone.originalPitch - 100 * zone.coarseTune - zone.fineTune;
  src.playbackRate.value = Math.pow(2, (100 * midi - root) / 1200);
  if (zone.loopStart > 1 && zone.loopStart < zone.loopEnd) {
    src.loop = true;
    src.loopStart = zone.loopStart / zone.sampleRate;
    src.loopEnd = zone.loopEnd / zone.sampleRate;
  }
  return src;
}

/**
 * Register all 125 gm_* instruments with the engine. Call once at init.
 * Font data itself streams in on first play (never bundled), exactly like
 * strudel.cc — the app stays offline for its bundled sounds.
 */
export function registerGMInstruments(): void {
  for (const [name, fonts] of Object.entries(instruments)) {
    registerSound(
      name,
      async (time: number, hapValue: Record<string, unknown>, onEnded: () => void) => {
        const [attack, decay, sustain, release] = getADSRValues([
          hapValue.attack as number | undefined,
          hapValue.decay as number | undefined,
          hapValue.sustain as number | undefined,
          hapValue.release as number | undefined,
        ]);
        const duration = (hapValue.duration as number | undefined) ?? 1;
        const fontName = fonts[getSoundIndex(hapValue.n as number | undefined, fonts.length)];
        const ctx = getAudioContext();
        const src = await getFontBufferSource(fontName, hapValue, ctx);
        src.start(time);
        const gain = ctx.createGain();
        src.connect(gain);
        const stop = time + duration;
        getParamADSR(gain.gain, attack, decay, sustain, release, 0, 0.3, time, stop, 'linear');
        const end = stop + release + 0.01;
        const vib = getVibratoOscillator(src.detune, hapValue, time) as
          | { stop: (t: number) => void; nodes?: Record<string, AudioNode[]> }
          | undefined;
        getPitchEnvelope(src.detune, hapValue, time, stop);
        src.stop(end);
        const noop = () => undefined;
        onceEnded(src, () => {
          releaseAudioNode(src);
          vib?.stop(end);
          onEnded();
        });
        return { node: gain, stop: noop, nodes: { source: [src], ...(vib?.nodes ?? {}) } };
      },
      { type: 'soundfont', prebake: true, fonts },
    );
  }
}
