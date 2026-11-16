// ─── Paste-import dialog ─────────────────────────────────────────────────────
// Shown when the clipboard holds strudel-looking code. Parses it into model
// layers the user can tick on/off, lists sample banks to bake, and flags the
// instruments that aren't in the system (with per-pack retry downloads).
// Nothing happens to the user's code until a button is pressed.

import './importDialog.css';
import { store } from '../state';
import { makeTrack, type Track } from '../types';
import {
  analyze,
  prettyName,
  SOURCE_LABELS,
  type Analysis,
  type DetectedLayer,
} from '../importPattern';
import { showToast } from './toast';
import { remotePackFailures, retryRemotePack } from '../engineFacade';

export interface ImportDialogCallbacks {
  /** insert the pasted text verbatim at the caret (default paste semantics) */
  onPasteAsIs: () => void;
}

const MAX_TRACKS = 12;

export function openImportDialog(text: string, cb: ImportDialogCallbacks): void {
  const analysis = analyze(text);
  const existingNames = new Set(store.state.song.tracks.map((t) => t.name.toLowerCase()));
  const anyKnown = new Set(analysis.sounds.filter((s) => s.known).map((s) => s.name));
  const freeSlots = Math.max(0, MAX_TRACKS - store.state.song.tracks.length);

  // layer rows with dedupe + per-layer warnings
  interface LayerRow {
    layer: DetectedLayer;
    trackName: string;
    warning: string | null;
    allUnknown: boolean;
    el?: HTMLElement;
    checkbox?: HTMLInputElement;
  }
  const rows: LayerRow[] = [];
  const nameCounts = new Map<string, number>();
  for (const layer of analysis.layers) {
    let name = layer.name;
    const base = name;
    while (existingNames.has(name.toLowerCase())) {
      const n = (nameCounts.get(base) ?? 1) + 1;
      nameCounts.set(base, n);
      name = `${base} ${n}`;
    }
    existingNames.add(name.toLowerCase());
    const warning = notePatternWarning(layer);
    // layers whose sounds are all unknown would be silent — default them off
    const allUnknown = layer.sounds.length > 0 && layer.sounds.every((s) => !anyKnown.has(s));
    const mergedWarning = warning ?? (allUnknown ? 'unknown instrument — it will stay silent unless registered elsewhere' : null);
    rows.push({ layer, trackName: name, warning: mergedWarning, allUnknown });
  }

  const overlay = document.createElement('div');
  overlay.className = 'ipd-overlay';
  overlay.innerHTML = `
    <div class="ipd-panel" role="dialog" aria-modal="true" aria-labelledby="ipd-title">
      <header class="ipd-header">
        <div>
          <div class="ipd-eyebrow">Clipboard → layers</div>
          <h2 id="ipd-title">Import this Strudel code</h2>
          <p class="ipd-summary" id="ipd-summary"></p>
        </div>
        <button class="ipd-close" id="ipd-x" title="Close (Esc)" aria-label="Close">×</button>
      </header>
      <div class="ipd-body" id="ipd-body"></div>
      <footer class="ipd-footer">
        <p class="ipd-hint">Can’t map a statement to the app’s layers? Use <b>Paste as-is</b> — the code still plays, it just won’t have layer strips.</p>
        <div class="ipd-actions">
          <button class="ipd-btn ipd-btn-ghost" id="ipd-cancel">Cancel</button>
          <button class="ipd-btn ipd-btn-cyan" id="ipd-asis">Paste as-is</button>
          <button class="ipd-btn ipd-btn-primary" id="ipd-import"></button>
        </div>
      </footer>
    </div>`;
  const body = overlay.querySelector<HTMLElement>('#ipd-body')!;
  const summary = overlay.querySelector<HTMLElement>('#ipd-summary')!;
  const importBtn = overlay.querySelector<HTMLButtonElement>('#ipd-import')!;

  // ── header summary ─────────────────────────────────────────────────────────
  const parts = [
    `${analysis.sounds.length} instrument${analysis.sounds.length === 1 ? '' : 's'} used`,
    `${analysis.layers.length} statement${analysis.layers.length === 1 ? '' : 's'} → layers`,
  ];
  if (analysis.unknownCount > 0) parts.push(`${analysis.unknownCount} not in the system`);
  summary.textContent = parts.join(' · ');

  // ── section: layers ────────────────────────────────────────────────────────
  const layersSection = section('Layers to add', analysis.layers.length > 0
    ? `tick the statements to turn into tracks at the bottom of the rack (max ${MAX_TRACKS} tracks)`
    : 'nothing in the code reads as a note/sound statement — “Paste as-is” inserts it verbatim');
  const layerList = document.createElement('div');
  layerList.className = 'ipd-list';

  const defaultChecked = Math.min(rows.length, freeSlots);
  rows.forEach((row, index) => {
    const checked = index < defaultChecked && !row.allUnknown;
    const el = document.createElement('label');
    el.className = `ipd-row${row.warning ? ' ipd-row-warn' : ''}`;
    el.innerHTML = `
      <input type="checkbox" class="ipd-check" ${checked ? 'checked' : ''} ${freeSlots === 0 ? 'disabled' : ''} />
      <span class="ipd-row-main">
        <span class="ipd-row-top">
          <span class="ipd-name"></span>
          <span class="ipd-kind ${row.layer.kind === 'drums' ? 'ipd-kind-drums' : 'ipd-kind-synth'}">${row.layer.kind}</span>
        </span>
        <span class="ipd-detail"></span>
        ${row.warning ? '<span class="ipd-warn-line"></span>' : ''}
      </span>`;
    el.querySelector('.ipd-name')!.textContent = row.trackName;
    const detail = el.querySelector('.ipd-detail')!;
    detail.textContent = row.layer.kind === 'drums'
      ? `sound("${truncate(row.layer.drumPattern ?? '', 60)}")`
      : `${row.layer.wave} · "${truncate(row.layer.notePattern ?? '', 60)}"`;
    if (row.warning) el.querySelector('.ipd-warn-line')!.textContent = row.warning;
    const checkbox = el.querySelector<HTMLInputElement>('.ipd-check')!;
    checkbox.addEventListener('change', refreshImportButton);
    row.el = el;
    row.checkbox = checkbox;
    layerList.appendChild(el);
  });
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ipd-empty';
    empty.textContent = 'No sound()/note() statements found. Everything is still available via “Paste as-is”.';
    layerList.appendChild(empty);
  }
  layersSection.appendChild(layerList);
  body.appendChild(layersSection);

  // ── section: tempo (only when the code sets one) ──────────────────────────
  let tempoRow: { checkbox: HTMLInputElement } | null = null;
  if (analysis.cpm !== null) {
    const tempoSection = section('Tempo', 'the pasted code sets its own cycle rate');
    const el = document.createElement('label');
    el.className = 'ipd-row ipd-row-single';
    el.innerHTML = `
      <input type="checkbox" class="ipd-check" checked />
      <span class="ipd-row-main">
        <span class="ipd-row-top"><span class="ipd-name">Use ${analysis.cpm} bpm</span></span>
        <span class="ipd-detail">from ${'setcpm/setcps'} — the app’s BPM is what drives the strips, so matching it keeps things in time</span>
      </span>`;
    tempoSection.appendChild(el);
    body.appendChild(tempoSection);
    tempoRow = { checkbox: el.querySelector<HTMLInputElement>('.ipd-check')! };
  }

  // ── section: sample banks baked into the song ─────────────────────────────
  const bankSection = analysis.banks.length > 0
    ? section('Sample banks in the code', 'baked into the song — registered every load, like the bundled drum kit')
    : null;
  const bankChecks: Array<{ call: string; checkbox: HTMLInputElement }> = [];
  if (bankSection) {
    const list = document.createElement('div');
    list.className = 'ipd-list';
    for (const bank of analysis.banks) {
      const el = document.createElement('label');
      el.className = 'ipd-row';
      el.innerHTML = `
        <input type="checkbox" class="ipd-check" ${bank.bakeable ? 'checked' : 'disabled'} />
        <span class="ipd-row-main">
          <span class="ipd-row-top"><span class="ipd-name ipd-mono">${escapeHtml(truncate(bank.raw, 64))}</span></span>
          <span class="ipd-detail">${bank.bakeable
            ? 'baked into the song — runs before anything plays, survives reload'
            : 'not a plain github:/http url (variable or relative path) — use “Paste as-is” to keep it'}</span>
        </span>`;
      const checkbox = el.querySelector<HTMLInputElement>('.ipd-check')!;
      if (bank.bakeable && bank.call) bankChecks.push({ call: bank.call, checkbox });
      list.appendChild(el);
    }
    bankSection.appendChild(list);
    body.appendChild(bankSection);
  }

  // ── section: what's NOT in the system ─────────────────────────────────────
  const failures = remotePackFailures();
  const unknowns = analysis.sounds.filter((s) => !s.known);
  const missingSection = failures.length > 0 || unknowns.length > 0
    ? section('Not in the system', 'tick to download — everything else is already available to play')
    : null;

  if (missingSection) {
    const list = document.createElement('div');
    list.className = 'ipd-list';

    // pack failures from startup/first-play registration — retry downloads
    for (const failure of failures) {
      const el = document.createElement('div');
      el.className = 'ipd-row ipd-row-retry';
      el.innerHTML = `
        <span class="ipd-missing-icon" aria-hidden="true">!</span>
        <span class="ipd-row-main">
          <span class="ipd-row-top"><span class="ipd-name">${escapeHtml(failure.label)}</span></span>
          <span class="ipd-detail">couldn’t be downloaded at startup — it stays silent until re-fetched</span>
        </span>
        <button class="ipd-retry">Download</button>`;
      const button = el.querySelector<HTMLButtonElement>('.ipd-retry')!;
      const detail = el.querySelector('.ipd-detail')!;
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = '…';
        const ok = await retryRemotePack(failure.id);
        if (ok) {
          el.classList.add('ipd-row-ok');
          button.remove();
          detail.textContent = 'downloaded ✓ — registered';
        } else {
          button.disabled = false;
          button.textContent = 'Retry';
          detail.textContent = 'still failing — check the connection and try again';
        }
      });
      list.appendChild(el);
    }

    // unknown sounds used by the code — no known pack provides them
    for (const sound of unknowns) {
      const el = document.createElement('label');
      el.className = 'ipd-row ipd-row-blocked';
      el.innerHTML = `
        <input type="checkbox" class="ipd-check" disabled />
        <span class="ipd-row-main">
          <span class="ipd-row-top"><span class="ipd-name ipd-mono">${escapeHtml(sound.name)}</span></span>
          <span class="ipd-detail">not found in any known bank — it will stay silent (typo, or a bank only the code registers)</span>
        </span>`;
      list.appendChild(el);
    }

    // offer the full dirt-samples bank when unknowns may come from it
    if (unknowns.length > 0) {
      const el = document.createElement('label');
      el.className = 'ipd-row';
      el.innerHTML = `
        <input type="checkbox" class="ipd-check ipd-check-dirt" />
        <span class="ipd-row-main">
          <span class="ipd-row-top"><span class="ipd-name">Full dirt-samples bank</span></span>
          <span class="ipd-detail">github:tidalcycles/dirt-samples — registers the classic drum/percussion names (arpy, kurt, blip, …) at play time. Tick if you think your unknown sounds live there.</span>
        </span>`;
      list.appendChild(el);
    }

    missingSection.appendChild(list);
    body.appendChild(missingSection);
  }

  // ── what the detection found, grouped by availability (small print) ───────
  const knownUsed = analysis.sounds.filter((s) => s.known);
  if (knownUsed.length > 0) {
    const avail = section('Available to play', 'already in the system — they stream in on first play, like everything else');
    const chips = document.createElement('div');
    chips.className = 'ipd-chips';
    for (const sound of knownUsed) {
      const chip = document.createElement('span');
      chip.className = 'ipd-chip';
      chip.title = SOURCE_LABELS[sound.source ?? 'synth'];
      chip.textContent = sound.name;
      chips.appendChild(chip);
    }
    avail.appendChild(chips);
    body.appendChild(avail);
  }

  // ── .bank() note ──────────────────────────────────────────────────────────
  if (analysis.banksUsed.length > 0) {
    const note = document.createElement('div');
    note.className = 'ipd-note';
    note.textContent = `Note: .bank("${analysis.banksUsed.join('", "')}") can’t be baked into a layer — the layers play with the default kit. The full tidal-drum-machines maps are registered, so pasted as-is it would work.`;
    body.appendChild(note);
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('#ipd-x')!.addEventListener('click', close);
  overlay.querySelector('#ipd-cancel')!.addEventListener('click', close);
  overlay.querySelector('#ipd-asis')!.addEventListener('click', () => {
    cb.onPasteAsIs();
    close();
  });

  function refreshImportButton(): void {
    const checked = rows.filter((r) => r.checkbox?.checked && !r.checkbox.disabled).length;
    importBtn.textContent = checked === 0 ? 'Import as layers' : `Import ${checked} layer${checked === 1 ? '' : 's'}`;
    importBtn.disabled = checked === 0;
  }

  importBtn.addEventListener('click', () => {
    const chosen = rows.filter((r) => r.checkbox?.checked && !r.checkbox.disabled);
    const extraCalls = bankChecks.filter((b) => b.checkbox.checked).map((b) => b.call);
    if (overlay.querySelector('.ipd-check-dirt') && (overlay.querySelector('.ipd-check-dirt') as HTMLInputElement).checked) {
      extraCalls.push("samples('github:tidalcycles/dirt-samples')");
    }
    const tracks = chosen.map((row) => layerToTrack({ ...row.layer, name: row.trackName }));
    const added = store.importTracks(tracks, extraCalls);
    if (tempoRow?.checkbox.checked && analysis.cpm !== null) store.setBpm(analysis.cpm);
    const skipped = chosen.length - added;
    showToast(
      `Imported ${added} layer${added === 1 ? '' : 's'}` +
        (extraCalls.length ? ` · ${extraCalls.length} sample bank${extraCalls.length === 1 ? '' : 's'} baked in` : '') +
        (skipped > 0 ? ` · ${skipped} skipped (12-track limit)` : ''),
      'info',
    );
    close();
  });

  document.body.appendChild(overlay);
  refreshImportButton();
  importBtn.focus();
}

function section(title: string, hint: string): HTMLElement {
  const el = document.createElement('section');
  el.className = 'ipd-section';
  el.innerHTML = `<div class="ipd-section-head"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(hint)}</p></div>`;
  return el;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const NOTE_TOKEN = /^[a-gA-G][#bsf]?[0-9]?$/;

/** degrees-only patterns ("0 2 4") need .scale() — warn the user they won't sound right */
function notePatternWarning(layer: DetectedLayer): string | null {
  if (layer.kind !== 'synth' || !layer.notePattern) return null;
  const tokens = layer.notePattern.split(/[\s\[\]{}()<>|,]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const hasNote = tokens.some((t) => NOTE_TOKEN.test(t.replace(/[:*/!@?~-].*$/, '')));
  if (hasNote) return null;
  if (tokens.every((t) => /^[-\d.]/.test(t) || t === '~')) {
    return 'degree numbers — needs .scale() from the original code; they will play as semitone offsets, not a scale';
  }
  return null;
}

function layerToTrack(layer: DetectedLayer): Track {
  if (layer.kind === 'drums') {
    return makeTrack('drums', {
      name: layer.name,
      drumPattern: layer.drumPattern ?? '~',
      gain: layer.gain ?? 0.9,
    });
  }
  return makeTrack(kindForWave(layer.wave ?? 'sawtooth'), {
    name: layer.name,
    source: 'synth',
    notePattern: layer.notePattern ?? 'c3',
    wave: layer.wave ?? 'sawtooth',
    gain: layer.gain ?? 0.8,
  });
}

/** crude kind guess so the strip lands in a sensible family bucket */
function kindForWave(wave: string): 'bass' | 'pad' | 'keys' | 'lead' {
  const w = wave.toLowerCase();
  if (/bass|contra|sub/.test(w)) return 'bass';
  if (/pad|string|choir|organ|accordion|brass_ensemble|synth_str/.test(w)) return 'pad';
  if (/piano|keys|clav|epiano|harpsi|celesta|vibra|bell|harp|kalimba|marimba|church|reed/.test(w)) return 'keys';
  return 'lead';
}
