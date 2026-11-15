// ─── Live sliders: strudel.cc's slider() widgets, in our UI ──────────────────
// Strudel code may contain slider(value, min, max, step?) calls anywhere —
// `gain(slider(0.5, 0, 1))`. strudel.cc renders them as draggable knobs.
// We detect them textually and render a widget bar that rewrites the code in
// place, exactly like the built-in widgets do.

export interface WidgetSlider {
  key: string;
  /** enclosing call name, e.g. "gain", "lpf", or "slider" if bare */
  context: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** char offsets of the first argument inside the doc */
  valueFrom: number;
  valueTo: number;
  /** char offsets of the whole slider(...) call (for display) */
  from: number;
  to: number;
  line: number;
}

/** parse a `slider(...)` argument list without trying to eval anything */
export function findWidgets(doc: string): WidgetSlider[] {
  const out: WidgetSlider[] = [];
  const re = /\bslider\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(doc))) {
    const openParen = match.index + match[0].length - 1;
    const parsed = parseCall(doc, openParen);
    if (!parsed) continue;
    const parts = splitTopLevel(parsed.argText);
    if (parts.length === 0) continue;

    const num = (raw: string | undefined, fallback: number): number => {
      if (raw === undefined) return fallback;
      const v = Number(raw.trim());
      return Number.isFinite(v) ? v : fallback;
    };

    const value = num(parts[0]?.text, NaN);
    if (!Number.isFinite(value)) continue; // e.g. slider(speed * 2) — not a literal, skip
    const min = num(parts[1]?.text, 0);
    const max = num(parts[2]?.text, 1);
    const stepPart = parts[3]?.text?.trim();
    const step = stepPart !== undefined && Number.isFinite(Number(stepPart)) && Number(stepPart) > 0
      ? Number(stepPart)
      : (max - min) / 100 || 0.01;

    // value arg offsets relative to doc
    const valueFrom = parsed.argsFrom + parts[0].from;
    const valueTo = parsed.argsFrom + parts[0].to;

    out.push({
      key: `${match.index}:${parts[0].from}`,
      context: precedingCallName(doc, match.index) ?? 'slider',
      min,
      max,
      step,
      value,
      valueFrom,
      valueTo,
      from: match.index,
      to: parsed.argsToEnd + 1,
      line: lineOf(doc, match.index),
    });
  }
  return out;
}

interface ParsedCall {
  argText: string;
  /** absolute offset where the argument list starts */
  argsFrom: number;
  /** absolute offset of the ')' */
  argsToEnd: number;
}

function parseCall(doc: string, openParen: number): ParsedCall | null {
  let depth = 1;
  let i = openParen + 1;
  const start = i;
  let quote: string | null = null;
  while (i < doc.length) {
    const ch = doc[i];
    if (quote) {
      if (ch === '\\') i += 2;
      else if (ch === quote) { quote = null; i++; }
      else i++;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; i++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        return {
          argText: doc.slice(start, i),
          argsFrom: start,
          argsToEnd: i,
        };
      }
      i++;
      continue;
    }
    i++;
  }
  return null;
}

interface Part { text: string; from: number; to: number }

function splitTopLevel(argText: string): Part[] {
  const parts: Part[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  const push = (end: number): void => {
    const raw = argText.slice(start, end);
    const lead = raw.search(/\S/);
    if (lead === -1) return; // empty part
    parts.push({ text: raw.trim(), from: start + lead, to: start + lead + raw.trim().length });
  };
  for (let i = 0; i < argText.length; i++) {
    const ch = argText[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
    if (ch === ',' && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(argText.length);
  return parts;
}

/** name of the call that encloses (or precedes) this slider — for the label */
function precedingCallName(doc: string, sliderAt: number): string | null {
  const before = doc.slice(Math.max(0, sliderAt - 120), sliderAt);
  const match = /([A-Za-z_$][\w$.-]*)\s*\(\s*$/.exec(before);
  return match ? match[1] : null;
}

function lineOf(doc: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < doc.length; i++) {
    if (doc.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function formatWidgetNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}
