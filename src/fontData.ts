// ─── Safe parser for webaudiofontdata font files ────────────────────────────
// Upstream ships `var _tone_x={ zones:[{ midi:0, ..., file:'SUQz...' }, ...] };`
// The original loader used eval() on that remote text — remote code execution,
// and incompatible with a CSP that does not allow 'unsafe-eval'.
// These files contain only object/array literals, numbers, booleans and
// single-quoted base64 strings, so a narrow literal-to-JSON conversion is enough.

export interface GmZone {
  originalPitch: number;
  keyRangeLow: number;
  keyRangeHigh: number;
  coarseTune: number;
  fineTune: number;
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
  sample?: string;
  file?: string;
}

/** Remove JS comments without touching `//` that appears inside base64 strings. */
function stripComments(src: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += src[(i += 1)] ?? ''; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

export function parseFontZones(text: string): GmZone[] {
  const split = text.split('={');
  if (split.length < 2) throw new Error('font: missing object literal');
  const raw = split[1];
  const end = raw.lastIndexOf('}');
  if (end < 0) throw new Error('font: unbalanced object literal');
  const body = stripComments(raw.slice(0, end));

  const json = `{${body}}`
    // unquoted object keys → quoted JSON keys
    .replace(/([\{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
    // single-quoted values → double-quoted JSON strings (base64 has no quotes)
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_m, s: string) => `"${s.replace(/"/g, '\\"')}"`)
    // trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1');

  const parsed = JSON.parse(json) as { zones?: unknown };
  if (!Array.isArray(parsed.zones)) throw new Error('font: no zones array');
  return parsed.zones as GmZone[];
}
