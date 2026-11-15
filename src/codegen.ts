// ─── Code generation ─────────────────────────────────────────────────────────
// Song model → strudel code + source spans.
// Spans let a click anywhere in the editor resolve to *what produced it*:
//   kind: which part of the model it came from
//   trackId / fxId: which entity
// Overlapping spans are fine — the editor picks the *smallest* span containing
// the cursor, so the fx value inside its parens wins over the whole fx call.

import type { Song, CodeSpan, Automation } from './types';
import { formatNumber, fxValueCode } from './fx';

export interface GeneratedCode {
  code: string;
  spans: CodeSpan[];
}

const SEP = '╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌';

export function generate(song: Song): GeneratedCode {
  const spans: CodeSpan[] = [];
  let code = '';

  const push = (text: string): number => {
    const from = code.length;
    code += text;
    return from;
  };

  // header
  push(`setcpm(${formatNumber(song.bpm)})\n`);

  const anySolo = song.tracks.some((t) => t.solo);

  for (const track of song.tracks) {
    const audible = !track.muted && (!anySolo || track.solo);
    const silent = !audible;

    push(`\n`);
    // comment header — clicking it selects the whole track
    const nameTag = `// ${SEP.slice(0, 12)} [track:${track.id}] ${track.name}\n`;
    const headerFrom = push(nameTag);
    spans.push({ from: headerFrom, to: headerFrom + nameTag.length - 1, kind: 'track', trackId: track.id });

    const lineFrom = code.length;
    const pieces: string[] = [];
    const lineSpans: CodeSpan[] = [];

    const emit = (text: string, kind?: CodeSpan['kind'], fxId?: string): void => {
      const pos = pieces.join('').length;
      pieces.push(text);
      if (kind) {
        lineSpans.push({ from: lineFrom + pos, to: lineFrom + pos + text.length, kind, trackId: track.id, fxId });
      }
    };

    const chainOpen = silent ? '// $: ' : '$: ';
    emit(chainOpen, 'track');

    if (track.source === 'drums') {
      const pat = sanitize(track.drumPattern);
      emit('sound(', undefined);
      emit(`"${pat}"`, 'drums-pattern');
      emit(')', undefined);
      if (track.sampleIndex > 0) emit(`.n(${formatNumber(track.sampleIndex)})`, 'drums-source');
    } else {
      const pat = sanitize(track.notePattern);
      emit('note(', undefined);
      emit(`"${pat}"`, 'synth-pattern');
      emit(')');
      emit(`.sound("${sanitizeWave(track.wave)}")`, 'synth-source');
      if (track.octave !== 0) emit(`.transpose(${track.octave * 12})`, 'synth-source');
    }

    // fx chain — bypassed fx stay in the model but are not written to the code
    for (const fx of track.fx) {
      if (fx.bypassed) continue;
      const targetParam = fxTargetParam(fx.type);
      const liveAutomation = automationFor(track.automation, targetParam) && !track.automation?.bypassed;
      const value = liveAutomation
        ? signalCode(track.automation as Automation, numericFxBase(fx.value))
        : fxValueCode(fx.type, fx.value);
      const call = `.${fxFn(fx.type)}(${value})`;
      emit(call, 'fx', fx.id);
    }

    // automation that has no matching fx yet: gain is always available
    const gainAutomationActive = track.automation && track.automation.target === 'gain' && !track.automation.bypassed;
    const gainSignal = gainAutomationActive ? signalCode(track.automation as Automation, track.gain) : null;
    const gainValue = gainSignal ?? formatNumber(track.gain);
    {
      const pos = pieces.join('').length;
      pieces.push(`.gain(${gainValue})`);
      const from = lineFrom + pos;
      const to = from + `.gain(${gainValue})`.length;
      spans.push({ from, to, kind: gainSignal ? 'automation' : 'gain', trackId: track.id });
    }

    // automation targeting pan/lpf without the fx present — warn via comment
    if (track.automation && track.automation.target !== 'gain' && !track.automation.bypassed) {
      const present = track.fx.some((fx) => !fx.bypassed && fxTargetParam(fx.type) === track.automation!.target);
      if (!present) {
        pieces.push(` // ⚠ add a ${track.automation.target} effect for the LFO to modulate`);
      }
    }

    if (track.orbit !== null) emit(`.orbit(${formatNumber(track.orbit)})`, 'orbit');

    const line = pieces.join('') + '\n';
    code += line;
    for (const s of lineSpans) spans.push(s);
  }

  return { code, spans };
}

/** smallest span wins when spans overlap (caller relies on this) */
export function spanAt(spans: CodeSpan[], offset: number): CodeSpan | undefined {
  let best: CodeSpan | undefined;
  for (const s of spans) {
    if (offset >= s.from && offset <= s.to) {
      if (!best || s.to - s.from < best.to - best.from) best = s;
    }
  }
  return best;
}

/** map between model fx type and strudel param name it automates */
export function fxTargetParam(fxType: string): 'gain' | 'pan' | 'lpf' | null {
  if (fxType === 'pan') return 'pan';
  if (fxType === 'lpf') return 'lpf';
  return null;
}

function automationFor(automation: Automation | null, param: string | null): boolean {
  return !!automation && !!param && automation.target === param;
}

export function signalCode(a: Automation, base: number): string {
  const wave = a.wave;
  const rate = formatNumber(Math.max(1, a.rate));
  if (a.target === 'gain') {
    const lo = Math.max(0.01, base * (1 - a.depth));
    const hi = Math.min(2, base * (1 + a.depth));
    return `${wave}.slow(${rate}).range(${formatNumber(lo)}, ${formatNumber(hi)})`;
  }
  if (a.target === 'pan') {
    // sweep the full stereo field with depth scaling around base
    const half = a.depth / 2;
    const lo = clamp01ish(base - half);
    const hi = clamp01ish(base + half);
    return `${wave}.slow(${rate}).range(${formatNumber(lo)}, ${formatNumber(hi)})`;
  }
  // lpf — exponential sweep sounds musical
  const half = a.depth;
  const lo = Math.max(40, base / Math.pow(2, half * 4));
  const hi = Math.min(16000, base * Math.pow(2, half * 4));
  return `${wave}.slow(${rate}).rangex(${formatNumber(lo)}, ${formatNumber(hi)})`;
}

function numericFxBase(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 1000;
}

function clamp01ish(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function sanitize(pattern: string): string {
  return pattern.replace(/"/g, "'").trim() || '~';
}

function sanitizeWave(wave: string): string {
  // underscores are valid in strudel sound names (gm_piano, recorder_soprano_sus…)
  const clean = wave.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return clean || 'sawtooth';
}

function fxFn(type: string): string {
  switch (type) {
    case 'delayfb': return 'delayfb';
    default: return type;
  }
}
