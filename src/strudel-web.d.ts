/** @strudel/web ships no type declarations — declare the surface we use. */
declare module '@strudel/web' {
  export const initStrudel: (options?: Record<string, unknown>) => Promise<unknown>;
  export const evaluate: (code: string, autoplay?: boolean) => Promise<unknown>;
  export const hush: () => void;
  export const samples: (
    source: string | Record<string, string[] | string>,
    base?: string,
    options?: { prebake?: boolean; tag?: string },
  ) => Promise<unknown>;
  export const aliasBank: (url: string) => Promise<unknown>;
  export const registerSound: (
    name: string,
    onTrigger: (time: number, hapValue: Record<string, unknown>, onEnded: () => void) => Promise<{
      node: AudioNode;
      stop: (t: number) => void;
      nodes?: Record<string, AudioNode[]>;
    }>,
    data?: Record<string, unknown>,
  ) => void;
  export const getADSRValues: (values: (number | undefined)[], mode?: string, fallback?: number[]) => [number, number, number, number];
  export const getParamADSR: (
    param: AudioParam,
    attack: number,
    decay: number,
    sustain: number,
    release: number,
    min: number,
    max: number,
    time: number,
    stop: number,
    curve?: string,
  ) => void;
  export const getPitchEnvelope: (detune: AudioParam, hapValue: Record<string, unknown>, time: number, stop: number) => void;
  export const getVibratoOscillator: (
    detune: AudioParam,
    hapValue: Record<string, unknown>,
    time: number,
  ) => { stop: (t?: number) => void; nodes?: Record<string, AudioNode[]> } | undefined;
  export const getAudioContext: () => AudioContext;
  export const getSoundIndex: (n: number | undefined, length: number) => number;
  export const noteToMidi: (note: string | number) => number;
  export const freqToMidi: (freq: number) => number;
  export const onceEnded: (node: AudioBufferSourceNode, fn: () => void) => void;
  export const releaseAudioNode: (node: AudioNode) => void;
  export const getAnalyserById: (id: string, fftSize?: number, smoothing?: number) => AnalyserNode & { disconnect: () => void };
  export const getAnalyzerData: (kind: 'time' | 'frequency', id: string) => Float32Array;
  export const getSuperdoughAudioController: () => unknown;
  export const getCps: () => number;
  export const getTime: () => number;
  export const setCpsFunc: (fn: () => number) => void;
  export const getTriggerFunc: () => unknown;
  export const setTriggerFunc: (fn: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const superdough: (params: any, time: number, begin: number, cps: number, beginCycle: number) => Promise<void>;
}
