// ─── Right sidebar: contextual inspector ─────────────────────────────────────
import { store } from '../state';
import type { Track, Automation, AutomationWave, AutomationTarget } from '../types';
import { FX_CATALOG, FX_MAP, fxDefault, formatNumber } from '../fx';
import { WAVES } from '../blocks';
import { decodePeaks } from '../engine';
import type { SampleBank } from '../samples';
import { soundList } from '../samples';

type SliderOpts = {
  log?: boolean;
  unit?: string;
  dp?: number;
  onChange: (v: number) => void;
};

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls: string, children?: (Node | string)[] | string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (children != null) {
    if (typeof children === 'string') el.textContent = children;
    else el.append(...children);
  }
  return el;
}

const svg = (path: string, size = 14) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICONS = {
  power: '<path d="M12 3v9"/><path d="M6.3 6.5a8 8 0 1 0 11.4 0"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1.5 14a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8L18 6"/>',
  fx: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="5"/>',
  lfo: '<path d="M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/>',
  plug: '<path d="M9 7V3M15 7V3M7 7h10v5a5 5 0 0 1-10 0V7z"/><path d="M12 17v4"/>',
  transpose: '<path d="M7 17 17 7M7 7h6M17 7v6"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><path d="M20.2 12a8.2 8.2 0 1 1-3-6.3"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="0.5" fill="currentColor"/><circle cx="15" cy="15" r="0.5" fill="currentColor"/><circle cx="15" cy="9" r="0.5" fill="currentColor"/><circle cx="9" cy="15" r="0.5" fill="currentColor"/>',
};

function sliderRow(label: string, value: number, min: number, max: number, opts: SliderOpts): HTMLElement {
  const row = h('div', 'ctl-row');
  const head = h('div', 'ctl-head', [
    h('span', 'ctl-label', label),
    h('span', 'ctl-value', `${formatNum(value, opts.dp ?? 2)}${opts.unit ? ' ' + opts.unit : ''}`),
  ]);
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'ctl-slider';
  if (opts.log) {
    input.min = '0'; input.max = '1'; input.step = '0.001';
    input.value = String(logPos(value, min, max));
  } else {
    input.min = String(min); input.max = String(max); input.step = String((max - min) / 200 || 0.01);
    input.value = String(value);
  }
  const valueEl = head.querySelector('.ctl-value') as HTMLElement;
  input.addEventListener('pointerdown', () => store.setInspectorHold(true));
  input.addEventListener('keydown', () => store.setInspectorHold(true));
  input.addEventListener('input', () => {
    let v = Number(input.value);
    if (opts.log) v = Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * v);
    opts.onChange(v);
    valueEl.textContent = `${formatNum(v, opts.dp ?? 2)}${opts.unit ? ' ' + opts.unit : ''}`;
  });
  const release = () => store.setInspectorHold(false);
  input.addEventListener('change', release);
  row.append(head, input);
  return row;
}

function logPos(v: number, min: number, max: number): number {
  return (Math.log(Math.max(v, min)) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

function formatNum(v: number, dp: number): string {
  return v.toFixed(dp).replace(/\.?0+$/, '').replace(/^-0$/, '0');
}

function section(title: string): HTMLElement {
  return h('div', 'insp-section-title', title);
}

export function renderInspector(root: HTMLElement): void {
  root.innerHTML = '';
  const { song, selection, sampleBanks } = store.state;
  const track = store.selectedTrack();

  // context label in header
  const ctxLabel = document.getElementById('inspector-context');
  if (ctxLabel) ctxLabel.textContent = describeSelection(selection.kind, track?.name);

  if (!track) {
    renderSongOverview(root, song.tracks.length);
    return;
  }

  renderTrackHeader(root, track);

  switch (selection.kind) {
    case 'drums-pattern':
    case 'synth-pattern':
      renderPatternEditor(root, track, selection.kind === 'drums-pattern', sampleBanks);
      break;
    case 'synth-source':
      renderWavePicker(root, track);
      break;
    case 'drums-source':
      renderSamplePicker(root, track, sampleBanks);
      break;
    case 'gain':
      renderGainEditor(root, track);
      break;
    case 'automation':
      renderAutomationEditor(root, track);
      break;
    default:
      renderTrackBody(root, track, sampleBanks);
  }

  renderFxChain(root, track);
  renderAutomation(root, track);
  renderOrbit(root, track);
}

function describeSelection(kind: string, name?: string): string {
  switch (kind) {
    case 'none': return 'nothing selected';
    case 'track': return `track · ${name ?? ''}`;
    case 'drums-pattern': return `pattern · ${name ?? ''}`;
    case 'synth-pattern': return `notes · ${name ?? ''}`;
    case 'drums-source': return `sample · ${name ?? ''}`;
    case 'synth-source': return `waveform · ${name ?? ''}`;
    case 'gain': return `gain · ${name ?? ''}`;
    case 'automation': return `LFO · ${name ?? ''}`;
    case 'fx': return `effect · ${name ?? ''}`;
    case 'orbit': return `orbit · ${name ?? ''}`;
    default: return kind;
  }
}

// ── song overview (nothing selected) ─────────────────────────────────────────
function renderSongOverview(root: HTMLElement, trackCount: number): void {
  const { song } = store.state;
  root.appendChild(section('Song'));

  const nameInput = document.createElement('input');
  nameInput.className = 'text-input';
  nameInput.value = song.name;
  nameInput.spellcheck = false;
  nameInput.placeholder = 'Song name…';
  nameInput.addEventListener('change', () => {
    song.name = nameInput.value.trim() || 'Untitled Song';
    store.touch();
  });
  root.appendChild(labeled('Name', nameInput));

  root.appendChild(sliderRow('Tempo (cycles/min)', song.bpm, 40, 240, {
    dp: 0, unit: 'bpm', onChange: (v) => store.setBpm(Math.round(v)),
  }));

  root.appendChild(section('Layers'));
  if (song.tracks.length === 0) {
    root.appendChild(h('div', 'empty-note', 'No layers yet — click a block on the left, or press play with the default groove.'));
  }
  for (const t of song.tracks) {
    const row = h('button', 'track-jump') as HTMLButtonElement;
    row.innerHTML = `<span class="tj-dot" style="background:${t.color}"></span><span class="tj-name">${escapeHtml(t.name)}</span><span class="tj-kind">${t.source}</span>`;
    row.addEventListener('click', () => store.selectTrack(t.id, 'track'));
    root.appendChild(row);
  }

  root.appendChild(section('How to play'));
  const help = h('div', 'help-block');
  help.innerHTML = `
    <p><b>Click any coloured token</b> in the code to edit or transform it.</p>
    <p><b>Right-click</b> anywhere for actions valid at that spot.</p>
    <p><b>Ctrl/⌘+Enter</b> plays or stops. Edits hot-swap live while playing.</p>
    <p>The <b>timeline</b> at the bottom is your mixer: mute, solo, gain, FX and LFOs per layer.</p>`;
  root.appendChild(help);
}

// ── track header ─────────────────────────────────────────────────────────────
function renderTrackHeader(root: HTMLElement, track: Track): void {
  const head = h('div', 'track-head');
  const dot = h('div', 'track-dot');
  dot.style.background = track.color;

  const nameInput = document.createElement('input');
  nameInput.className = 'track-name';
  nameInput.value = track.name;
  nameInput.spellcheck = false;
  nameInput.addEventListener('change', () => store.updateTrack(track.id, { name: nameInput.value.trim() || track.name }));

  const muteBtn = h('button', `pill-btn${track.muted ? ' on-danger' : ''}`, 'M') as HTMLButtonElement;
  muteBtn.title = 'Mute track (silenced in code — undoable)';
  muteBtn.addEventListener('click', () => store.updateTrack(track.id, { muted: !track.muted }));

  const soloBtn = h('button', `pill-btn${track.solo ? ' on-warn' : ''}`, 'S') as HTMLButtonElement;
  soloBtn.title = 'Solo track';
  soloBtn.addEventListener('click', () => store.updateTrack(track.id, { solo: !track.solo }));

  const deleteBtn = h('button', 'pill-btn delete-btn', '×') as HTMLButtonElement;
  deleteBtn.title = 'Delete this layer entirely — the whole code block goes with it (Ctrl+Z to undo)';
  deleteBtn.addEventListener('click', () => store.removeTrack(track.id));

  head.append(dot, nameInput, muteBtn, soloBtn, deleteBtn);
  root.appendChild(head);
}

// ── pattern editor ───────────────────────────────────────────────────────────
function renderPatternEditor(root: HTMLElement, track: Track, isDrums: boolean, sampleBanks: SampleBank[]): void {
  root.appendChild(section(isDrums ? 'Drum Pattern (mini-notation)' : 'Note Pattern (mini-notation)'));

  const ta = document.createElement('textarea');
  ta.className = 'pattern-input';
  ta.spellcheck = false;
  ta.rows = 2;
  ta.value = isDrums ? track.drumPattern : track.notePattern;
  ta.addEventListener('change', () => {
    const value = ta.value.trim() || '~';
    store.updateTrack(track.id, isDrums ? { drumPattern: value } : { notePattern: value });
  });
  root.appendChild(ta);

  // quick-insert chips
  const chips = h('div', 'chip-row');
  const tokens: [string, string][] = [
    ['*2', 'double speed'], ['*3', 'triple'], ['*4', 'quad'], ['[a b]', 'one step'], ['<a b>', 'alternate'],
    ['(3,8)', 'euclidean'], ['~', 'rest'], ['!2', 'repeat'], ['?', '50% chance'], [',', 'stack'], ['(5,8,2)', 'eucl shift'],
  ];
  for (const [tok, title] of tokens) {
    const chip = h('button', 'chip', tok) as HTMLButtonElement;
    chip.title = title;
    chip.addEventListener('click', () => {
      const at = ta.selectionStart ?? ta.value.length;
      const next = ta.value.slice(0, at) + tok + ta.value.slice(at);
      ta.value = next;
      store.updateTrack(track.id, isDrums ? { drumPattern: next } : { notePattern: next });
      ta.focus();
      ta.selectionStart = ta.selectionEnd = at + tok.length;
    });
    chips.appendChild(chip);
  }
  root.appendChild(chips);

  // note palette for synths
  if (!isDrums) {
    root.appendChild(section('Notes'));
    const notes = ['c2','e2','g2','a2','c3','d3','e3','g3','a3','b3','c4','d4','e4','g4','a4','c5','e5','g5'];
    const grid = h('div', 'note-grid');
    for (const n of notes) {
      const chip = h('button', 'chip note-chip', n) as HTMLButtonElement;
      chip.addEventListener('click', () => {
        const at = ta.selectionStart ?? ta.value.length;
        const sep = at > 0 && !/\s|[[,{]/.test(ta.value[at - 1] ?? '') ? ' ' : '';
        const ins = sep + n;
        const next = ta.value.slice(0, at) + ins + ta.value.slice(at);
        ta.value = next;
        store.updateTrack(track.id, { notePattern: next });
        ta.focus();
        ta.selectionStart = ta.selectionEnd = at + ins.length;
      });
      grid.appendChild(chip);
    }
    root.appendChild(grid);
  }

  // drum sound picker for drums
  if (isDrums) {
    renderSamplePicker(root, track, sampleBanks, ta);
  }
}

// ── sample picker + waveform preview ─────────────────────────────────────────
// remember the last previewed sample so re-renders (which recreate the canvas) can redraw from cache
let lastPreview: { url: string; name: string } | null = null;

function renderSamplePicker(
  root: HTMLElement,
  track: Track,
  banks: SampleBank[],
  patternTarget?: HTMLTextAreaElement,
): void {
  root.appendChild(section('Sample Banks'));

  const list = soundList(banks);
  if (list.length === 0) {
    root.appendChild(h('div', 'empty-note', 'No samples found. The bundled drum kit should appear here — check the console.'));
    return;
  }

  const search = document.createElement('input');
  search.className = 'text-input';
  search.placeholder = 'Filter sounds…';
  search.spellcheck = false;
  root.appendChild(search);

  const grid = h('div', 'sample-grid');
  const preview = h('canvas', 'sample-wave') as HTMLCanvasElement;
  preview.width = 520;
  preview.height = 72;

  const draw = (peaks: Float32Array | null, label: string) => {
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, preview.width, preview.height);
    // panel background so the shape reads on any theme
    ctx.fillStyle = '#141824';
    ctx.fillRect(0, 0, preview.width, preview.height);
    ctx.strokeStyle = '#232940';
    ctx.beginPath(); ctx.moveTo(0, preview.height / 2); ctx.lineTo(preview.width, preview.height / 2); ctx.stroke();
    if (peaks) {
      const n = peaks.length / 2;
      const mid = preview.height / 2;
      const amp = preview.height / 2 - 4;
      const grad = ctx.createLinearGradient(0, 0, preview.width, 0);
      grad.addColorStop(0, '#35e0ff');
      grad.addColorStop(0.5, '#ff3ea5');
      grad.addColorStop(1, '#b6ff3b');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / n) * preview.width;
        const yMin = mid + peaks[i * 2] * amp;
        const yMax = mid + peaks[i * 2 + 1] * amp;
        ctx.moveTo(x, yMin);
        ctx.lineTo(x, Math.max(yMin + 1, yMax));
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    const caption = preview.nextSibling as HTMLElement | null;
    if (caption) caption.textContent = label;
  };

  const previewSound = (s: { name: string; url: string }, captionFail?: boolean) => {
    lastPreview = { url: s.url, name: s.name };
    decodePeaks(s.url, 130)
      .then((p) => draw(p, `♪ ${s.name}`))
      .catch(() => draw(null, `${s.name} — failed to decode`));
  };

  const renderGrid = (filter: string) => {
    grid.innerHTML = '';
    const f = filter.trim().toLowerCase();
    const matches = list.filter((s) => !f || s.name.toLowerCase().includes(f)).slice(0, 60);
    for (const s of matches) {
      const chip = h('div', 'sample-chip') as HTMLDivElement;
      chip.setAttribute('role', 'button');
      chip.title = `${s.name} — click to preview${s.variations > 1 ? ` (${s.variations} variations, pick with n())` : ''}`;
      chip.innerHTML = `<span class="sc-name">${escapeHtml(s.name)}</span>${s.variations > 1 ? `<span class="sc-n">×${s.variations}</span>` : ''}`;
      chip.addEventListener('click', () => previewSound(s));
      const insert = h('button', 'sc-insert', '+') as HTMLButtonElement;
      insert.title = `Insert “${s.name}” into the pattern`;
      insert.addEventListener('click', (e) => {
        e.stopPropagation();
        if (patternTarget) {
          const at = patternTarget.selectionStart ?? patternTarget.value.length;
          const sep = at > 0 && !/[\s,\[]/.test(patternTarget.value[at - 1] ?? '') ? ' ' : '';
          const ins = sep + s.name;
          const next = patternTarget.value.slice(0, at) + ins + patternTarget.value.slice(at);
          store.updateTrack(track.id, { drumPattern: next });
          // focus restoration happens after re-render; keep preview visible
          lastPreview = { url: s.url, name: s.name };
        } else {
          store.updateTrack(track.id, { drumPattern: s.name });
          lastPreview = { url: s.url, name: s.name };
        }
      });
      chip.appendChild(insert);
      grid.appendChild(chip);
    }
    if (matches.length === 0) grid.appendChild(h('div', 'empty-note', 'No sounds match that filter.'));
  };

  search.addEventListener('input', () => renderGrid(search.value));
  renderGrid('');
  root.append(grid, preview);
  root.appendChild(h('div', 'wave-caption', '— click a sound to preview its waveform'));
  // repaint from cache after re-renders triggered by model edits
  if (lastPreview) {
    decodePeaks(lastPreview.url, 130)
      .then((p) => draw(p, `♪ ${lastPreview!.name}`))
      .catch(() => { /* keep idle caption */ });
  }
}

// ── wave picker ──────────────────────────────────────────────────────────────
function renderWavePicker(root: HTMLElement, track: Track): void {
  root.appendChild(section('Oscillator Wave'));
  const grid = h('div', 'wave-grid');
  for (const wave of WAVES) {
    const btn = h('button', `wave-btn${track.wave === wave ? ' selected' : ''}`) as HTMLButtonElement;
    btn.innerHTML = `<canvas width="96" height="34"></canvas><span>${wave}</span>`;
    const canvas = btn.querySelector('canvas')!;
    drawWaveShape(canvas, wave);
    btn.addEventListener('click', () => store.updateTrack(track.id, { wave }));
    grid.appendChild(btn);
  }
  root.appendChild(grid);

  root.appendChild(section('Pitch'));
  root.appendChild(sliderRow('Octave shift', track.octave, -2, 2, {
    dp: 0, unit: 'oct', onChange: (v) => store.updateTrack(track.id, { octave: Math.round(v) }),
  }));
}

function drawWaveShape(canvas: HTMLCanvasElement, wave: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, hpx = canvas.height;
  ctx.clearRect(0, 0, w, hpx);
  ctx.strokeStyle = '#35e0ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#35e0ff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let x = 0; x <= w; x++) {
    const t = (x / w) * 2 * Math.PI * 1.75;
    let y: number;
    switch (wave) {
      case 'sine': y = Math.sin(t); break;
      case 'square': y = Math.sign(Math.sin(t)) * 0.9; break;
      case 'triangle': y = (2 / Math.PI) * Math.asin(Math.sin(t)); break;
      default: y = (2 * ((t / (2 * Math.PI)) % 1) - 1) * 0.95; // sawtooth
    }
    const py = hpx / 2 - y * (hpx / 2 - 3);
    if (x === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
  }
  ctx.stroke();
}

// ── gain editor ──────────────────────────────────────────────────────────────
function renderGainEditor(root: HTMLElement, track: Track): void {
  root.appendChild(section('Gain'));
  root.appendChild(sliderRow('Level', track.gain, 0, 1.5, {
    dp: 2, onChange: (v) => store.updateTrack(track.id, { gain: v }),
  }));
  const autoNote = h('div', 'hint-note');
  autoNote.innerHTML = track.automation?.target === 'gain'
    ? 'A gain LFO is active — the slider is replaced by the LFO in the code.'
    : 'Want movement? Add a gain LFO from the automation section below.';
  root.appendChild(autoNote);
}

// ── automation editor ────────────────────────────────────────────────────────
const WAVE_NAMES: AutomationWave[] = ['sine', 'saw', 'isaw', 'tri', 'square', 'rand', 'perlin'];

function renderAutomationEditor(root: HTMLElement, track: Track): void {
  root.appendChild(section('Automation'));
  const a = track.automation;
  if (!a) {
    root.appendChild(h('div', 'empty-note', 'No automation on this track. Add one below.'));
    return;
  }
  root.appendChild(renderAutomationControls(track, a));
}

function renderAutomationControls(track: Track, a: Automation): HTMLElement {
  const frag = h('div', `auto-panel${a.bypassed ? ' bypassed' : ''}`);

  const headRow = h('div', 'auto-head');
  const targetRow = h('div', 'ctl-row auto-target-row');
  targetRow.appendChild(h('span', 'ctl-label', `Target: ${a.target}${a.bypassed ? '  (bypassed)' : ''}`));
  headRow.appendChild(targetRow);
  const powerBtn = h('button', `lfo-btn power${a.bypassed ? ' off' : ''}`) as HTMLButtonElement;
  powerBtn.innerHTML = svg(ICONS.power, 13);
  powerBtn.title = a.bypassed ? 'Enable LFO (unmute)' : 'Bypass LFO (mute — stays in the layer, silent in code)';
  powerBtn.addEventListener('click', () => store.updateTrack(track.id, { automation: { ...a, bypassed: !a.bypassed } }));
  headRow.appendChild(powerBtn);
  frag.appendChild(headRow);

  // wave buttons
  const waveGrid = h('div', 'auto-wave-grid');
  for (const wave of WAVE_NAMES) {
    const btn = h('button', `auto-wave${a.wave === wave ? ' selected' : ''}`, wave) as HTMLButtonElement;
    btn.addEventListener('click', () => store.updateTrack(track.id, { automation: { ...a, wave } }));
    waveGrid.appendChild(btn);
  }
  frag.appendChild(waveGrid);

  frag.appendChild(sliderRow('Rate (cycles per sweep)', a.rate, 0.5, 16, {
    dp: 1, log: true, onChange: (v) => store.updateTrack(track.id, { automation: { ...a, rate: Math.max(0.5, v) } }),
  }));
  frag.appendChild(sliderRow('Depth', a.depth, 0.05, 1, {
    dp: 2, onChange: (v) => store.updateTrack(track.id, { automation: { ...a, depth: v } }),
  }));

  const remove = h('button', 'chip danger-chip', 'Remove automation (Ctrl+Z to undo)') as HTMLButtonElement;
  remove.addEventListener('click', () => store.updateTrack(track.id, { automation: null }));
  frag.appendChild(remove);
  return frag;
}

// ── layer contents (default view) — every additive in one removable list ──────
function renderTrackBody(root: HTMLElement, track: Track, banks: SampleBank[]): void {
  void banks;

  // source summary card
  root.appendChild(section(track.source === 'drums' ? 'Drums' : 'Synth'));
  const summary = h('div', 'source-summary');
  if (track.source === 'drums') {
    summary.appendChild(h('div', 'ss-line', `pattern: ${track.drumPattern}`));
    if (track.sampleIndex > 0) summary.appendChild(h('div', 'ss-line', `variation: n = ${track.sampleIndex}`));
  } else {
    summary.appendChild(h('div', 'ss-line', `notes: ${track.notePattern}`));
    summary.appendChild(h('div', 'ss-line', `wave: ${track.wave}${track.octave ? ` · octave ${track.octave > 0 ? '+' : ''}${track.octave}` : ''}`));
  }
  const edit = h('button', 'chip', 'Edit pattern →') as HTMLButtonElement;
  edit.addEventListener('click', () => store.selectTrack(track.id, track.source === 'drums' ? 'drums-pattern' : 'synth-pattern'));
  summary.appendChild(edit);
  root.appendChild(summary);

  // ── the unified "layer contents" list ─────────────────────────────────────
  const additives = collectAdditives(track);
  const headRow = h('div', 'contents-head');
  headRow.appendChild(h('span', 'insp-section-title contents-title', `Layer Contents`));
  const count = h('span', 'contents-count', String(additives.length));
  headRow.appendChild(count);
  if (additives.length > 0) {
    const clearAll = h('button', 'icon-round danger') as HTMLButtonElement;
    clearAll.innerHTML = svg(ICONS.trash, 13);
    clearAll.title = 'Remove every additive from this layer (undoable with Ctrl+Z)';
    clearAll.addEventListener('click', () => store.clearAdditives(track.id));
    headRow.appendChild(clearAll);
  }
  root.appendChild(headRow);

  if (additives.length === 0) {
    root.appendChild(h('div', 'empty-note', 'Nothing added yet — this layer is just the raw source. Add effects below, click tokens in the code, or use the context menu on the timeline.'));
  } else {
    const list = h('div', 'contents-list');
    for (const item of additives) {
      list.appendChild(renderAdditiveRow(track, item));
    }
    root.appendChild(list);
  }

  root.appendChild(section('Gain'));
  root.appendChild(sliderRow('Level', track.gain, 0, 1.5, {
    dp: 2, onChange: (v) => store.updateTrack(track.id, { gain: v }),
  }));
}

interface AdditiveItem {
  key: string;
  icon: string;
  label: string;
  detail: string;
  bypassed: boolean;
  canBypass: boolean;
  canStep?: { back: () => void; fwd: () => void };
  select?: () => void;
  toggleBypass?: () => void;
  remove: () => void;
}

function collectAdditives(track: Track): AdditiveItem[] {
  const items: AdditiveItem[] = [];

  if (track.sampleIndex > 0) {
    items.push({
      key: 'n', icon: ICONS.dice, label: `Sample variation`, detail: `n = ${track.sampleIndex}`,
      bypassed: false, canBypass: false,
      canStep: {
        back: () => store.updateTrack(track.id, { sampleIndex: Math.max(0, track.sampleIndex - 1) }),
        fwd: () => store.updateTrack(track.id, { sampleIndex: track.sampleIndex + 1 }),
      },
      remove: () => store.updateTrack(track.id, { sampleIndex: 0 }),
    });
  }

  if (track.octave !== 0) {
    items.push({
      key: 'octave', icon: ICONS.transpose, label: `Octave shift`, detail: `${track.octave > 0 ? '+' : ''}${track.octave} (${track.octave > 0 ? '+' : ''}${track.octave * 12} semitones)`,
      bypassed: false, canBypass: false,
      canStep: {
        back: () => store.updateTrack(track.id, { octave: track.octave - 1 }),
        fwd: () => store.updateTrack(track.id, { octave: track.octave + 1 }),
      },
      remove: () => store.updateTrack(track.id, { octave: 0 }),
    });
  }

  for (const fx of track.fx) {
    const def = FX_MAP[fx.type];
    const bypassed = !!fx.bypassed;
    items.push({
      key: fx.id, icon: ICONS.plug, label: def?.label ?? fx.type,
      detail: formatFxValue(fx.type, fx.value),
      bypassed, canBypass: true,
      select: () => store.select({ kind: 'fx', trackId: track.id, fxId: fx.id }),
      toggleBypass: () =>
        store.updateTrack(track.id, { fx: track.fx.map((f) => (f.id === fx.id ? { ...f, bypassed: !f.bypassed } : f)) }),
      remove: () => store.updateTrack(track.id, { fx: track.fx.filter((f) => f.id !== fx.id) }),
    });
  }

  if (track.automation) {
    const a = track.automation;
    items.push({
      key: 'automation', icon: ICONS.lfo, label: `LFO → ${a.target}`,
      detail: `${a.wave} · 1 sweep / ${a.rate.toFixed(1)} cycles · depth ${Math.round(a.depth * 100)}%`,
      bypassed: !!a.bypassed, canBypass: true,
      select: () => store.select({ kind: 'automation', trackId: track.id }),
      toggleBypass: () => store.updateTrack(track.id, { automation: { ...a, bypassed: !a.bypassed } }),
      remove: () => store.updateTrack(track.id, { automation: null }),
    });
  }

  if (track.orbit !== null) {
    items.push({
      key: 'orbit', icon: ICONS.orbit, label: `Orbit`, detail: `audio channel ${track.orbit}`,
      bypassed: false, canBypass: false,
      canStep: {
        back: () => store.updateTrack(track.id, { orbit: Math.max(0, (track.orbit ?? 0) - 1) }),
        fwd: () => store.updateTrack(track.id, { orbit: Math.min(9, (track.orbit ?? -1) + 1) }),
      },
      remove: () => store.updateTrack(track.id, { orbit: null }),
    });
  }

  return items;
}

function formatFxValue(fxType: string, value: number | string): string {
  const def = FX_MAP[fxType];
  if (def?.enumValues) return String(value).toUpperCase();
  const p = def?.params?.[0];
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const rounded = p?.log ? (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)) : n.toFixed(p?.dp ?? 2);
  return p?.unit ? `${rounded} ${p.unit}` : String(rounded);
}

function renderAdditiveRow(track: Track, item: AdditiveItem): HTMLElement {
  const row = h('div', `add-row${item.bypassed ? ' bypassed' : ''}`);
  row.setAttribute('role', 'group');

  const icon = h('span', 'add-icon');
  icon.innerHTML = svg(item.icon, 14);
  row.appendChild(icon);

  const body = h('button', 'add-body') as HTMLButtonElement;
  body.innerHTML = `<span class="add-label">${escapeHtml(item.label)}</span><span class="add-detail">${escapeHtml(item.detail)}</span>`;
  if (item.select) body.addEventListener('click', item.select);
  else body.classList.add('no-select');
  body.title = item.select ? 'Click to edit' : item.label;
  row.appendChild(body);

  if (item.canStep) {
    const minus = h('button', 'add-step', '−') as HTMLButtonElement;
    const plus = h('button', 'add-step', '+') as HTMLButtonElement;
    minus.addEventListener('click', item.canStep.back);
    plus.addEventListener('click', item.canStep.fwd);
    row.append(minus, plus);
  }

  if (item.canBypass && item.toggleBypass) {
    const power = h('button', `add-power${item.bypassed ? '' : ' on'}`) as HTMLButtonElement;
    power.innerHTML = svg(ICONS.power, 12);
    power.title = item.bypassed ? 'Enable (unmute)' : 'Bypass (mute — stays in the chain, silent in code)';
    power.addEventListener('click', item.toggleBypass);
    row.appendChild(power);
  }

  const remove = h('button', 'add-remove', '×') as HTMLButtonElement;
  remove.title = 'Remove this additive (Ctrl+Z to undo)';
  remove.addEventListener('click', item.remove);
  row.appendChild(remove);

  return row;
}

// ── fx chain ─────────────────────────────────────────────────────────────────
function renderFxChain(root: HTMLElement, track: Track): void {
  const sectionHead = h('div', 'fx-section-head');
  sectionHead.appendChild(h('span', 'insp-section-title fx-chain-title', 'Effect Chain'));
  if (track.fx.length > 0) {
    const anyLive = track.fx.some((f) => !f.bypassed);
    const bypassAll = h('button', 'mini-tool', anyLive ? 'Bypass all' : 'Enable all') as HTMLButtonElement;
    bypassAll.title = anyLive ? 'Mute every effect (kept in the chain, removed from code)' : 'Re-enable every effect';
    bypassAll.addEventListener('click', () => store.setFxBypassAll(track.id, anyLive));
    const clearAll = h('button', 'mini-tool danger-text', 'Clear all') as HTMLButtonElement;
    clearAll.title = 'Remove every effect (Ctrl+Z to undo)';
    clearAll.addEventListener('click', () => store.clearFx(track.id));
    sectionHead.append(bypassAll, clearAll);
  }
  root.appendChild(sectionHead);

  if (track.fx.length === 0) {
    root.appendChild(h('div', 'empty-note', 'No effects — add one from the shelf below.'));
  }

  for (const fx of track.fx) {
    const def = FX_MAP[fx.type];
    if (!def) continue;
    const bypassed = !!fx.bypassed;
    const card = h('div', `fx-card${bypassed ? ' bypassed' : ''}`);
    const head = h('div', 'fx-head');
    head.appendChild(h('span', 'fx-name', def.label));
    if (bypassed) head.appendChild(h('span', 'fx-bypass-badge', 'BYPASSED'));

    // LFO toggle for automatable params
    const automatable = fx.type === 'pan' || fx.type === 'lpf';
    if (automatable) {
      const active = track.automation?.target === fx.type && !track.automation?.bypassed;
      const lfoBtn = h('button', `lfo-btn${active ? ' active' : ''}`) as HTMLButtonElement;
      lfoBtn.innerHTML = svg(ICONS.lfo, 13);
      lfoBtn.title = active ? 'Automation is live — click to remove the LFO' : `Automate ${fx.type} with an LFO`;
      lfoBtn.addEventListener('click', () => {
        const existing = track.automation?.target === fx.type ? track.automation : null;
        if (existing) store.updateTrack(track.id, { automation: null });
        else store.updateTrack(track.id, { automation: { target: fx.type as 'pan' | 'lpf', wave: 'sine', rate: 4, depth: 0.5 } });
      });
      head.appendChild(lfoBtn);
    }

    // bypass / mute this effect (stays in the chain, silent in code)
    const powerBtn = h('button', `lfo-btn power${bypassed ? ' off' : ''}`) as HTMLButtonElement;
    powerBtn.innerHTML = svg(ICONS.power, 13);
    powerBtn.title = bypassed ? 'Enable effect (unmute)' : 'Bypass effect (mute — stays in the chain)';
    powerBtn.addEventListener('click', () =>
      store.updateTrack(track.id, { fx: track.fx.map((f) => (f.id === fx.id ? { ...f, bypassed: !f.bypassed } : f)) }),
    );
    head.appendChild(powerBtn);

    const removeBtn = h('button', 'fx-remove', '×') as HTMLButtonElement;
    removeBtn.title = 'Remove effect (Ctrl+Z to undo)';
    removeBtn.addEventListener('click', () => store.updateTrack(track.id, { fx: track.fx.filter((f) => f.id !== fx.id) }));
    head.appendChild(removeBtn);
    card.appendChild(head);

    if (def.enumValues) {
      const seg = h('div', 'enum-row');
      for (const v of def.enumValues) {
        const btn = h('button', `enum-btn${fx.value === v ? ' selected' : ''}`, v.toUpperCase()) as HTMLButtonElement;
        btn.addEventListener('click', () => store.updateTrack(track.id, { fx: track.fx.map((f) => (f.id === fx.id ? { ...f, value: v } : f)) }));
        seg.appendChild(btn);
      }
      card.appendChild(seg);
    } else {
      const p = def.params![0];
      card.appendChild(sliderRow(p.label, Number(fx.value), p.min, p.max, {
        log: p.log, dp: p.dp ?? 2, unit: p.unit,
        onChange: (v) => store.updateTrack(track.id, { fx: track.fx.map((f) => (f.id === fx.id ? { ...f, value: v } : f)) }),
      }));
    }
    card.appendChild(h('div', 'fx-hint', def.hint));
    root.appendChild(card);
  }

  // add-effect shelf
  const shelf = h('div', 'fx-shelf');
  shelf.appendChild(h('div', 'fx-shelf-title', 'Add effect'));
  const grid = h('div', 'fx-shelf-grid');
  for (const def of FX_CATALOG) {
    const btn = h('button', 'fx-add') as HTMLButtonElement;
    btn.innerHTML = `<span class="fx-add-name">${def.label}</span>`;
    btn.title = def.hint;
    btn.addEventListener('click', () => {
      store.updateTrack(track.id, {
        fx: [...track.fx, { id: `fx-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, type: def.type, value: fxDefault(def) }],
      });
    });
    grid.appendChild(btn);
  }
  shelf.appendChild(grid);
  root.appendChild(shelf);
}

// ── automation section (always visible) ──────────────────────────────────────
function renderAutomation(root: HTMLElement, track: Track): void {
  root.appendChild(section('Automation (volume changer)'));
  if (track.automation) {
    root.appendChild(renderAutomationControls(track, track.automation));
  } else {
    const row = h('div', 'auto-add-row');
    const target = h('select', 'text-input auto-target') as HTMLSelectElement;
    const targets: [AutomationTarget, string][] = [['gain', 'Gain'], ['pan', 'Pan'], ['lpf', 'Low-pass cutoff']];
    for (const [value, label] of targets) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = `Target: ${label}`;
      target.appendChild(opt);
    }
    const add = h('button', 'chip', 'Add sine LFO') as HTMLButtonElement;
    add.addEventListener('click', () => {
      const targetValue = target.value as AutomationTarget;
      if (targetValue !== 'gain' && !track.fx.some((f) => f.type === targetValue)) {
        // auto-add the fx it will modulate
        const def = FX_MAP[targetValue];
        store.updateTrack(track.id, {
          fx: [...track.fx, { id: `fx-${Date.now().toString(36)}`, type: targetValue, value: fxDefault(def) }],
          automation: { target: targetValue, wave: 'sine', rate: 4, depth: 0.5 },
        });
      } else {
        store.updateTrack(track.id, { automation: { target: targetValue, wave: 'sine', rate: 4, depth: 0.5 } });
      }
    });
    row.append(target, add);
    root.appendChild(row);
    root.appendChild(h('div', 'hint-note', 'LFOs are written straight into the code as signal patterns — strudel modulates the parameter per-event, per-sample.'));
  }
}

// ── orbit ────────────────────────────────────────────────────────────────────
function renderOrbit(root: HTMLElement, track: Track): void {
  root.appendChild(section('Orbit (audio channel)'));
  const row = h('div', 'orbit-row');
  const label = h('span', 'ctl-label', track.orbit === null ? 'Legacy/default channel' : `Orbit ${track.orbit}`);
  const minus = h('button', 'pill-btn', '−') as HTMLButtonElement;
  const plus = h('button', 'pill-btn', '+') as HTMLButtonElement;
  const off = h('button', 'chip', 'Default') as HTMLButtonElement;
  minus.addEventListener('click', () => store.updateTrack(track.id, { orbit: Math.max(0, (track.orbit ?? 0) - 1) }));
  plus.addEventListener('click', () => store.updateTrack(track.id, { orbit: track.orbit === null ? 0 : Math.min(9, track.orbit + 1) }));
  off.addEventListener('click', () => store.updateTrack(track.id, { orbit: null }));
  row.append(label, minus, plus, off);
  root.appendChild(row);
  root.appendChild(h('div', 'hint-note', 'Orbits give independent effects buses — same effect settings stay isolated per orbit.'));
}

function labeled(label: string, control: HTMLElement): HTMLElement {
  const wrap = h('div', 'ctl-row');
  wrap.appendChild(h('span', 'ctl-label', label));
  wrap.appendChild(control);
  return wrap;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
