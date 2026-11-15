// ─── Timeline: one strip per layer ──────────────────────────────────────────
import { store } from '../state';
import type { Track } from '../types';
import { FX_MAP } from '../fx';
import { showToast } from './toast';

const svg = (path: string, size = 14) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICON = {
  lfo: '<path d="M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/>',
  fx: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  wave: '<path d="M3 12h4l2-7 3 14 3-11 2 4h6"/>',
};

/** while a fader is mid-drag, suppress strip re-renders so pointer capture survives */
let faderDrag = false;

export function renderTimeline(container: HTMLElement): void {
  if (faderDrag) return;
  container.innerHTML = '';
  const { song, selection } = store.state;
  const anySolo = song.tracks.some((t) => t.solo);

  for (const track of song.tracks) {
    container.appendChild(renderStrip(track, anySolo, selection.trackId === track.id));
  }
}

function renderStrip(track: Track, anySolo: boolean, selected: boolean): HTMLElement {
  const audible = !track.muted && (!anySolo || track.solo);

  const strip = document.createElement('div');
  strip.className = `strip${selected ? ' selected' : ''}${audible ? '' : ' silent'}`;
  strip.dataset.trackId = track.id;
  strip.style.setProperty('--strip-color', track.color);

  strip.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.strip-btn, .fader, .fx-chip')) return;
    store.selectTrack(track.id, 'track');
  });

  // header: color tab + name + kind + delete
  const header = document.createElement('div');
  header.className = 'strip-head';
  header.innerHTML = `
    <div class="strip-tab"></div>
    <div class="strip-title">
      <div class="strip-name" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</div>
      <div class="strip-kind">${track.source === 'drums' ? 'drums' : track.wave}</div>
    </div>`;
  header.querySelector('.strip-tab')!.addEventListener('click', () => store.selectTrack(track.id, 'track'));
  const del = document.createElement('button');
  del.className = 'strip-delete';
  del.textContent = '×';
  del.title = 'Delete this layer (Ctrl+Z to undo)';
  del.addEventListener('click', () => {
    store.removeTrack(track.id);
    showUndoToast(`Removed “${track.name}”`);
  });
  header.appendChild(del);
  strip.appendChild(header);

  // mute / solo
  const msRow = document.createElement('div');
  msRow.className = 'strip-ms';
  const muteBtn = document.createElement('button');
  muteBtn.className = `strip-btn mute${track.muted ? ' active' : ''}`;
  muteBtn.textContent = 'M';
  muteBtn.title = track.muted ? 'Unmute' : 'Mute';
  muteBtn.addEventListener('click', () => store.updateTrack(track.id, { muted: !track.muted }));
  const soloBtn = document.createElement('button');
  soloBtn.className = `strip-btn solo${track.solo ? ' active' : ''}`;
  soloBtn.textContent = 'S';
  soloBtn.title = track.solo ? 'Unsolo' : 'Solo';
  soloBtn.addEventListener('click', () => store.updateTrack(track.id, { solo: !track.solo }));
  msRow.append(muteBtn, soloBtn);
  strip.appendChild(msRow);

  // fader + automation toggle
  const body = document.createElement('div');
  body.className = 'strip-body';

  const fader = buildFader(track);
  body.appendChild(fader);

  const sideCol = document.createElement('div');
  sideCol.className = 'strip-side';

  const lfoBtn = document.createElement('button');
  const hasAuto = !!track.automation;
  lfoBtn.className = `strip-btn lfo${hasAuto ? ' active' : ''}`;
  lfoBtn.innerHTML = svg(ICON.lfo, 15);
  lfoBtn.title = hasAuto ? `LFO on ${track.automation!.target} — click to remove` : 'Add a gain LFO (volume changer)';
  lfoBtn.addEventListener('click', () => {
    if (hasAuto) store.updateTrack(track.id, { automation: null });
    else store.updateTrack(track.id, { automation: { target: 'gain', wave: 'sine', rate: 4, depth: 0.35 } });
  });
  sideCol.appendChild(lfoBtn);

  if (track.automation) {
    const badge = document.createElement('div');
    badge.className = 'auto-badge';
    badge.textContent = `${track.automation.wave} · 1/${Math.round(track.automation.rate)}`;
    badge.title = `Automation: ${track.automation.wave} → ${track.automation.target}, one sweep per ${track.automation.rate} cycle(s), depth ${Math.round(track.automation.depth * 100)}%`;
    sideCol.appendChild(badge);
  }
  body.appendChild(sideCol);
  strip.appendChild(body);

  // width grows in steps as the FX chain fills up — keeps chips on two tidy rows
  const fxCount = track.fx.length;
  strip.style.setProperty('--strip-w', `${fxCount <= 2 ? 118 : fxCount <= 4 ? 134 : 158}px`);

  // fx chips — wrap into two rows, bypass in place, overflow collapses into a badge
  const fxRow = document.createElement('div');
  fxRow.className = 'strip-fx';
  const visibleFx = track.fx.slice(0, 6);
  const overflow = track.fx.length - visibleFx.length;

  if (track.fx.length === 0) {
    const empty = document.createElement('button');
    empty.className = 'fx-chip ghost';
    empty.innerHTML = `${svg(ICON.fx, 12)}<span>no fx</span>`;
    empty.title = 'Add effects from the Inspector';
    empty.addEventListener('click', () => store.selectTrack(track.id, 'track'));
    fxRow.appendChild(empty);
  } else {
    for (const fx of visibleFx) {
      const def = FX_MAP[fx.type];
      const bypassed = !!fx.bypassed;
      const chip = document.createElement('div');
      chip.className = `fx-chip${bypassed ? ' bypassed' : ''}`;
      chip.title = `${def?.label ?? fx.type}${bypassed ? ' (bypassed)' : ''} — click name to edit, click dot to bypass`;
      chip.innerHTML = `<span class="fx-chip-dot" title="${bypassed ? 'Enable' : 'Bypass'} ${def?.label ?? fx.type}"></span><span class="fx-chip-name">${def?.label.split(' ')[0] ?? fx.type}</span>`;
      chip.querySelector('.fx-chip-dot')!.addEventListener('click', (e) => {
        e.stopPropagation();
        store.updateTrack(track.id, { fx: track.fx.map((f) => (f.id === fx.id ? { ...f, bypassed: !f.bypassed } : f)) });
      });
      chip.querySelector('.fx-chip-name')!.addEventListener('click', () => store.select({ kind: 'fx', trackId: track.id, fxId: fx.id }));
      fxRow.appendChild(chip);
    }
    if (overflow > 0) {
      const more = document.createElement('button');
      more.className = 'fx-chip ghost more';
      more.textContent = `+${overflow}`;
      more.title = `${overflow} more — open Inspector`;
      more.addEventListener('click', () => store.selectTrack(track.id, 'track'));
      fxRow.appendChild(more);
    }
  }
  strip.appendChild(fxRow);

  return strip;
}

// ── custom vertical fader ────────────────────────────────────────────────────
const MIN_GAIN = 0;
const MAX_GAIN = 1.5;
const DEFAULT_GAIN = 0.8;

function buildFader(track: Track): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'fader';
  wrap.title = `Gain ${(track.gain * 100).toFixed(0)}% — drag, scroll, double-click to reset`;

  const rail = document.createElement('div');
  rail.className = 'fader-rail';
  const fill = document.createElement('div');
  fill.className = 'fader-fill';
  const unity = document.createElement('div');
  unity.className = 'fader-unity';
  unity.style.bottom = `${(DEFAULT_GAIN / MAX_GAIN) * 100}%`;
  const thumb = document.createElement('div');
  thumb.className = 'fader-thumb';
  rail.append(fill, unity, thumb);
  wrap.appendChild(rail);

  const label = document.createElement('div');
  label.className = 'fader-label';
  wrap.appendChild(label);

  const paint = (v: number) => {
    const pct = (v / MAX_GAIN) * 100;
    fill.style.height = `${pct}%`;
    thumb.style.bottom = `calc(${pct}% - 7px)`;
    label.textContent = v.toFixed(2);
  };
  paint(track.gain);

  let dragging = false;
  let raf = 0;
  let lastCommit = 0;
  const valueFromEvent = (e: PointerEvent): number => {
    const rect = rail.getBoundingClientRect();
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    const v = ((rect.height - y) / rect.height) * MAX_GAIN;
    return Math.round(v * 100) / 100;
  };
  const commit = (v: number, force = false) => {
    paint(v);
    const now = performance.now();
    if (force || now - lastCommit > 120) {
      lastCommit = now;
      store.updateTrack(track.id, { gain: v });
    }
  };

  rail.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    faderDrag = true;
    rail.setPointerCapture(e.pointerId);
    commit(valueFromEvent(e), true);
  });
  rail.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => commit(valueFromEvent(e)));
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    faderDrag = false;
    try { rail.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    commit(valueFromEvent(e), true);
  };
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener('dblclick', () => store.updateTrack(track.id, { gain: DEFAULT_GAIN }));
  rail.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    store.updateTrack(track.id, { gain: Math.min(MAX_GAIN, Math.max(MIN_GAIN, Math.round((track.gain + delta) * 100) / 100)) });
  }, { passive: false });

  return wrap;
}

function showUndoToast(text: string): void {
  showToast(`${text} — Ctrl+Z to undo`, 'info');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
