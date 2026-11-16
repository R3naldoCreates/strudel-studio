// ─── Song model ──────────────────────────────────────────────────────────────
// The song model is the single source of truth. The editor shows code that is
// *generated* from this model (see codegen.ts). Every track maps to one `$:`
// block in the generated code.

export type AutomationWave = 'sine' | 'saw' | 'isaw' | 'tri' | 'square' | 'rand' | 'perlin';
export type AutomationTarget = 'gain' | 'pan' | 'lpf';

export interface Automation {
  target: AutomationTarget;
  wave: AutomationWave;
  /** slow() factor — 1 = every cycle, 8 = one sweep per 8 cycles */
  rate: number;
  /** 0..1, amplitude of the modulation relative to the base value */
  depth: number;
  /** bypassed = kept in the model but not written into the code (a “muted effect”) */
  bypassed?: boolean;
}

export type TrackKind = 'drums' | 'bass' | 'lead' | 'pad' | 'arp' | 'keys';

export interface FxEntry {
  id: string;
  /** key into FX_CATALOG */
  type: string;
  /** numeric value – or string for enum params like vowel */
  value: number | string;
  /** bypassed = kept in the chain in the inspector but not written into the code */
  bypassed?: boolean;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  /** source type — how the track makes sound */
  source: 'drums' | 'synth';
  /** drums: mini-notation of sound names, e.g. "bd hh*2 sd hh" */
  drumPattern: string;
  /** drums: sample bank name used for sound(), e.g. uzu-drumkit sounds live in the sound map */
  drumBank: string;
  /** drums: sample variation index n */
  sampleIndex: number;
  /** synth: mini-notation of note names, e.g. "c3 ~ e3 g3" */
  notePattern: string;
  /** synth: oscillator wave / sound name, e.g. sawtooth */
  wave: string;
  /** synth: octave shift applied with .octave() */
  octave: number;
  /** common */
  gain: number;
  muted: boolean;
  solo: boolean;
  orbit: number | null;
  fx: FxEntry[];
  automation: Automation | null;
  color: string;
}

export interface Song {
  formatVersion: 1;
  name: string;
  bpm: number;
  tracks: Track[];
  /**
   * verbatim one-line samples(...) calls baked from pasted imports — emitted
   * at the top of the generated code so the banks exist at play time.
   */
  extraSampleCalls?: string[];
}

export type SelectionKind =
  | 'none'
  | 'track'
  | 'drums-source'
  | 'drums-pattern'
  | 'synth-source'
  | 'synth-pattern'
  | 'gain'
  | 'automation'
  | 'fx'
  | 'orbit';

export interface Selection {
  kind: SelectionKind;
  trackId?: string;
  /** set for kind === 'fx' */
  fxId?: string;
}

export interface CodeSpan {
  from: number;
  to: number;
  kind: Exclude<SelectionKind, 'none'>;
  trackId: string;
  fxId?: string;
}

export const TRACK_COLORS: Record<TrackKind, string> = {
  drums: '#ff9f43',
  bass: '#b6ff3b',
  lead: '#35e0ff',
  pad: '#ff3ea5',
  arp: '#ffd166',
  keys: '#c792ea',
};

export function makeTrack(kind: TrackKind, partial: Partial<Track>): Track {
  const id = partial.id ?? `${kind}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: partial.name ?? kindName(kind),
    kind,
    source: partial.source ?? (kind === 'drums' ? 'drums' : 'synth'),
    drumPattern: partial.drumPattern ?? 'bd hh sd hh',
    drumBank: partial.drumBank ?? 'default',
    sampleIndex: partial.sampleIndex ?? 0,
    notePattern: partial.notePattern ?? 'c3 e3 g3 b3',
    wave: partial.wave ?? 'sawtooth',
    octave: partial.octave ?? 0,
    gain: partial.gain ?? 0.8,
    muted: partial.muted ?? false,
    solo: partial.solo ?? false,
    orbit: partial.orbit ?? null,
    fx: partial.fx ?? [],
    automation: partial.automation ?? null,
    color: partial.color ?? TRACK_COLORS[kind],
  };
}

export function kindName(kind: TrackKind): string {
  switch (kind) {
    case 'drums': return 'Drums';
    case 'bass': return 'Bass';
    case 'lead': return 'Lead';
    case 'pad': return 'Pad';
    case 'arp': return 'Arp';
    case 'keys': return 'Keys';
  }
}

let fxCounter = 0;
export function makeFx(type: string, value?: number | string, def?: number | string): FxEntry {
  fxCounter += 1;
  return { id: `fx-${Date.now().toString(36)}-${fxCounter}`, type, value: value ?? def ?? 1 };
}

export function emptySong(): Song {
  return { formatVersion: 1, name: 'Untitled Song', bpm: 132, tracks: [] };
}
