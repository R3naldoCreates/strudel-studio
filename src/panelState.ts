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
      { id: 'n-seq', syntax: 'bd sd hh', name: 'sequence', desc: 'Events play left to right, squashed into one cycle' },
      { id: 'n-mul', syntax: 'a*3', name: 'repeat ×3', desc: 'Play the event three times per cycle' },
      { id: 'n-nest', syntax: '[bd sd]', name: 'nest / group', desc: 'Sub-divide one step into squeezed events' },
      { id: 'n-alt', syntax: '<a b c>', name: 'alternate', desc: 'One element per cycle — a, then b, then c…' },
      { id: 'n-eucl', syntax: 'a(3,8)', name: 'euclidean', desc: '3 beats spread over 8 steps' },
      { id: 'n-rest', syntax: '~', name: 'rest', desc: 'One step of silence' },
      { id: 'n-stack', syntax: 'a,b', name: 'stack / chord', desc: 'Play a and b at the same time' },
      { id: 'n-rep', syntax: 'a!3', name: 'replicate ×3', desc: 'Repeat three times without speeding up' },
      { id: 'n-rand', syntax: 'a?', name: 'coin flip', desc: '50% chance the event is removed' },
      { id: 'n-weight', syntax: 'a@2', name: 'weight @2', desc: 'This event lasts twice as long' },
      { id: 'n-longdiv', syntax: '[e5 b4 d5 c5]/2', name: 'slow /2', desc: 'Play the group over two cycles' },
      { id: 'n-euclidean2', syntax: 'a(3,8,2)', name: 'euclidean offset', desc: 'Rotation / offset — start on position 2' },
    ],
  },
  {
    id: 'seq-brackets',
    title: 'Sequencing & Brackets',
    items: [
      { id: 'n-seq-full', syntax: 'c e g b', name: 'sequence', desc: 'Space-separated events divide one cycle equally' },
      { id: 'n-nest-deep', syntax: 'e5 [b4 c5] d5', name: 'nest depth', desc: 'Brackets nest — any depth works' },
      { id: 'n-alt-bracket', syntax: '<e5 b4 d5 c5>', name: 'slowcat', desc: 'Same as [e5 b4 d5 c5]/4 — duration grows with more events' },
      { id: 'n-chord-bracket', syntax: '[g3,b3,e4]', name: 'chord', desc: 'Comma-separated notes inside brackets play together' },
      { id: 'n-chord-seq', syntax: '[g3,b3,e4] [a3,c4,e4]', name: 'chord sequence', desc: 'Wrap chords in brackets to sequence them' },
    ],
  },
  {
    id: 'repeat-speed',
    title: 'Repeat & Speed',
    items: [
      { id: 'n-mul-int', syntax: '[e5 b4 d5 c5]*2', name: 'multiply', desc: 'Play the group twice per cycle' },
      { id: 'n-mul-dec', syntax: '[e5 b4 d5 c5]*2.75', name: 'fractional multiply', desc: 'Decimal multipliers for odd feels, e.g. 2.75' },
      { id: 'n-div-int', syntax: '[e5 b4 d5 c5]/2', name: 'divide', desc: 'Play the group over two cycles' },
      { id: 'n-div-dec', syntax: '[e5 b4 d5 c5]/2.75', name: 'fractional divide', desc: 'Decimal divisions for odd phrasing' },
      { id: 'n-extend', syntax: '<[g3 b3 e4] _ [a3 c4 e4]>', name: 'extend / tie _', desc: 'Hold the previous event through this slot' },
    ],
  },
  {
    id: 'time-weight',
    title: 'Time & Weight',
    items: [
      { id: 'n-weight-full', syntax: '<[g3,b3,e4]@2 [a3,c4,e4]>', name: 'elongation @', desc: 'Weight — the event lasts @N steps (default 1)' },
      { id: 'n-rep-full', syntax: '<[g3,b3,e4]!2 [a3,c4,e4]>', name: 'replication !', desc: 'Repeat the event N times without speeding up' },
      { id: 'n-alt-weight', syntax: '<a@2 b c>', name: 'weighted alternate', desc: 'Alternate, but “a” is twice as long' },
    ],
  },
  {
    id: 'rests-chords',
    title: 'Rests & Chords',
    items: [
      { id: 'n-rest-full', syntax: '[b4 [~ c5] d5 e5]', name: 'rest ~', desc: 'One step of silence' },
      { id: 'n-rest-dash', syntax: 'c3 - e3 - g3', name: 'rest alias -', desc: 'A dash is also a rest (mini-notation alias)' },
      { id: 'n-stack-plain', syntax: 'g3,b3,e4', name: 'stack', desc: 'Comma-separated events play simultaneously' },
    ],
  },
  {
    id: 'random',
    title: 'Random',
    items: [
      { id: 'n-rand-full', syntax: 'bd? hh? cp*4', name: 'coin flip ?', desc: 'Each marked event has a 50% chance of being removed' },
      { id: 'n-rand-num', syntax: 'hh?0.1', name: 'drop chance', desc: 'Number between 0 and 1 — chance of being removed' },
      { id: 'n-rand-seq', syntax: 'a b?0.25 c d?', name: 'mixed odds', desc: 'Mix probabilities freely across a sequence' },
    ],
  },
  {
    id: 'euclidean',
    title: 'Euclidean Rhythms',
    items: [
      { id: 'n-eucl-full', syntax: 'bd(3,8)', name: '(beats,steps)', desc: '3 beats evenly spread over 8 segments' },
      { id: 'n-eucl-offset', syntax: 'bd(3,8,5)', name: '(beats,steps,offset)', desc: 'Third parameter rotates the starting position' },
      { id: 'n-eucl-snare', syntax: 'sd(3,8)', name: 'pop clave', desc: 'The classic 3-over-8 “amigo” clave rhythm' },
      { id: 'n-eucl-multi', syntax: 'bd(3,8), hh(5,8)', name: 'combined euclideans', desc: 'Stack several euclidean lanes with commas' },
    ],
  },
  {
    id: 'samples-strings',
    title: 'Samples & Strings',
    items: [
      { id: 'n-sample-idx', syntax: 'bd:2', name: 'sample index', desc: 'Inside s() — pick sample #2 from the bank' },
      { id: 'n-sample-idx-pat', syntax: 'hh:<0 1 2>', name: 'patterned index', desc: 'Cycle through samples per event' },
      { id: 'n-backtick', syntax: '`', name: 'backtick string', desc: 'Multi-line patterns use backticks instead of quotes' },
      { id: 'n-verbatim', syntax: "'verbatim'", name: 'verbatim string', desc: 'Single quotes = a plain string, not mini-notation' },
    ],
  },
];
