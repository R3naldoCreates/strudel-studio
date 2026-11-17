// ─── Pasted-code safety ──────────────────────────────────────────────────────
// Goal: pasted Strudel code must behave EXACTLY like it does on strudel.cc —
// every pattern, every `samples({...}, 'github:...')`, every slider() — while
// anything that escapes the music environment is caught and shown to the user.
//
// We do NOT strip legitimate Strudel JavaScript. The scanner only looks for
// escape hatches into the host: Tauri IPC, the network, dynamic code execution,
// browser storage, DOM/window globals and Node-style APIs. Each finding is a
// choice: remove it (default) or leave it in, with the reason shown in red.
// Everything removed is written into the song as a comment so it is never a
// silent edit.

export type RiskLevel = 'blocked' | 'warning';

export interface SafetyFinding {
  id: string;
  from: number;
  to: number;
  text: string;
  category: string;
  reason: string;
  level: RiskLevel;
}

export interface SafetyResult {
  findings: SafetyFinding[];
  /** code after applying the user's keep/remove choices */
  code: string;
  /** verbatim snippets that were removed (written into the song as comments) */
  omitted: string[];
  /** snippets the user explicitly chose to keep */
  kept: string[];
  /** ids the user chose to keep — used by the red/amber preview */
  keptIds: ReadonlySet<string>;
}

interface RiskPattern {
  category: string;
  reason: string;
  level: RiskLevel;
  re: RegExp;
}

// Order matters only for display — matches are merged by source position.
const RISK_PATTERNS: RiskPattern[] = [
  {
    category: 'native-bridge', level: 'blocked',
    reason: 'Tauri native bridge — can read and write files on your computer',
    re: /\bwindow\s*\.\s*__TAURI_INTERNALS__\b|\b__TAURI_INTERNALS__\b|\bwindow\s*\.\s*__TAURI\b|\b__TAURI__\b/g,
  },
  {
    category: 'native-command', level: 'blocked',
    reason: 'Tauri command invocation — can read/write files outside the app',
    re: /\binvoke\s*\(|\bipc\s*\.\s*invoke/g,
  },
  {
    category: 'network', level: 'blocked',
    reason: 'network request — can send your data to another server',
    re: /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/g,
  },
  {
    category: 'dynamic-import', level: 'blocked',
    reason: 'dynamic module import — can load and run remote code',
    re: /\bimport\s*\(/g,
  },
  {
    category: 'dynamic-code', level: 'blocked',
    reason: 'dynamic code execution — can run code hidden inside a string',
    re: /\beval\s*\(|\bnew\s+Function\s*\(|\b(setTimeout|setInterval)\s*\(\s*['"`]/g,
  },
  {
    category: 'node-api', level: 'blocked',
    reason: 'Node-style API — reaches past the browser sandbox',
    re: /\b(require|process|Buffer)\s*[.(]/g,
  },
  {
    category: 'storage', level: 'blocked',
    reason: 'browser storage access — can read saved data from other pages',
    re: /\b(localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)\b/g,
  },
  {
    category: 'webview-global', level: 'warning',
    reason: 'webview global / DOM access — not part of Strudel',
    re: /\b(document|window|globalThis|top|parent|self)\s*\./g,
  },
  {
    category: 'browser-api', level: 'warning',
    reason: 'browser API outside Strudel — may not work in the desktop app',
    re: /\b(location|navigator|history|screen)\s*\.|\b(Worker|SharedWorker|importScripts|FileReader|createObjectURL)\s*\(/g,
  },
  {
    category: 'native-dialog', level: 'warning',
    reason: 'native dialog / navigation — does not work in WebView2',
    re: /\b(alert|confirm|prompt)\s*\(/g,
  },
];

/**
 * Replace the inside of strings and comments with spaces so patterns only
 * match real code. Length and newlines are preserved, so match indices map
 * straight back onto the original source.
 */
function maskLiterals(src: string): string {
  const out: string[] = [];
  let i = 0;
  type Mode = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';
  let mode: Mode = 'code';
  const blank = (c: string): string => (c === '\n' || c === '\r' ? c : ' ');

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { out.push('  '); i += 2; mode = 'line'; continue; }
      if (c === '/' && n === '*') { out.push('  '); i += 2; mode = 'block'; continue; }
      if (c === '"' || c === "'" || c === '`') {
        out.push(' '); i += 1;
        mode = c === '"' ? 'double' : c === "'" ? 'single' : 'template';
        continue;
      }
      out.push(c); i += 1; continue;
    }
    if (mode === 'line') {
      out.push(blank(c)); i += 1;
      if (c === '\n') mode = 'code';
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && n === '/') { out.push('  '); i += 2; mode = 'code'; continue; }
      out.push(blank(c)); i += 1; continue;
    }
    // quoted string
    if (c === '\\') {
      out.push(blank(c) + blank(src[i + 1] ?? '')); i += 2; continue;
    }
    out.push(blank(c)); i += 1;
    const close = mode === 'double' ? '"' : mode === 'single' ? "'" : '`';
    if (c === close) mode = 'code';
  }
  return out.join('');
}

interface RawMatch { from: number; to: number; pattern: RiskPattern }

/**
 * A pattern like `fetch(` should mark the WHOLE call, not just its name, so
 * "what was omitted" is the useful line `fetch('https://…')` and removing it
 * leaves no dangling argument behind.
 */
/** A partial identifier match must never leave a tail behind after redaction. */
function extendIdentifierEnd(src: string, to: number): number {
  while (to < src.length && /[\w$]/.test(src[to])) to += 1;
  return to;
}

function expandToCallEnd(src: string, from: number, to: number): number {
  if (!/\(\s*$/.test(src.slice(from, to))) return to;
  let depth = 0;
  let quote = '';
  for (let i = to - 1; i < Math.min(src.length, to + 1200); i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return to;
}

/** Find all risky code spans. Strings/comments are ignored on purpose. */
export function scanCodeSafety(code: string): SafetyFinding[] {
  if (!code) return [];
  const masked = maskLiterals(code);
  const raw: RawMatch[] = [];
  for (const pattern of RISK_PATTERNS) {
    pattern.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.re.exec(masked)) !== null) {
      if (m[0].length === 0) { pattern.re.lastIndex += 1; continue; }
      const end = expandToCallEnd(code, m.index, m.index + m[0].length);
      raw.push({ from: m.index, to: extendIdentifierEnd(code, end), pattern });
    }
  }
  raw.sort((a, b) => a.from - b.from || b.to - a.to);

  // Merge overlapping/adjacent hits so one expression produces one warning.
  const merged: RawMatch[] = [];
  for (const hit of raw) {
    const last = merged[merged.length - 1];
    if (last && hit.from < last.to) {
      if (hit.pattern.level === 'blocked') last.pattern = hit.pattern;
      if (hit.to > last.to) last.to = hit.to;
    } else {
      merged.push({ ...hit });
    }
  }

  return merged.map((hit, index) => ({
    id: `sf-${index}-${hit.pattern.category}-${hit.from}`,
    from: hit.from,
    to: hit.to,
    text: code.slice(hit.from, hit.to),
    category: hit.pattern.category,
    reason: hit.pattern.reason,
    level: hit.pattern.level,
  }));
}

const REMOVED_NOTE = 'removed by safety check';

/** Rebuild the code from the original + the findings the user chose to KEEP. */
export function applySafetyChoices(
  code: string,
  findings: SafetyFinding[],
  keep: ReadonlySet<string>,
): SafetyResult {
  const removed = findings.filter((f) => !keep.has(f.id)).sort((a, b) => a.from - b.from);

  // Join neighbouring removals so `obj.__TAURI_INTERNALS__.invoke(...)` becomes
  // ONE comment instead of leaving a stray `.` that is a JavaScript syntax error.
  interface Range { from: number; to: number; labels: string[]; texts: string[] }
  const ranges: Range[] = [];
  for (const f of removed) {
    const last = ranges[ranges.length - 1];
    if (last && /^[\s.;]*$/.test(code.slice(last.to, f.from))) {
      last.to = f.to;
      last.labels.push(f.category);
      last.texts.push(f.text);
    } else {
      ranges.push({ from: f.from, to: f.to, labels: [f.category], texts: [f.text] });
    }
  }

  let result = code;
  for (const r of ranges.reverse()) {
    const note = `/* ${REMOVED_NOTE}: ${r.labels.join(' + ')} — ${r.texts.join(' ')} */`;
    result = result.slice(0, r.from) + note + result.slice(r.to);
  }
  return {
    findings,
    code: result,
    omitted: removed.map((f) => f.text),
    kept: findings.filter((f) => keep.has(f.id)).map((f) => f.text),
    keptIds: keep,
  };
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML preview: removed spans in red, kept spans in amber, everything else escaped. */
export function highlightSafety(code: string, result: SafetyResult): string {
  const marks = [...result.findings].sort((a, b) => a.from - b.from);
  let html = '';
  let at = 0;
  for (const f of marks) {
    html += escapeHtml(code.slice(at, f.from));
    const cls = result.keptIds.has(f.id) ? 'ipd-mark-kept' : 'ipd-mark-danger';
    html += `<mark class="${cls}" title="${escapeHtml(f.reason)}">${escapeHtml(f.text)}</mark>`;
    at = f.to;
  }
  html += escapeHtml(code.slice(at));
  return html;
}

const MAX_CALL = 600;

/**
 * A bakeable extra sample call must be a single-line samples(...) with no
 * escape hatch in it. Object maps such as samples({ bd: 'bd.wav' },
 * 'github:…') are still allowed — they are real Strudel code.
 */
export function isSafeSampleCall(call: string): boolean {
  const trimmed = call.trim();
  if (!/^samples\s*\(/.test(trimmed) || /[\r\n]/.test(trimmed) || trimmed.length > MAX_CALL) return false;
  let depth = 0;
  for (const ch of trimmed) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (depth < 0) return false;
  }
  if (depth !== 0) return false;
  return scanCodeSafety(trimmed).length === 0;
}

/** One-line comment listing everything that was omitted, for the song file. */
export function omittedComment(omitted: string[]): string[] {
  return omitted.map((text) => `// ⚠ omitted from pasted code: ${text.replace(/[\r\n]+/g, ' ').slice(0, 200)}`);
}
