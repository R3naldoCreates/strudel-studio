// ─── Paste analysis: turn strudel code from the clipboard into layers ───────
// The app's editor doc is *generated* from the song model, so pasting strudel
// code can't just be inserted and forgotten — arbitrary code would vanish on
// the next model change. Instead we parse the common Bakery idioms and model
// them as tracks:
//
//   note("c3 e3").sound("gm_piano").gain(.8)  →  one synth layer (wave gm_piano)
//   sound("bd ~ sd ~, hh*8")                  →  one drums layer, pattern verbatim
//   <chains split across lines are fine>
//   samples("github:…")                       →  baked into song.extraSampleBanks
//   setcpm(120) / setcps(2)                   →  optional tempo apply
//
// Anything it can't model is reported and the user can "Paste as-is" instead.

import {
  SYNTH_WAVES,
  UZU_DRUMKIT,
  DIRT_SAMPLES,
  SALAMANDER,
  MRIDANGAM,
  TIDAL_PREFIXES,
  VCSL,
  GM_NAMES,
} from './packData';

export type SoundSource =
  | 'synth'
  | 'uzu-drumkit'
  | 'dirt-samples'
  | 'gm'
  | 'vcsl'
  | 'mridangam'
  | 'wavetables'
  | 'drum-machines'
  | 'salamander'
  | 'custom';

export const SOURCE_LABELS: Record<SoundSource, string> = {
  synth: 'built-in synth',
  'uzu-drumkit': 'bundled uzu drum kit',
  'dirt-samples': 'dirt-samples (CDN, ~15 mapped)',
  gm: 'GM soundfont (streams on first play)',
  vcsl: 'VCSL (CDN)',
  mridangam: 'mridangam (CDN)',
  wavetables: 'uzu-wavetables (CDN)',
  'drum-machines': 'tidal-drum-machines (CDN)',
  salamander: 'Salamander grand piano (CDN)',
  custom: 'registered by the pasted samples() call',
};

export interface SoundCheck {
  name: string;
  known: boolean;
  source?: SoundSource;
}

const synthSet = new Set(SYNTH_WAVES);
const uzuSet = new Set(UZU_DRUMKIT);
const dirtSet = new Set(DIRT_SAMPLES);
const salamanderSet = new Set(SALAMANDER);
const mridangamSet = new Set(MRIDANGAM);
const vcslSet = new Set(VCSL);
const gmSet = new Set(GM_NAMES);
const tidalSet = new Set(TIDAL_PREFIXES.map((p) => p.toLowerCase()));

/** classify a bare sound name against everything the app can play */
export function checkSound(raw: string, extraKnown?: ReadonlySet<string>): SoundCheck {
  const name = raw.toLowerCase();
  if (synthSet.has(name)) return { name, known: true, source: 'synth' };
  if (extraKnown?.has(name)) return { name, known: true, source: 'custom' };
  if (uzuSet.has(name)) return { name, known: true, source: 'uzu-drumkit' };
  if (dirtSet.has(name)) return { name, known: true, source: 'dirt-samples' };
  if (salamanderSet.has(name)) return { name, known: true, source: 'salamander' };
  if (gmSet.has(name)) return { name, known: true, source: 'gm' };
  if (vcslSet.has(name)) return { name, known: true, source: 'vcsl' };
  if (mridangamSet.has(name)) return { name, known: true, source: 'mridangam' };
  if (/^wt_[a-z0-9_]+$/i.test(name)) return { name, known: true, source: 'wavetables' };
  {
    const underscore = name.indexOf('_');
    if (underscore > 0 && tidalSet.has(name.slice(0, underscore))) {
      return { name, known: true, source: 'drum-machines' };
    }
  }
  return { name, known: false };
}

// ── balanced call scanner ────────────────────────────────────────────────────

export interface CallSite {
  name: string;
  /** raw argument text between the parens */
  arg: string;
  /** absolute index of the call's name in the text */
  from: number;
  /** absolute index just past the closing paren */
  to: number;
}

const CALLS_WANTED = new Set(['sound', 's', 'note', 'gain', 'bank', 'samples', 'setcpm', 'setcps', 'piano']);
const IDENT_START = /[A-Za-z_$]/;

/** find every wanted call in the text (comments are respected) */
export function scanCalls(text: string, wanted: Set<string> = CALLS_WANTED): CallSite[] {
  const out: CallSite[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    // skip // comments and line comments up to newline
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    // skip strings (a call can't start inside one)
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i, ch);
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$.-]/.test(text[j])) j++;
      let name = text.slice(i, j);
      // strip leading receiver: ".sound" — IDENT_START excludes '.', so dotted
      // calls are picked up at the identifier itself; nothing to strip
      const lower = name.toLowerCase();
      if (wanted.has(lower)) {
        // allow whitespace between name and (
        let k = j;
        while (k < n && (text[k] === ' ' || text[k] === '\t' || text[k] === '\n')) k++;
        if (text[k] === '(') {
          const close = matchParen(text, k);
          if (close > k) {
            out.push({ name: lower, arg: text.slice(k + 1, close).trim(), from: i, to: close + 1 });
            i = k + 1; // continue inside — nested calls are found too
            continue;
          }
        }
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

/** index just past the closing paren matching the open at `openIndex` */
function matchParen(text: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i, ch);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** index just past the end of a string starting at `quoteIndex` */
function skipString(text: string, quoteIndex: number, quote: string): number {
  let i = quoteIndex + 1;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return n;
}

// ── mini-notation tokenizer ──────────────────────────────────────────────────

/** base sound names inside a mini-notation string (unquoted inner pattern) */
export function soundTokens(inner: string): string[] {
  const out: string[] = [];
  for (const piece of inner.split(/[\s\[\]{}()<>|,]+/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)/.exec(piece);
    if (!m) continue;
    const base = m[1].toLowerCase();
    if (!out.includes(base)) out.push(base);
  }
  return out;
}

/** unquote a fully-quoted argument; returns undefined when not a single literal */
function unquote(arg: string): string | undefined {
  const trimmed = arg.trim();
  const quote = trimmed[0];
  if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
  const end = trimmed.lastIndexOf(quote);
  if (end <= 0) return undefined;
  const inner = trimmed.slice(1, end);
  // single literal only: no concatenation or interpolation
  if (quote === '`' && inner.includes('${')) return undefined;
  return inner;
}

/** find the opening quote for the string that ENDS at `closeQuoteIndex` */
function stringStartBefore(text: string, closeQuoteIndex: number, quote: string): number {
  for (let i = closeQuoteIndex - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '\\') {
      i--;
      continue;
    }
    if (ch === quote) return i;
  }
  return -1;
}

/** walk back from `closeIndex` (at a ')') to the matching '(' */
function matchParenBackward(text: string, closeIndex: number): number {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i--) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      // skip the whole string backwards
      const start = stringStartBefore(text, i, ch);
      if (start >= 0) i = start;
      continue;
    }
    if (ch === ')') depth++;
    else if (ch === '(') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** first string-literal argument inside a raw argument list */
function firstStringArg(arg: string): string | undefined {
  const m = /"([^"]*)"|'([^']*)'|`([^`]*)`/.exec(arg);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3] ?? undefined;
}

/** the leading object literal in an argument list, or undefined */
function firstBraceObject(arg: string): string | undefined {
  const start = arg.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < arg.length; i++) {
    const ch = arg[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      for (let j = i + 1; j < arg.length; j++) {
        if (arg[j] === '\\') j++;
        else if (arg[j] === ch) {
          i = j;
          break;
        }
      }
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return arg.slice(start, i + 1);
    }
  }
  return undefined;
}

/** object literal keys: { bd: 'x', sn: { y: 'z' } } → ["bd", "sn"] */
export function objectMapKeys(objText: string): string[] {
  const out: string[] = [];
  // top-level keys only — enough to register the names people use
  const m = objText.trim().match(/^\{/) && objText.trim().endsWith('}') ? objText.trim() : null;
  if (!m) return out;
  const inner = m.slice(1, -1);
  // split top-level commas respecting nesting and strings
  let depth = 0;
  let cur = '';
  const parts: string[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = (() => {
        for (let j = i + 1; j < inner.length; j++) {
          if (inner[j] === '\\') j++;
          else if (inner[j] === ch) return j;
        }
        return inner.length - 1;
      })();
      cur += inner.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  for (const part of parts) {
    const km = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_$]+))\s*:/.exec(part);
    if (km) out.push((km[1] ?? km[2] ?? km[3]).toLowerCase());
  }
  return out;
}

interface BackWalk {
  /** the pattern text, when a base was found */
  pattern?: string;
  /** ranges of the calls consumed by the chain — used to exclude nested calls */
  ranges: Array<[number, number]>;
}

/**
 * Walk back from just before a chain's terminator (e.g. s(…)/.piano()) to the
 * start of the expression, and return the base pattern:
 *
 *   "0 2 4".scale('c:minor').note().s('piano')  → "0 2 4"
 *    note("c3").sound("gm_piano")               → "c3"   (base call's 1st string arg)
 *
 * Every chain step is `.name(...)`; the walk stops at the expression's first
 * token. If that's a call whose name is a known pattern generator, its first
 * string argument is the pattern. Anything else (e.g. we're inside stack(…))
 * yields no pattern — the caller treats it as a standalone statement.
 */
export function walkBackChain(text: string, terminatorFrom: number): BackWalk {
  let i = terminatorFrom - 1;
  const ranges: Array<[number, number]> = [];
  let baseCall: { name: string; arg: string } | undefined;
  for (;;) {
    while (i >= 0 && /\s/.test(text[i])) i--;
    if (i < 0) break;
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const start = stringStartBefore(text, i, ch);
      if (start < 0) break;
      ranges.push([start, i + 1]);
      return { pattern: text.slice(start + 1, i), ranges };
    }
    if (ch === ')') {
      const open = matchParenBackward(text, i);
      if (open < 0) break;
      let j = open - 1;
      while (j >= 0 && /\s/.test(text[j])) j--;
      let k = j;
      while (k >= 0 && /[A-Za-z0-9_$]/.test(text[k])) k--;
      const name = text.slice(k + 1, j + 1).toLowerCase();
      let m = k;
      while (m >= 0 && /\s/.test(text[m])) m--;
      const precededByDot = m >= 0 && text[m] === '.';
      ranges.push([k, i + 1]);
      if (!precededByDot) {
        baseCall = { name, arg: text.slice(open + 1, i).trim() };
        break;
      }
      i = k;
      continue;
    }
    if (ch === '.') {
      i--;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(ch)) {
      i--;
      continue;
    }
    break;
  }
  // generator names whose first string argument is the pattern itself
  if (
    baseCall &&
    ['n', 'note', 'sound', 's', 'seq', 'cat', 'scale', 'euclid', 'euclidlegato', 'struct'].includes(baseCall.name)
  ) {
    const p = firstStringArg(baseCall.arg);
    if (p !== undefined) return { pattern: p, ranges };
  }
  return { pattern: undefined, ranges };
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

// ── chain scanning ───────────────────────────────────────────────────────────

interface ChainCall {
  name: string;
  arg: string;
  from: number;
  to: number;
}

/** scan forward from just after a note(...) call for chained .fn(...) steps */
function scanChain(text: string, start: number): ChainCall[] {
  const out: ChainCall[] = [];
  let i = start;
  const n = text.length;
  for (;;) {
    while (i < n && /\s/.test(text[i])) i++;
    if (text[i] !== '.') break;
    let j = i + 1;
    while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++;
    const name = text.slice(i + 1, j).toLowerCase();
    if (!name) break;
    let k = j;
    while (k < n && /\s/.test(text[k])) k++;
    if (text[k] !== '(') break;
    const close = matchParen(text, k);
    if (close < 0) break;
    out.push({ name, arg: text.slice(k + 1, close).trim(), from: i, to: close + 1 });
    i = close + 1;
  }
  return out;
}

// ── the analysis ─────────────────────────────────────────────────────────────

export interface DetectedLayer {
  kind: 'drums' | 'synth';
  /** suggested track name */
  name: string;
  /** distinct sound names the layer covers */
  sounds: string[];
  /** synth: note mini-notation (verbatim from the code) */
  notePattern?: string;
  /** synth: sound for .sound() */
  wave?: string;
  /** drums: sound mini-notation (verbatim from the code) */
  drumPattern?: string;
  gain?: number;
  line: number;
}

export interface BankCall {
  /** display: raw argument of the samples() call (single line) */
  raw: string;
  /** verbatim one-line samples(...) call to bake into the song */
  call?: string;
  bakeable: boolean;
  line: number;
}

export interface Analysis {
  layers: DetectedLayer[];
  banks: BankCall[];
  /** distinct sounds referenced anywhere, first-use order */
  sounds: SoundCheck[];
  unknownCount: number;
  /** tempo from setcpm/setcps, cycles per minute */
  cpm: number | null;
  /** count of note-chains + standalone sound() calls we saw */
  statements: number;
  /** drum machines referenced via .bank() — kept at info level, not baked */
  banksUsed: string[];
}

/** split a raw sound()/s() argument into its literal pattern, or undefined */
function literalPattern(arg: string): string | undefined {
  return unquote(arg);
}

const MAX_SPLIT_SOUNDS = 4;

/** prettify a sound name for a track title: gm_piano → “GM Piano” */
export function prettyName(sound: string): string {
  const parts = sound.split('_').filter(Boolean);
  if (parts[0]?.toLowerCase() === 'gm') {
    return 'GM ' + parts.slice(1).map(cap).join(' ');
  }
  return parts.map(cap).join(' ').slice(0, 28) || sound;
}
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** analyze pasted strudel/bakery source */
export function analyze(text: string): Analysis {
  const calls = scanCalls(text);
  const byName = (name: string): CallSite[] => calls.filter((c) => c.name === name);

  // 0) pre-pass: object-form samples({...}, 'url') — the keys are playable sound
  //    names once the call is baked; treat them as known
  const customSounds = new Set<string>();
  for (const call of byName('samples')) {
    const obj = firstBraceObject(call.arg);
    if (obj) for (const k of objectMapKeys(obj)) customSounds.add(k);
  }

  // 1+2) every sound/s/.piano() call is either the end of a synth chain (a
  //      melodic voice) or a standalone drum statement
  const banksUsed: string[] = [];
  const consumed: Array<[number, number]> = [];
  const synthLayers: DetectedLayer[] = [];
  const drumLayers: DetectedLayer[] = [];
  const synthSoundNames: string[] = [];
  const drumSoundNames: string[] = [];

  const terminators = calls.filter((c) => c.name === 'sound' || c.name === 's' || c.name === 'piano');
  for (const term of terminators) {
    if (consumed.some(([a, b]) => term.from >= a && term.to <= b)) continue;
    const back = walkBackChain(text, term.from);
    const forward = scanChain(text, term.to);
    const takenRanges: Array<[number, number]> = [
      [term.from, term.to],
      ...back.ranges,
      ...forward.map((c) => [c.from, c.to] as [number, number]),
    ];
    const gainCall = forward.find((c) => c.name === 'gain');
    const bankCall = forward.find((c) => c.name === 'bank');
    const gain = gainCall ? clampNumber(parseFloat(gainCall.arg), 0, 2) : undefined;
    const bankInner = bankCall ? literalPattern(bankCall.arg) : undefined;
    const pattern = back.pattern !== undefined ? oneLine(back.pattern) : undefined;
    const waveArg = term.name === 'piano' ? 'piano' : literalPattern(term.arg);

    if (pattern === undefined || waveArg === undefined) {
      if (term.name === 'piano') {
        consumed.push(...takenRanges); // unmodelled piano call — don't double-count
        continue;
      }
      // standalone drums statement: sound("bd ~ sd ~, hh*8")
      const inner = literalPattern(term.arg);
      consumed.push(...takenRanges);
      if (inner === undefined) continue;
      const sounds = soundTokens(inner);
      if (sounds.length === 0) continue;
      drumSoundNames.push(...sounds);
      drumLayers.push({
        kind: 'drums',
        name: drumLayers.length === 0 ? 'Drums' : `Drums ${drumLayers.length + 1}`,
        sounds,
        drumPattern: oneLine(inner),
        gain,
        line: lineOf(text, term.from),
      });
      if (bankInner) banksUsed.push(bankInner);
      continue;
    }

    const sounds = soundTokens(waveArg);
    consumed.push(...takenRanges);
    if (sounds.length === 0) continue;
    synthSoundNames.push(...sounds);
    const waveSounds = sounds.slice(0, MAX_SPLIT_SOUNDS);
    const line = lineOf(text, term.from);
    for (const wave of waveSounds) {
      synthLayers.push({
        kind: 'synth',
        name: prettyName(wave),
        sounds: [wave],
        notePattern: pattern,
        wave,
        gain,
        line,
      });
    }
    if (bankInner) banksUsed.push(bankInner);
  }

  // 3) samples(...) calls — bakeable into the song as verbatim code lines
  const banks: BankCall[] = [];
  for (const call of byName('samples')) {
    const arg = call.arg;
    const raw = oneLine(arg).slice(0, 160);
    let bakeable = false;
    const obj = firstBraceObject(arg);
    if (obj) {
      // object form — bake when the trailing base is an http(s)/github url
      const tail = arg.slice(arg.indexOf(obj) + obj.length);
      const tailUrl = firstStringArg(tail);
      if (tailUrl && /^(github:|https?:|shabda:|bubo:)/i.test(tailUrl)) bakeable = true;
    } else {
      const url = firstStringArg(arg);
      if (url && /^(github:|https?:|shabda:|bubo:)/i.test(url)) bakeable = true;
    }
    banks.push({ raw, call: bakeable ? `samples(${oneLine(arg)})` : undefined, bakeable, line: lineOf(text, call.from) });
  }

  // 4) standalone bank() calls (outside chains) — note them, don't bake
  for (const call of byName('bank')) {
    if (consumed.some(([from, to]) => call.from >= from && call.to <= to)) continue;
    const inner = literalPattern(call.arg);
    if (inner) banksUsed.push(inner);
  }

  // 5) tempo
  let cpm: number | null = null;
  const cpmCall = byName('setcpm')[0];
  const cpsCall = byName('setcps')[0];
  if (cpmCall) {
    const m = /-?\d+(\.\d+)?/.exec(cpmCall.arg);
    if (m) cpm = Math.round(parseFloat(m[0]));
  } else if (cpsCall) {
    const m = /-?\d+(\.\d+)?/.exec(cpsCall.arg);
    if (m) cpm = Math.round(parseFloat(m[0]) * 60);
  }

  // distinct sounds across everything, ordered by first appearance
  const allSounds: string[] = [];
  for (const s of [...synthSoundNames, ...drumSoundNames]) {
    if (!allSounds.includes(s)) allSounds.push(s);
  }
  const sounds = allSounds.map((s) => checkSound(s, customSounds));

  // layers in source order, not grouped by kind
  const layers = [...synthLayers, ...drumLayers].sort((a, b) => a.line - b.line);

  return {
    layers,
    banks,
    sounds,
    unknownCount: sounds.filter((s) => !s.known).length,
    cpm,
    statements: layers.length,
    banksUsed,
  };
}

function clampNumber(n: number, min: number, max: number): number | undefined {
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/** does this clipboard text look like strudel code worth analyzing? */
export function looksLikeStrudel(text: string): boolean {
  return /(\.sound\s*\(|\bsound\s*\(|\bs\s*\(|\bnote\s*\(|\$:|\bstack\s*\(|\bsetcpm\s*\(|\bsetcps\s*\(|\bbank\s*\()/.test(text);
}
