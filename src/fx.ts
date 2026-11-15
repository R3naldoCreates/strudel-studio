// ─── FX catalogue ────────────────────────────────────────────────────────────
// Every entry maps one inspector control → one Strudel modifier call.
// Numeric params interpolate directly; enum params emit a quoted string.

export interface FxParamDef {
  /** strudel modifier name, e.g. 'lpf' → .lpf(x) */
  fn: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
  def: number;
  step?: number;
  /** use a logarithmic slider (for frequencies) */
  log?: boolean;
  /** decimal places shown */
  dp?: number;
}

export interface FxDef {
  type: string;
  label: string;
  /** single numeric param via value, or enum param via enumValues */
  params?: FxParamDef[];
  enumValues?: string[];
  defEnum?: string;
  /** strudel fn when params is empty (rare) */
  fn?: string;
  def?: number | string;
  group: 'filter' | 'space' | 'texture' | 'time';
  hint: string;
}

export const FX_CATALOG: FxDef[] = [
  {
    type: 'lpf', label: 'Low-Pass Filter', group: 'filter',
    params: [{ fn: 'lpf', label: 'Cutoff', unit: 'Hz', min: 20, max: 16000, def: 1200, log: true, dp: 0 }],
    hint: 'Cuts highs above the cutoff frequency. The #1 tone-shaping move.',
  },
  {
    type: 'lpq', label: 'Low-Pass Resonance', group: 'filter',
    params: [{ fn: 'lpq', label: 'Q', min: 0, max: 40, def: 8, step: 0.1, dp: 1 }],
    hint: 'Boosts frequencies right at the cutoff. Self-oscillates when pushed.',
  },
  {
    type: 'hpf', label: 'High-Pass Filter', group: 'filter',
    params: [{ fn: 'hpf', label: 'Cutoff', unit: 'Hz', min: 20, max: 16000, def: 180, log: true, dp: 0 }],
    hint: 'Cuts lows below the cutoff. Great for thinning hats and basses.',
  },
  {
    type: 'pan', label: 'Pan', group: 'space',
    params: [{ fn: 'pan', label: 'Position', min: 0, max: 1, def: 0.5, step: 0.01, dp: 2 }],
    hint: '0 = hard left, 0.5 = center, 1 = hard right. Try automating it!',
  },
  {
    type: 'room', label: 'Reverb (room)', group: 'space',
    params: [{ fn: 'room', label: 'Amount', min: 0, max: 8, def: 2, step: 0.1, dp: 1 }],
    hint: 'Convolution reverb send. 0 = dry, higher = wetter space.',
  },
  {
    type: 'delay', label: 'Delay', group: 'time',
    params: [{ fn: 'delay', label: 'Amount', min: 0, max: 1, def: 0.28, step: 0.01, dp: 2 }],
    hint: 'Echo send amount.',
  },
  {
    type: 'delayfb', label: 'Delay Feedback', group: 'time',
    params: [{ fn: 'delayfb', label: 'Feedback', min: 0, max: 1, def: 0.45, step: 0.01, dp: 2 }],
    hint: 'How much the echo repeats itself.',
  },
  {
    type: 'shape', label: 'Distortion (shape)', group: 'texture',
    params: [{ fn: 'shape', label: 'Amount', min: 0, max: 1, def: 0.2, step: 0.01, dp: 2 }],
    hint: 'Waveshaping distortion. Warmth → crunch → mayhem.',
  },
  {
    type: 'crush', label: 'Bitcrush', group: 'texture',
    params: [{ fn: 'crush', label: 'Bits', min: 2, max: 16, def: 10, step: 1, dp: 0 }],
    hint: 'Lowers bit-depth. 16 = clean, 4 = lo-fi, 2 = garbage (glorious).',
  },
  {
    type: 'coarse', label: 'Coarse', group: 'texture',
    params: [{ fn: 'coarse', label: 'Factor', min: 1, max: 32, def: 3, step: 1, dp: 0 }],
    hint: 'Sample-rate reduction. Metallic, digital grit.',
  },
  {
    type: 'speed', label: 'Speed', group: 'time',
    params: [{ fn: 'speed', label: 'Rate', min: 0.125, max: 4, def: 1, step: 0.125, dp: 3 }],
    hint: 'Playback speed of samples. <1 = deeper & slower, >1 = higher & faster.',
  },
  {
    type: 'vowel', label: 'Vowel Filter', group: 'filter',
    enumValues: ['a', 'e', 'i', 'o', 'u'], defEnum: 'o',
    hint: 'Formant filter — makes synths and noise talk through vowel shapes.',
  },
];

export const FX_MAP: Record<string, FxDef> = Object.fromEntries(FX_CATALOG.map((f) => [f.type, f]));

export function fxDefault(def: FxDef): number | string {
  if (def.enumValues) return def.defEnum ?? def.enumValues[0];
  return def.params?.[0]?.def ?? 1;
}

/** Format a value for code output. */
export function fxValueCode(fxType: string, value: number | string): string {
  const def = FX_MAP[fxType];
  if (def?.enumValues) return `"${value}"`;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '0';
  return formatNumber(n);
}

export function formatNumber(n: number): string {
  if (Object.is(n, -0)) n = 0;
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
}
