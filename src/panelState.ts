// ─── Left-sidebar persistence: collapse state, favorites, custom notation ────
// localStorage keys:
//   strudel-studio.panel.v1     — { [groupId]: boolean (open?) }
//   strudel-studio.favs.v1      — string[] of favorited entity ids
//   strudel-studio.notation.v1  — [{ id, syntax, name, desc }] user-added rows

const PANEL_KEY = 'strudel-studio.panel.v1';
const FAVS_KEY = 'strudel-studio.favs.v1';
const NOTATION_KEY = 'strudel-studio.notation.v1';

// ── collapse state ────────────────────────────────────────────────────────────
function readPanelMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PANEL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** is a collapsible group open? falls back to `defaultOpen` */
export function isGroupOpen(id: string, defaultOpen: boolean): boolean {
  const map = readPanelMap();
  return id in map ? map[id] : defaultOpen;
}

export function setGroupOpen(id: string, open: boolean): void {
  const map = readPanelMap();
  map[id] = open;
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

// ── favorites ─────────────────────────────────────────────────────────────────
export type FavoriteKind = 'block' | 'instrument' | 'notation' | 'preset';

function readFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function isFavorite(id: string): boolean {
  return readFavs().includes(id);
}

/** toggle favorite; returns the new state */
export function toggleFavorite(id: string): boolean {
  const favs = readFavs();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
  } catch {
    /* quota */
  }
  return idx < 0;
}

// ── custom cheat-sheet notation entries ───────────────────────────────────────
export interface CustomNotation {
  id: string;
  syntax: string;
  name: string;
  desc: string;
}

export function loadCustomNotation(): CustomNotation[] {
  try {
    const raw = localStorage.getItem(NOTATION_KEY);
    const arr = raw ? (JSON.parse(raw) as CustomNotation[]) : [];
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.syntax === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCustomNotation(entries: CustomNotation[]): void {
  try {
    localStorage.setItem(NOTATION_KEY, JSON.stringify(entries));
  } catch {
    /* quota */
  }
}

// ── mini-notation cheat sheet content (verified against strudel.cc docs) ─────
export interface NotationEntry {
  id: string;
  syntax: string;
  name: string;
  desc: string;
  /** JS expressions (functions, whole calls) — reference only, never append to a pattern */
  codeOnly?: boolean;
}
export interface NotationGroup {
  id: string;
  title: string;
  items: NotationEntry[];
}

export const NOTATION_GROUPS: NotationGroup[] = [
  {
    id: 'commonly-used',
    title: 'Commonly Used',
    items: [
      { id: 'n-seq', syntax: 'bd sd hh', name: 'sequence', desc: 'Space-separated events share one cycle — the basic way to write a rhythm' },
      { id: 'n-rest', syntax: '~', name: 'rest', desc: 'One step of silence; add space where a sound would be' },
      { id: 'n-mul', syntax: 'bd*4', name: 'multiply *', desc: 'Play four times per cycle — the classic four-on-the-floor kick' },
      { id: 'n-nest', syntax: '[bd sd]', name: 'nest [ ]', desc: 'Squeeze two events into one step of the outer pattern' },
      { id: 'n-alt', syntax: '<c4 eb4 g4>', name: 'alternate < >', desc: 'One event per cycle — add notes without changing the cycle length' },
      { id: 'n-stack', syntax: 'bd, hh*4', name: 'stack ,', desc: 'Play both patterns at the same time; with notes it makes chords' },
      { id: 'n-eucl', syntax: 'bd(3,8)', name: 'euclidean', desc: 'Three hits spread over eight steps — the pop clave' },
      { id: 'n-chord', syntax: '[c4,eb4,g4]', name: 'chord', desc: 'Comma-separated notes inside brackets play together' },
      { id: 'n-div', syntax: '[c4 eb4 g4]/2', name: 'divide /', desc: 'Stretch a pattern over two cycles' },
      { id: 'n-weight', syntax: 'c4@2', name: 'weight @', desc: 'Hold this event twice as long as its neighbours' },
      { id: 'n-rep', syntax: 'c4!3', name: 'replicate !', desc: 'Repeat three times without speeding the pattern up' },
      { id: 'n-rand', syntax: 'hh?0.2', name: 'drop chance ?', desc: '20% chance this event is removed — humanises hats' },
      { id: 'n-choose', syntax: 'bd | sd | hh', name: 'choose |', desc: 'Pick one of these events at random each time' },
      { id: 'n-slider', syntax: 'slider(0.5, 0, 1)', name: 'live slider', desc: 'Strudel JavaScript — paste into the code, e.g. gain(slider(0.5, 0, 1)). Not mini-notation.', codeOnly: true },
    ],
  },
  {
    id: 'seq-brackets',
    title: 'Sequencing & Brackets',
    items: [
      { id: 'n-seq-full', syntax: 'c e g b', name: 'sequence', desc: 'Four events squashed into one cycle — adding notes speeds them up' },
      { id: 'n-nest-deep', syntax: 'e5 [b4 c5] d5', name: 'nesting', desc: 'Brackets subdivide one step; they nest to any depth' },
      { id: 'n-alt-bracket', syntax: '<e5 b4 d5 c5>', name: 'angle brackets', desc: 'One event per cycle — the same as [e5 b4 d5 c5]/4' },
      { id: 'n-alt-many', syntax: '<c4 e4 g4 b4 d5>*8', name: 'notes per cycle', desc: 'Angle brackets with *N play N notes every cycle' },
      { id: 'n-chord-bracket', syntax: '[g3,b3,e4]', name: 'chord', desc: 'Comma-separated notes inside brackets play together' },
      { id: 'n-chord-seq', syntax: '[g3,b3,e4] [a3,c4,e4]', name: 'chord sequence', desc: 'Wrap chords in brackets to move between them' },
    ],
  },
  {
    id: 'repeat-speed',
    title: 'Speed & Time',
    items: [
      { id: 'n-mul-int', syntax: '[e5 b4 d5 c5]*2', name: 'multiply', desc: 'Play the group twice per cycle' },
      { id: 'n-mul-dec', syntax: '[e5 b4 d5 c5]*2.75', name: 'decimal multiply', desc: 'Fractional multipliers create odd, shifting feels' },
      { id: 'n-div-int', syntax: '[e5 b4 d5 c5]/2', name: 'divide', desc: 'Play the group over two cycles' },
      { id: 'n-div-dec', syntax: '[e5 b4 d5 c5]/2.75', name: 'decimal divide', desc: 'Fractional divisions for loose phrasing' },
      { id: 'n-fastgap', syntax: 's("bd sd").fastGap(2)', name: 'fastGap', desc: 'JS — add this method after a sound() call in the code', codeOnly: true },
      { id: 'n-swing', syntax: 's("hh*8").swing(4)', name: 'swing', desc: 'JS — add this method after a sound() call in the code', codeOnly: true },
    ],
  },
  {
    id: 'time-weight',
    title: 'Time & Weight',
    items: [
      { id: 'n-weight-full', syntax: '<[g3,b3,e4]@2 [a3,c4,e4]>', name: 'elongation @', desc: 'The first chord lasts twice as long (default weight 1)' },
      { id: 'n-rep-full', syntax: '<[g3,b3,e4]!2 [a3,c4,e4]>', name: 'replication !', desc: 'Repeat an event without speeding the pattern up' },
      { id: 'n-extend', syntax: '<[g3 b3 e4] _ [a3 c4 e4]>', name: 'extend _', desc: 'Hold the previous event through this slot' },
      { id: 'n-alt-weight', syntax: '<c4@2 e4 g4>', name: 'weighted alternate', desc: 'Alternate, but the first note is twice as long' },
    ],
  },
  {
    id: 'rests-chords',
    title: 'Rests & Chords',
    items: [
      { id: 'n-rest-full', syntax: '[b4 [~ c5] d5 e5]', name: 'rest ~', desc: 'A rest can sit anywhere, including inside a nested group' },
      { id: 'n-rest-dash', syntax: 'c3 - e3 - g3', name: 'rest alias -', desc: 'A dash means the same as ~' },
      { id: 'n-stack-plain', syntax: 'g3,b3,e4', name: 'parallel ,', desc: 'Comma-separated events play at the same time' },
      { id: 'n-chord-chain', syntax: '<[c4,eb4,g4] [ab3,c4,eb4]>', name: 'chord progression', desc: 'Two chords, one per cycle — the basis of most songs here' },
    ],
  },
  {
    id: 'random',
    title: 'Random & Variation',
    items: [
      { id: 'n-rand-full', syntax: 'bd? hh? cp*4', name: 'coin flip ?', desc: 'Each marked event has a 50% chance of being dropped' },
      { id: 'n-rand-num', syntax: 'hh?0.1', name: 'drop chance', desc: '10% chance of being dropped — a small amount goes a long way' },
      { id: 'n-rand-seq', syntax: 'bd | sd | hh', name: 'choose |', desc: 'Pick one of these events at random each time' },
      { id: 'n-degrade', syntax: 's("hh*8").degradeBy(0.2)', name: 'degradeBy', desc: 'JS — add this method after a pattern call in the code', codeOnly: true },
      { id: 'n-sometimes', syntax: 's("hh*8").sometimes(x=>x.fast(2))', name: 'sometimes', desc: 'JS — add this method after a pattern call in the code', codeOnly: true },
      { id: 'n-somecycles', syntax: 's("bd,hh*8").someCycles(x=>x.rev())', name: 'someCycles', desc: 'JS — add this method after a pattern call in the code', codeOnly: true },
    ],
  },
  {
    id: 'euclidean',
    title: 'Euclidean Rhythms',
    items: [
      { id: 'n-eucl-full', syntax: 'bd(3,8)', name: '(beats,steps)', desc: 'Three hits evenly spread over eight steps' },
      { id: 'n-eucl-offset', syntax: 'bd(3,8,5)', name: '(beats,steps,offset)', desc: 'The third number rotates the starting step' },
      { id: 'n-eucl-dense', syntax: 'bd(5,8)', name: 'dense feel', desc: 'Five hits over eight steps — a driving, busy rhythm' },
      { id: 'n-eucl-odd', syntax: 'bd(3,13)', name: 'odd steps', desc: 'Odd segment counts make a pattern that keeps shifting' },
      { id: 'n-eucl-snare', syntax: 'sd(3,8)', name: 'pop clave', desc: 'The classic 3-over-8 “amigo” clave rhythm' },
      { id: 'n-eucl-multi', syntax: 'bd(3,8), hh(5,8)', name: 'stacked euclideans', desc: 'Layer several Euclidean rhythms with commas' },
    ],
  },
  {
    id: 'samples-strings',
    title: 'Notes, Samples & Strings',
    items: [
      { id: 'n-note', syntax: 'c3 eb3 g3', name: 'note names', desc: 'Mini-notation for note() — add an octave number for the register' },
      { id: 'n-num', syntax: '60 62 64', name: 'MIDI numbers', desc: 'Mini-notation for n() — 60 is middle C' },
      { id: 'n-sample-idx', syntax: 'bd:2', name: 'sample index', desc: 'Pick sample #2 from a bank — goes inside s("…")' },
      { id: 'n-sample-idx-pat', syntax: 'hh:<0 1 2>', name: 'patterned index', desc: 'Cycle through sample variations from event to event' },
      { id: 'n-backtick', syntax: '`c4 e4 g4`', name: 'backtick string', desc: 'JS string delimiters — paste into code for multi-line patterns', codeOnly: true },
      { id: 'n-verbatim', syntax: "'bd sd'", name: 'verbatim string', desc: 'JS string delimiters — a plain string, not parsed as mini-notation', codeOnly: true },
    ],
  },
  {
    id: 'pattern-functions',
    title: 'Pattern Functions',
    items: [
      { id: 'n-slow', syntax: '.slow(2)', name: 'slow', desc: 'JS method — add after a pattern call in the code (like /2)', codeOnly: true },
      { id: 'n-fast', syntax: '.fast(2)', name: 'fast', desc: 'JS method — add after a pattern call in the code (like *2)', codeOnly: true },
      { id: 'n-rev', syntax: '.rev()', name: 'reverse', desc: 'JS method — add after a pattern call in the code', codeOnly: true },
      { id: 'n-early', syntax: '.early(0.1)', name: 'early', desc: 'JS method — nudge a pattern earlier in the code', codeOnly: true },
      { id: 'n-late', syntax: '.late(0.1)', name: 'late', desc: 'JS method — nudge a pattern later in the code', codeOnly: true },
      { id: 'n-iter', syntax: '.iter(4)', name: 'iter', desc: 'JS method — rotate the pattern each cycle', codeOnly: true },
      { id: 'n-palindrome', syntax: '.palindrome()', name: 'palindrome', desc: 'JS method — alternate forwards/backwards each cycle', codeOnly: true },
      { id: 'n-ply', syntax: '.ply(2)', name: 'ply', desc: 'JS method — repeat every event', codeOnly: true },
    ],
  },
];
