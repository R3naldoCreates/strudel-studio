/** @strudel/web ships no type declarations — declare the surface we use. */
declare module '@strudel/web' {
  export const initStrudel: (options?: Record<string, unknown>) => Promise<unknown>;
  export const evaluate: (code: string, autoplay?: boolean) => Promise<unknown>;
  export const hush: () => void;
  export const samples: (source: string | Record<string, string[] | string>, base?: string) => Promise<unknown>;
  export const getAudioContext: () => AudioContext;
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
