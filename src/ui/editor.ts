// ─── Editor: CodeMirror with strudel flavour + span-aware clicks ─────────────
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection, Decoration, type DecorationSet } from '@codemirror/view';
import { EditorState, RangeSet, StateEffect, StateField } from '@codemirror/state';
import { StreamLanguage, syntaxHighlighting, LanguageSupport, HighlightStyle } from '@codemirror/language';
import { tags, Tag } from '@lezer/highlight';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

import type { CodeSpan } from '../types';
import { spanAt } from '../codegen';

const strudelName = (token: string): string | null => {
  // rough keyword table — strudel has hundreds of fns; anything word-call shaped
  // in front of a paren gets the "fn" look via the parser below instead.
  const keywords = new Set(['setcpm', 'setcps', 'hush', 'samples', 'sound', 'note', 'bank', 'n']);
  return keywords.has(token) ? token : null;
};

const strudelLanguage = StreamLanguage.define<{ inString: boolean }>({
  startState: () => ({ inString: false }),
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match('"')) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '"') break;
        if (ch === '\\') stream.next();
      }
      return 'string';
    }
    if (stream.match(/^\$:/)) return 'keyword';
    if (stream.match(/^\d+(\.\d+)?/)) return 'number';
    const word = stream.match(/^[A-Za-z_][A-Za-z0-9_.-]*/);
    if (word) {
      const w = (word as RegExpMatchArray)[0];
      if (/^[A-Z]/.test(w)) return 'variable-2';
      if (strudelName(w)) return 'keyword';
      if (stream.peek() === '(') return 'function';
      return 'atom';
    }
    const ch = stream.next();
    if (ch && /[()[\]{}]/.test(ch)) return 'bracket';
    if (ch && /[.,:]/.test(ch)) return 'operator';
    return null;
  },
  tokenTable: {
    comment: tags.comment,
    string: tags.string,
    keyword: tags.keyword,
    number: tags.number,
    function: tags.function(tags.variableName),
    atom: tags.atom,
    operator: tags.operator,
    bracket: tags.bracket,
    'variable-2': tags.definition(tags.variableName),
  } as Record<string, Tag>,
});

const highlighter = HighlightStyle.define([
  { tag: tags.keyword, class: 'tok-k' },
  { tag: tags.comment, class: 'tok-c' },
  { tag: tags.string, class: 'tok-s' },
  { tag: tags.number, class: 'tok-n' },
  { tag: tags.function(tags.variableName), class: 'tok-f' },
  { tag: tags.atom, class: 'tok-a' },
  { tag: tags.operator, class: 'tok-o' },
  { tag: tags.bracket, class: 'tok-b' },
  { tag: tags.definition(tags.variableName), class: 'tok-d' },
]);

export interface EditorHandle {
  view: EditorView;
  setCode(code: string, spans: CodeSpan[]): void;
  replaceRange(from: number, to: number, text: string): void;
  offsetAtPoint(x: number, y: number): number | null;
  lineFromOffset(offset: number): number;
  spans(): CodeSpan[];
  flash(ranges: { from: number; to: number }[], durationMs: number): void;
  focus(): void;
}

const setSpansEffect = StateEffect.define<CodeSpan[]>();
const playheadEffect = StateEffect.define<DecorationSet>();

const spanField = StateField.define<CodeSpan[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSpansEffect)) return e.value;
    }
    return value.map((s) => ({ ...s, from: tr.changes.mapPos(s.from), to: tr.changes.mapPos(s.to) }));
  },
});

/** ranges currently glowing because they fired — rebuilt by flash() */
const playheadField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let mapped = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(playheadEffect)) mapped = e.value;
    }
    return mapped;
  },
});

const playheadDecorations = EditorView.decorations.compute([playheadField], (state) => state.field(playheadField));

export function createEditor(
  parent: HTMLElement,
  onTokenClick: (span: CodeSpan | undefined, offset: number, x: number, y: number, button: 0 | 2) => void,
  onEdit: () => void,
): EditorHandle {
  const theme = EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'transparent',
        fontSize: '13px',
      },
      '.cm-content': {
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        padding: '10px 0 40vh',
        caretColor: '#ff3ea5',
        lineHeight: '1.75',
      },
      '.cm-line': { padding: '0 14px 0 8px' },
      '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#3b4158' },
      '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#7f88ab' },
      '.cm-cursor': { borderLeftColor: '#ff3ea5', borderLeftWidth: '2px' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(53,224,255,0.16) !important' },
      '.cm-scroller': { overflow: 'auto' },
      '.tok-k': { color: '#ff3ea5', fontWeight: '600' },
      '.tok-c': { color: '#4c5578', fontStyle: 'italic' },
      '.tok-s': { color: '#b6ff3b' },
      '.tok-n': { color: '#ffd166' },
      '.tok-f': { color: '#35e0ff' },
      '.tok-a': { color: '#c792ea' },
      '.tok-o': { color: '#8b93b8' },
      '.tok-b': { color: '#5eead4' },
      '.tok-d': { color: '#ff9f43' },
    },
    { dark: true },
  );

  const state = EditorState.create({
    doc: '// press play…',
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightSpecialChars(),
      drawSelection(),
      history(),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      new LanguageSupport(strudelLanguage),
      syntaxHighlighting(highlighter),
      spanField,
      playheadField,
      playheadDecorations,
      theme,
      EditorView.domEventHandlers({
        mousedown(event, view) {
          if (event.button !== 0 && event.button !== 2) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          const spansNow = view.state.field(spanField);
          const span = spanAt(spansNow, pos);
          if (event.button === 2) {
            event.preventDefault();
            // small timeout lets CodeMirror set the selection first
            setTimeout(() => onTokenClick(span, pos, event.clientX, event.clientY, 2), 0);
            return true;
          }
          // left click: only treat as token-click when not selecting text drag
          const start = pos;
          const up = (e: MouseEvent) => {
            window.removeEventListener('mouseup', up);
            const end = view.posAtCoords({ x: e.clientX, y: e.clientY });
            if (end === start) onTokenClick(span, pos, e.clientX, e.clientY, 0);
          };
          window.addEventListener('mouseup', up);
          return false;
        },
        contextmenu(event) {
          event.preventDefault();
          return true;
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !suppressOnEdit) onEdit();
      }),
    ],
  });

  const view = new EditorView({ state, parent });
  let currentSpans: CodeSpan[] = [];
  /** set while the editor itself replaces the doc (setCode) — suppresses the hand-edit flag */
  let suppressOnEdit = false;

  interface FlashMark {
    from: number;
    to: number;
    expires: number;
  }
  let flashes: FlashMark[] = [];
  let sweeper: number | null = null;

  const rebuildPlayhead = (): void => {
    const now = performance.now();
    const doc = view.state.doc;
    flashes = flashes.filter((f) => f.expires > now && f.from < doc.length);
    const decorations = flashes
      .map((f) =>
        Decoration.mark({ class: 'cm-playing' }).range(Math.max(0, f.from), Math.min(doc.length, f.to)),
      )
      .filter((r) => r.from < r.to);
    view.dispatch({ effects: playheadEffect.of(RangeSet.of(decorations, true)) });
  };

  const ensureSweeper = (): void => {
    if (sweeper !== null) return;
    sweeper = window.setInterval(() => {
      rebuildPlayhead();
      if (flashes.length === 0 && sweeper !== null) {
        window.clearInterval(sweeper);
        sweeper = null;
      }
    }, 120);
  };

  return {
    view,
    setCode(code, spans) {
      currentSpans = spans;
      const prev = view.state.doc.toString();
      if (prev === code) {
        view.dispatch({ effects: setSpansEffect.of(spans) });
        return;
      }
      flashes = [];
      suppressOnEdit = true;
      view.dispatch({
        changes: { from: 0, to: prev.length, insert: code },
        effects: [setSpansEffect.of(spans), playheadEffect.of(Decoration.none)],
      });
      suppressOnEdit = false;
    },
    replaceRange(from, to, text) {
      view.dispatch({ changes: { from, to, insert: text } });
    },
    offsetAtPoint(x, y) {
      return view.posAtCoords({ x, y });
    },
    lineFromOffset(offset) {
      return view.state.doc.lineAt(offset).number;
    },
    spans: () => view.state.field(spanField),
    flash(ranges, durationMs) {
      const now = performance.now();
      const docLength = view.state.doc.length;
      for (const range of ranges) {
        const from = Math.max(0, Math.min(range.from, docLength));
        const to = Math.max(0, Math.min(range.to, docLength));
        if (to > from) flashes.push({ from, to, expires: now + durationMs });
      }
      rebuildPlayhead();
      ensureSweeper();
    },
    focus: () => view.focus(),
  };
}
