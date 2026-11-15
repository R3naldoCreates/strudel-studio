// Type stub for @strudel/soundfonts (ships no .d.ts)
declare module '@strudel/soundfonts' {
  /** Registers every gm_* instrument with superdough. Soundfonts themselves are
   *  fetched lazily from the web on first use (felixroos.github.io/webaudiofontdata). */
  export function registerSoundfonts(): void;
}
