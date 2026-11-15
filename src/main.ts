// ─── Strudel Studio — application bootstrap & wiring ─────────────────────────
import { store } from './state';
import { generate } from './codegen';
import { createEditor, type EditorHandle } from './ui/editor';
import { initContextMenuGlobal, showContextMenu, hideContextMenu } from './ui/contextmenu';
import { buildMenu } from './ui/menu-builder';
import { renderInspector } from './ui/inspector';
import { renderTimeline } from './ui/timeline';
import { renderBlocksPanel } from './ui/blocksPanel';
import { Scope } from './ui/scope';
import { initToasts, showToast } from './ui/toast';
import { enginePlay, engineStop, enginePanic, enumerateBundledBanks, registerFolder, isTauriRuntime, onHapFlash } from './engineFacade';
import { spanAt } from './codegen';
import { createWidgetBar, type WidgetBarHandle } from './ui/widgetBar';
import { initDeck, renderDeck, toggleRecord } from './ui/deck';
import type { CodeSpan, SelectionKind } from './types';

let editor: EditorHandle;
let widgetBar: WidgetBarHandle;
let evalDebounce: number | null = null;
let liveEvalDebounce: number | null = null;
let lastRevision = -1;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function currentCode(): string {
  return generate(store.state.song).code;
}

function visibleDoc(): string {
  return editor ? editor.view.state.doc.toString() : currentCode();
}

/** hot-swap the *visible* code — used by widget sliders (throttled by callers) */
function liveEval(): void {
  if (liveEvalDebounce !== null) window.clearTimeout(liveEvalDebounce);
  liveEvalDebounce = window.setTimeout(async () => {
    liveEvalDebounce = null;
    if (!store.state.isPlaying) return;
    try {
      await enginePlay(visibleDoc());
      setEvalStatus('live', 'ok');
    } catch (err) {
      setEvalStatus('error', 'err');
      showToast(errText(err), 'error');
    }
  }, 80);
}

function refreshCode(evaluateIfPlaying: boolean): void {
  const { code, spans } = generate(store.state.song);
  editor.setCode(code, spans);
  widgetBar?.update(code);
  if (evaluateIfPlaying && store.state.isPlaying) {
    if (evalDebounce !== null) window.clearTimeout(evalDebounce);
    setEvalStatus('hot-swapping…', 'busy');
    evalDebounce = window.setTimeout(async () => {
      evalDebounce = null;
      try {
        await enginePlay(code);
        setEvalStatus('live', 'ok');
      } catch (err) {
        setEvalStatus('error', 'err');
        showToast(errText(err), 'error');
      }
    }, 140);
  }
}

function setEvalStatus(text: string, tone: 'ok' | 'busy' | 'err' | 'idle'): void {
  const el = $('eval-status');
  el.textContent = text;
  el.dataset.tone = tone;
}

function refreshAll(): void {
  const modelChanged = store.state.revision !== lastRevision;
  lastRevision = store.state.revision;
  // A revision bump means the model (or an undo/redo) changed the code.
  // A bare handEdited flag flip must NOT clobber what the user is typing.
  if (modelChanged) refreshCode(true);
  if (!store.state.inspectorHold) {
    renderInspector($('inspector-panel'));
  }
  renderTimeline($('strips'));
  // topbar
  const { song } = store.state;
  ($('bpm-range') as HTMLInputElement).value = String(song.bpm);
  ($('bpm-num') as HTMLInputElement).value = String(song.bpm);
  $('icon-play').style.display = store.state.isPlaying ? 'none' : '';
  $('icon-stop').style.display = store.state.isPlaying ? '' : 'none';
  $('btn-play').classList.toggle('playing', store.state.isPlaying);
  $('add-track-strip').classList.toggle('dimmed', song.tracks.length >= 12);
  ($('btn-undo') as HTMLButtonElement).disabled = !store.canUndo();
  ($('btn-redo') as HTMLButtonElement).disabled = !store.canRedo();
}

// ── transport ────────────────────────────────────────────────────────────────
async function togglePlay(): Promise<void> {
  if (store.state.isPlaying) {
    engineStop();
    store.setPlaying(false);
    setEvalStatus('stopped', 'idle');
    return;
  }
  const code = visibleDoc(); // the editor is what the user hears — hand edits included
  setEvalStatus('starting…', 'busy');
  try {
    await enginePlay(code);
    store.setPlaying(true);
    setEvalStatus('live', 'ok');
  } catch (err) {
    setEvalStatus('error', 'err');
    showToast(errText(err), 'error');
  }
}

function errText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 200 ? message.slice(0, 200) + '…' : message;
}

// ── token click → selection + context menu ───────────────────────────────────
function handleTokenClick(
  span: CodeSpan | undefined,
  offset: number,
  x: number,
  y: number,
  button: 0 | 2,
): void {
  if (span) {
    const selectionKind = span.kind as SelectionKind;
    if (span.kind === 'fx') {
      store.select({ kind: 'fx', trackId: span.trackId, fxId: span.fxId });
    } else {
      store.select({ kind: selectionKind, trackId: span.trackId });
    }
    showContextMenu(x, y, buildMenu(span, offset));
    return;
  }
  if (button === 2) {
    // right-click on empty space → “add layer” / general actions
    showContextMenu(x, y, buildMenu(undefined, offset));
  }
}

// ── save / open ──────────────────────────────────────────────────────────────
async function saveSong(): Promise<void> {
  const json = JSON.stringify(store.state.song, null, 2);
  const suggested = `${store.state.song.name.replace(/[^a-z0-9-_ ]/gi, '_') || 'song'}.strudel.json`;
  if (isTauriRuntime()) {
    try {
      const path = await (await import('@tauri-apps/plugin-dialog')).save({
        defaultPath: suggested,
        filters: [{ name: 'Strudel Studio song', extensions: ['strudel.json', 'json'] }],
      });
      if (!path) return;
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_text_file', { path, contents: json });
      showToast(`Saved → ${path}`);
    } catch (err) {
      showToast(`Save failed: ${errText(err)}`, 'error');
    }
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggested;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function openSong(): Promise<void> {
  if (isTauriRuntime()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        multiple: false,
        filters: [{ name: 'Strudel Studio song', extensions: ['strudel.json', 'json'] }],
      });
      if (!path || Array.isArray(path)) return;
      const { invoke } = await import('@tauri-apps/api/core');
      const json = await invoke<string>('read_text_file', { path });
      loadSongJson(json);
    } catch (err) {
      showToast(`Open failed: ${errText(err)}`, 'error');
    }
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    file.text().then(loadSongJson);
  });
  input.click();
}

function loadSongJson(json: string): void {
  try {
    const song = JSON.parse(json);
    if (song?.formatVersion !== 1 || !Array.isArray(song.tracks)) {
      throw new Error('not a Strudel Studio song file');
    }
    store.setSong(song);
    showToast(`Loaded “${song.name ?? 'song'}”`);
  } catch (err) {
    showToast(`Invalid song file: ${errText(err)}`, 'error');
  }
}

// ── custom sample folder ─────────────────────────────────────────────────────
async function pickSampleFolder(): Promise<void> {
  if (!isTauriRuntime()) {
    showToast('Folder scanning needs the desktop app', 'error');
    return;
  }
  const current = store.state.customSamplesPath ?? '';
  const path = window.prompt('Absolute path to your sample folder (subfolders = banks, .wav/.mp3/.ogg/.flac):', current || 'C:\\samples');
  if (!path) return;
  const input = $('folder-path') as HTMLInputElement;
  input.hidden = false;
  input.value = path;
  try {
    setEvalStatus('scanning samples…', 'busy');
    const folderBanks = await registerFolder(path);
    const bundled = await enumerateBundledBanks();
    store.setSampleBanks([...bundled, ...folderBanks]);
    renderDeck();
    store.setCustomSamplesPath(path);
    const count = folderBanks.reduce((acc, b) => acc + b.sounds.length, 0);
    showToast(`Registered ${count} sounds from ${folderBanks.length} bank(s)`);
    setEvalStatus(store.state.isPlaying ? 'live' : 'ready', store.state.isPlaying ? 'ok' : 'idle');
  } catch (err) {
    showToast(`Sample scan failed: ${errText(err)}`, 'error');
    setEvalStatus('error', 'err');
  }
}

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  initToasts();
  initContextMenuGlobal();

  // left panel + blocks
  renderBlocksPanel($('blocks-panel'));

  // widget bar (live sliders from slider() calls in the code)
  widgetBar = createWidgetBar($('widget-bar'), {
    getDoc: () => editor.view.state.doc.toString(),
    replaceRange: (from, to, text) => editor.replaceRange(from, to, text),
    onLiveChange: () => liveEval(),
  });

  // editor
  editor = createEditor(
    $('editor'),
    (span, offset, x, y, button) => handleTokenClick(span, offset, x, y, button),
    () => {
      // manual typing: mark as hand-edited; don't fight the user's caret
      store.setHandEdited(true);
      widgetBar.update(editor.view.state.doc.toString());
    },
  );

  // scope
  const scope = new Scope($('scope') as HTMLCanvasElement);
  $('scope-mode-time').addEventListener('click', () => {
    scope.setMode('time');
    $('scope-mode-time').classList.add('active');
    $('scope-mode-freq').classList.remove('active');
  });
  $('scope-mode-freq').addEventListener('click', () => {
    scope.setMode('frequency');
    $('scope-mode-freq').classList.add('active');
    $('scope-mode-time').classList.remove('active');
  });

  // transport + bpm
  $('btn-play').addEventListener('click', () => void togglePlay());
  $('btn-undo').addEventListener('click', () => store.undo());
  $('btn-redo').addEventListener('click', () => store.redo());
  $('btn-hush').addEventListener('click', () => {
    enginePanic();
    store.setPlaying(false);
    setEvalStatus('silenced', 'idle');
  });
  const applyBpm = (value: number) => {
    if (Number.isFinite(value)) store.setBpm(Math.min(300, Math.max(20, Math.round(value))));
  };
  $('bpm-range').addEventListener('input', (e) => applyBpm(Number((e.target as HTMLInputElement).value)));
  $('bpm-num').addEventListener('change', (e) => applyBpm(Number((e.target as HTMLInputElement).value)));

  // file ops
  $('btn-save').addEventListener('click', () => void saveSong());
  $('btn-open').addEventListener('click', () => void openSong());
  $('btn-folder').addEventListener('click', () => void pickSampleFolder());
  $('folder-path').addEventListener('change', (e) => {
    const path = (e.target as HTMLInputElement).value.trim();
    if (path) void pickSampleFolder();
  });

  // editor toolbar
  $('btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(visibleDoc());
      showToast('Code copied to clipboard');
    } catch {
      showToast('Clipboard unavailable', 'error');
    }
  });
  $('btn-format').addEventListener('click', () => {
    refreshCode(false);
    showToast('Code regenerated from model');
  });

  // add-layer strip button → nudge the blocks panel
  $('add-track-strip').addEventListener('click', () => {
    const left = $('leftbar');
    left.classList.remove('nudge');
    void left.offsetWidth;
    left.classList.add('nudge');
    showToast('Pick a block from the library', 'info');
  });

  // when the recorder is armed, playback starts automatically if it isn't running
  window.addEventListener('studio.autoplay', () => {
    if (!store.state.isPlaying) void togglePlay();
  });
  // deck asks to start playback (take replay)
  window.addEventListener('studio.play-from', () => {
    if (!store.state.isPlaying) void togglePlay();
  });
  // deck asks to stop playback
  window.addEventListener('studio.pause-playback', () => {
    if (store.state.isPlaying) void togglePlay();
  });

  // performance recorder
  initDeck();

  // keyboard
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    const isForm = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target?.isContentEditable ?? false);
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      void togglePlay();
    } else if (mod && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      void saveSong();
    } else if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      store.undo();
    } else if ((mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) || (mod && e.key === 'y')) {
      e.preventDefault();
      store.redo();
    } else if (!isForm && (e.key === 'r' || e.key === 'R')) {
      toggleRecord();
    } else if (e.key === 'Escape') {
      hideContextMenu();
    }
  });
  window.addEventListener('pointerup', () => {
    // Only intervene when an inspector slider was actually being dragged.
    // Never rebuild DOM for ordinary clicks — a rebuild mid-release detaches
    // the button and the browser never fires `click`.
    if (!store.state.inspectorHold) return;
    store.setInspectorHold(false);
    store.touch(); // one reconciliation pass for the finished gesture
  });
  window.addEventListener('blur', () => {
    // mouse released off-window: never leave the inspector frozen
    if (store.state.inspectorHold) {
      store.setInspectorHold(false);
      store.touch();
    }
  });
  window.addEventListener('keyup', () => {
    if (!store.state.inspectorHold) return;
    store.setInspectorHold(false);
    store.touch();
  });

  // ── live hap highlighting: editor tokens glow + strips pulse on trigger ──
  const stripFlashTimers = new Map<string, number>();
  const flashStrip = (trackId: string): void => {
    const el = document.querySelector(`.strip[data-track-id="${CSS.escape(trackId)}"]`);
    if (!el) return;
    el.classList.add('triggered');
    const existing = stripFlashTimers.get(trackId);
    if (existing) window.clearTimeout(existing);
    stripFlashTimers.set(trackId, window.setTimeout(() => el.classList.remove('triggered'), 340));
  };

  onHapFlash((flash) => {
    editor.flash(flash.locations, flash.durationMs);
    const spansNow = editor.spans();
    const trackIds = new Set<string>();
    for (const loc of flash.locations) {
      const span = spanAt(spansNow, loc.from) ?? spanAt(spansNow, Math.max(0, loc.to - 1));
      if (span) trackIds.add(span.trackId);
    }
    for (const id of trackIds) flashStrip(id);
  });

  // single store subscription drives everything
  store.subscribe(() => refreshAll());

  // initial sample banks
  try {
    const bundled = await enumerateBundledBanks();
    store.setSampleBanks(bundled);
    renderDeck();
  } catch (err) {
    console.warn('[boot] sample enumeration failed', err);
  }
  if (store.state.customSamplesPath) {
    void registerFolder(store.state.customSamplesPath).then(async (folderBanks) => {
      const bundled = await enumerateBundledBanks();
      store.setSampleBanks([...bundled, ...folderBanks]);
      renderDeck();
    }).catch(() => {
      console.warn('[boot] custom sample folder unavailable');
    });
  }

  refreshAll();
  setEvalStatus('ready — press play', 'idle');
}

boot().catch((err) => {
  console.error(err);
  showToast(`Boot failed: ${errText(err)}`, 'error');
});
