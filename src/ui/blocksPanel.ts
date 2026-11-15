// ─── Left sidebar: favorites · presets · blocks · instrument library · cheat sheet ──
// Everything here is collapsible; collapse state, favorites and user-added
// notation entries persist in localStorage (see panelState.ts).
import { BLOCK_GROUPS } from '../blocks';
import { PRESETS, loadUserPresets, saveUserPreset, deleteUserPreset, type Preset } from '../presets';
import { GM_FAMILIES, VCSL_GROUPS, REMOTE_PACKS, GM_COUNT, VCSL_COUNT, searchInstruments, type Instrument } from '../instruments';
import {
  isGroupOpen, setGroupOpen,
  isFavorite, toggleFavorite,
  loadCustomNotation, saveCustomNotation,
  NOTATION_GROUPS,
} from '../panelState';
import { store } from '../state';
import { makeTrack } from '../types';
import { registerRemotePack } from '../engineFacade';

const svg = (path: string, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const CHEVRON = svg('<path d="M6 9l6 6 6-6"/>', 14);
const STAR = (filled: boolean) =>
  filled
    ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l2.7 5.5 6 .9-4.3 4.3 1 6-5.4-2.9-5.4 2.9 1-6L4.4 9.4l6-.9z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l2.7 5.5 6 .9-4.3 4.3 1 6-5.4-2.9-5.4 2.9 1-6L4.4 9.4l6-.9z"/></svg>';
const PLUS = svg('<path d="M12 5v14M5 12h14"/>', 12);
const TRASH = svg('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0l1.5 13a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8L17 7"/>', 13);

let panelRoot: HTMLElement | null = null;

export function renderBlocksPanel(root: HTMLElement): void {
  panelRoot = root;
  const scrollTop = root.closest('.side-scroll')?.scrollTop ?? 0;
  root.innerHTML = '';

  const favs = buildFavoritesSection();
  if (favs) root.appendChild(favs);

  root.appendChild(buildPresetsSection());
  root.appendChild(buildBlocksSection());
  root.appendChild(buildInstrumentLibrarySection());
  root.appendChild(buildNotationSection());

  // preserve scroll position across re-renders
  const scroller = root.closest('.side-scroll');
  if (scroller) scroller.scrollTop = scrollTop;
}

function rerenderPanel(): void {
  if (panelRoot) renderBlocksPanel(panelRoot);
}

// ── collapsible section wrapper ──────────────────────────────────────────────
interface Collapsible {
  el: HTMLElement;
  body: HTMLElement;
}

function collapsible(id: string, title: string, defaultOpen: boolean, hint?: string, extraActions?: HTMLElement): Collapsible {
  const open = isGroupOpen(id, defaultOpen);
  const el = document.createElement('div');
  el.className = 'panel-section';

  const head = document.createElement('button');
  head.className = 'group-head group-toggle';
  head.setAttribute('aria-expanded', String(open));
  head.innerHTML = `<span class="group-toggle-label">${escapeHtml(title)}</span>${hint ? `<span class="group-hint">${escapeHtml(hint)}</span>` : ''}<span class="chev">${CHEVRON}</span>`;
  el.appendChild(head);

  if (extraActions) {
    const row = document.createElement('div');
    row.className = 'group-actions';
    row.appendChild(extraActions);
    el.appendChild(row);
  }

  const body = document.createElement('div');
  body.className = 'group-body';
  body.hidden = !open;
  el.appendChild(body);

  head.addEventListener('click', () => {
    const nowOpen = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(nowOpen));
    body.hidden = !nowOpen;
    setGroupOpen(id, nowOpen);
  });

  return { el, body };
}

/** a star button wired to the favorites registry */
function starButton(favId: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `star-btn${isFavorite(favId) ? ' active' : ''}`;
  btn.innerHTML = STAR(isFavorite(favId));
  btn.title = isFavorite(favId) ? `Remove “${label}” from favorites` : `Add “${label}” to favorites`;
  btn.setAttribute('aria-pressed', String(isFavorite(favId)));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(favId);
    rerenderPanel();
  });
  return btn;
}

// ── favorites (pinned, hidden when empty) ────────────────────────────────────
function buildFavoritesSection(): HTMLElement | null {
  const chips = collectFavorites();
  if (chips.length === 0) return null;
  const { el, body } = collapsible('sec:favorites', '★ Favorites', true);
  const wrap = document.createElement('div');
  wrap.className = 'fav-chips';
  for (const chip of chips) {
    const b = document.createElement('button');
    b.className = 'fav-chip';
    b.innerHTML = `<span class="fav-kind">${escapeHtml(chip.kindTag)}</span><span class="fav-label">${escapeHtml(chip.label)}</span>`;
    b.title = chip.hint;
    b.addEventListener('click', chip.run);
    wrap.appendChild(b);
  }
  body.appendChild(wrap);
  return el;
}

interface FavoriteChip {
  kindTag: string;
  label: string;
  hint: string;
  run: () => void;
}

function collectFavorites(): FavoriteChip[] {
  const chips: FavoriteChip[] = [];
  // blocks
  for (const group of BLOCK_GROUPS) {
    for (const item of group.items) {
      const id = `block:${item.id}`;
      if (!isFavorite(id)) continue;
      chips.push({ kindTag: 'BLOCK', label: item.label, hint: item.desc, run: () => store.addTrack(item.create()) });
    }
  }
  // instruments
  const allInstruments = [...GM_FAMILIES, ...VCSL_GROUPS].flatMap((g) => g.instruments);
  for (const inst of allInstruments) {
    const id = `inst:${inst.id}`;
    if (!isFavorite(id)) continue;
    chips.push({ kindTag: 'INST', label: inst.label, hint: `Add “${inst.label}” as a new layer`, run: () => void addInstrument(inst) });
  }
  // notation (incl. custom)
  const customs = loadCustomNotation();
  const notationEntries = [...NOTATION_GROUPS.flatMap((g) => g.items), ...customs.map((c) => ({ id: `custom:${c.id}`, syntax: c.syntax, name: c.name, desc: c.desc }))];
  for (const entry of notationEntries) {
    const id = `notation:${entry.id}`;
    if (!isFavorite(id)) continue;
    chips.push({ kindTag: 'NOTE', label: entry.syntax, hint: entry.desc, run: () => insertNotation(entry.syntax) });
  }
  // presets (built-in + user)
  for (const preset of allPresets()) {
    const id = `preset:${preset.id}`;
    if (!isFavorite(id)) continue;
    chips.push({ kindTag: 'SONG', label: preset.label, hint: preset.desc, run: () => loadPreset(preset) });
  }
  return chips;
}

function allPresets(): Preset[] {
  return [...PRESETS, ...loadUserPresets()];
}

function loadPreset(preset: Preset): void {
  store.setSong(preset.build());
  toast(`Preset “${preset.label}” loaded`);
}

// ── song presets ──────────────────────────────────────────────────────────────
function buildPresetsSection(): HTMLElement {
  const { el, body } = collapsible('sec:presets', 'Song Presets', false, 'start here');

  for (const preset of allPresets()) {
    const card = document.createElement('div');
    card.className = 'preset-card-wrap';
    const btn = document.createElement('button');
    btn.className = 'preset-card';
    btn.innerHTML = `<span class="preset-name">${escapeHtml(preset.label)}${preset.user ? ' <span class="preset-you">yours</span>' : ''}</span><span class="preset-desc">${escapeHtml(preset.desc)}</span>`;
    btn.addEventListener('click', () => loadPreset(preset));
    card.appendChild(btn);
    const side = document.createElement('div');
    side.className = 'card-side';
    side.appendChild(starButton(`preset:${preset.id}`, preset.label));
    if (preset.user) {
      const del = document.createElement('button');
      del.className = 'mini-icon-btn danger';
      del.innerHTML = TRASH;
      del.title = `Delete “${preset.label}”`;
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteUserPreset(preset.id);
        rerenderPanel();
        toast(`Preset “${preset.label}” deleted`);
      });
      side.appendChild(del);
    }
    card.appendChild(side);
    body.appendChild(card);
  }

  // save current song as preset
  const saveRow = document.createElement('form');
  saveRow.className = 'save-preset-row';
  saveRow.innerHTML = `<input class="save-preset-input" type="text" maxlength="60" placeholder="Name this song as a preset…" aria-label="Preset name" /><button type="submit" class="mini-btn save-preset-btn" title="Save the current song as a reusable preset">＋ Save</button>`;
  const input = saveRow.querySelector<HTMLInputElement>('.save-preset-input')!;
  saveRow.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    const created = saveUserPreset(name, store.state.song);
    if (created) {
      input.value = '';
      rerenderPanel();
      toast(`Preset “${name}” saved`);
    } else {
      toast('Could not save preset', 'error');
    }
  });
  body.appendChild(saveRow);
  return el;
}

// ── source blocks ─────────────────────────────────────────────────────────────
function buildBlocksSection(): HTMLElement {
  const libraryBtn = document.createElement('button');
  libraryBtn.className = 'mini-btn library-btn';
  libraryBtn.innerHTML = `${PLUS} Library…`;
  libraryBtn.title = 'Browse instruments from the web (opens the Instrument Library)';
  libraryBtn.addEventListener('click', () => {
    // expand + scroll to the instrument library section
    setGroupOpen('sec:library', true);
    rerenderPanel();
    const lib = panelRoot?.closest('.side-scroll')?.querySelector('#library-section');
    lib?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    lib?.classList.add('flash');
    window.setTimeout(() => lib?.classList.remove('flash'), 1600);
  });

  const { el, body } = collapsible('sec:blocks', 'Source Blocks', true, 'click to add a layer', libraryBtn);

  for (const group of BLOCK_GROUPS) {
    const grid = document.createElement('div');
    grid.className = 'block-grid';
    for (const item of group.items) {
      const wrap = document.createElement('div');
      wrap.className = 'block-card-wrap';
      const btn = document.createElement('button');
      btn.className = 'block-card';
      btn.style.setProperty('--block-color', item.color);
      btn.title = item.desc;
      btn.innerHTML = `
        <span class="block-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg></span>
        <span class="block-label">${escapeHtml(item.label)}</span>
        <span class="block-desc">${escapeHtml(item.desc)}</span>`;
      btn.addEventListener('click', () => store.addTrack(item.create()));
      wrap.appendChild(btn);
      wrap.appendChild(starButton(`block:${item.id}`, item.label));
      grid.appendChild(wrap);
    }
    body.appendChild(grid);
  }
  return el;
}

// ── instrument library ────────────────────────────────────────────────────────
async function addInstrument(inst: Instrument): Promise<void> {
  if (inst.source === 'vcsl') {
    try {
      await registerRemotePack('vcsl');
    } catch (err) {
      console.warn('[library] VCSL sample map failed to load', err);
      toast('VCSL download failed — check your connection; the layer was added anyway', 'error');
    }
  }
  store.addTrack(makeTrack('keys', {
    name: inst.label,
    notePattern: '<c4 e4 g4 b4>*2',
    wave: inst.id,
    gain: 0.5,
  }));
  toast(`Added “${inst.label}” — first note downloads it from the web`, 'info');
}

function buildInstrumentLibrarySection(): HTMLElement {
  const { el, body } = collapsible('sec:library', 'Instrument Library', false, `${GM_COUNT} GM + ${VCSL_COUNT} VCSL`);
  el.id = 'library-section';

  const note = document.createElement('div');
  note.className = 'lib-note';
  note.innerHTML = `Standard GM soundfonts play out of the box. VCSL instruments and the drum packs below download from the web the first time they play.`;
  body.appendChild(note);

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'lib-search';
  search.placeholder = 'Search instruments… (piano, sax, marimba…)';
  search.setAttribute('aria-label', 'Search instruments');
  body.appendChild(search);

  const groupsWrap = document.createElement('div');
  groupsWrap.className = 'lib-groups';
  body.appendChild(groupsWrap);

  const renderGroups = (query: string): void => {
    groupsWrap.innerHTML = '';
    const q = query.trim().toLowerCase();
    const matched = searchInstruments(q);
    if (matched.length === 0) {
      groupsWrap.innerHTML = `<div class="lib-empty">No instruments match “${escapeHtml(query)}”.</div>`;
      return;
    }
    for (const { group, instruments } of matched) {
      // each family is its own collapsible subgroup
      const sub = document.createElement('div');
      sub.className = 'lib-group';
      const open = !q && isGroupOpen(`lib:${group.id}`, false);
      const head = document.createElement('button');
      head.className = 'lib-group-head';
      head.setAttribute('aria-expanded', String(open));
      head.innerHTML = `<span class="lib-group-title">${escapeHtml(group.family)}</span><span class="lib-group-count">${instruments.length}</span><span class="chev small">${CHEVRON}</span>`;
      const list = document.createElement('div');
      list.className = 'lib-list';
      list.hidden = !open;
      head.addEventListener('click', () => {
        const nowOpen = head.getAttribute('aria-expanded') !== 'true';
        head.setAttribute('aria-expanded', String(nowOpen));
        list.hidden = !nowOpen;
        setGroupOpen(`lib:${group.id}`, nowOpen);
      });
      for (const inst of instruments) {
        const row = document.createElement('div');
        row.className = 'lib-row';
        row.appendChild(starButton(`inst:${inst.id}`, inst.label));
        const mid = document.createElement('div');
        mid.className = 'lib-meta';
        mid.innerHTML = `<span class="lib-name">${escapeHtml(inst.label)}${inst.source === 'vcsl' ? ' <span class="lib-badge">VCSL</span>' : ''}</span><span class="lib-desc">${escapeHtml(inst.desc)}</span>`;
        row.appendChild(mid);
        const add = document.createElement('button');
        add.className = 'mini-btn lib-add';
        add.innerHTML = `${PLUS} Add`;
        add.title = `Add “${inst.label}” as a new layer`;
        add.addEventListener('click', () => void addInstrument(inst));
        row.appendChild(add);
        list.appendChild(row);
      }
      sub.appendChild(head);
      sub.appendChild(list);
      groupsWrap.appendChild(sub);
    }
  };
  renderGroups('');
  search.addEventListener('input', () => renderGroups(search.value));

  // downloadable packs
  const packs = document.createElement('div');
  packs.className = 'lib-packs';
  packs.innerHTML = `<div class="lib-packs-head">Downloadable banks <span class="lib-packs-sub">(registers the sample map)</span></div>`;
  for (const pack of REMOTE_PACKS) {
    const row = document.createElement('div');
    row.className = 'pack-row';
    row.innerHTML = `
      <div class="pack-meta">
        <span class="pack-label">${escapeHtml(pack.label)}</span>
        <span class="pack-desc">${escapeHtml(pack.desc)}</span>
        <code class="pack-usage">${escapeHtml(pack.usage)}</code>
      </div>
      <button class="mini-btn pack-download">Register</button>`;
    const btn = row.querySelector<HTMLButtonElement>('.pack-download')!;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        await registerRemotePack(pack.id);
        btn.textContent = '✓ Ready';
        btn.classList.add('pack-ready');
        toast(`“${pack.label}” registered — use it in any pattern`);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Register';
        console.warn('[library] pack registration failed', err);
        toast('Download failed — check your connection', 'error');
      }
    });
    packs.appendChild(row);
  }
  body.appendChild(packs);
  return el;
}

// ── mini-notation cheat sheet ────────────────────────────────────────────────
function buildNotationSection(): HTMLElement {
  const { el, body } = collapsible('sec:notation', 'Mini-Notation Cheat Sheet', true, 'insert on click');

  const customs = loadCustomNotation();

  // favorites pinned at the top of the sheet
  const favNotation = [
    ...NOTATION_GROUPS.flatMap((g) => g.items),
    ...customs.map((c) => ({ id: `custom:${c.id}`, syntax: c.syntax, name: c.name, desc: c.desc })),
  ].filter((e) => isFavorite(`notation:${e.id}`));
  if (favNotation.length > 0) {
    const favBlock = document.createElement('div');
    favBlock.className = 'notation-fav';
    favBlock.innerHTML = `<div class="notation-subhead">★ Favorites</div>`;
    for (const entry of favNotation) favBlock.appendChild(notationRow(`notation:${entry.id}`, entry.syntax, entry.name, entry.desc));
    body.appendChild(favBlock);
  }

  // grouped cheat sheet
  for (const group of NOTATION_GROUPS) {
    const isCommon = group.id === 'commonly-used';
    const sub = document.createElement('div');
    sub.className = 'notation-group';
    const open = isGroupOpen(`notation:${group.id}`, isCommon);
    const head = document.createElement('button');
    head.className = 'notation-group-head';
    head.setAttribute('aria-expanded', String(open));
    head.innerHTML = `<span class="notation-group-title">${escapeHtml(group.title)}</span><span class="lib-group-count">${group.items.length}</span><span class="chev small">${CHEVRON}</span>`;
    const list = document.createElement('div');
    list.className = 'notation-group-list';
    list.hidden = !open;
    head.addEventListener('click', () => {
      const nowOpen = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(nowOpen));
      list.hidden = !nowOpen;
      setGroupOpen(`notation:${group.id}`, nowOpen);
    });
    for (const entry of group.items) {
      list.appendChild(notationRow(`notation:${entry.id}`, entry.syntax, entry.name, entry.desc));
    }
    sub.appendChild(head);
    sub.appendChild(list);
    body.appendChild(sub);
  }

  // your own rows
  const customWrap = document.createElement('div');
  customWrap.className = 'notation-group';
  const openCustom = isGroupOpen('notation:_custom', customs.length > 0);
  const head = document.createElement('button');
  head.className = 'notation-group-head';
  head.setAttribute('aria-expanded', String(openCustom));
  head.innerHTML = `<span class="notation-group-title">Yours</span><span class="lib-group-count">${customs.length}</span><span class="chev small">${CHEVRON}</span>`;
  const list = document.createElement('div');
  list.className = 'notation-group-list';
  list.hidden = !openCustom;
  head.addEventListener('click', () => {
    const nowOpen = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(nowOpen));
    list.hidden = !nowOpen;
    setGroupOpen('notation:_custom', nowOpen);
  });
  const renderCustomList = (): void => {
    list.innerHTML = '';
    const entries = loadCustomNotation();
    if (entries.length === 0) {
      list.innerHTML = `<div class="lib-empty">Nothing yet — add your own shorthand below.</div>`;
    }
    for (const entry of entries) {
      const row = notationRow(`notation:custom:${entry.id}`, entry.syntax, entry.name, entry.desc);
      const del = document.createElement('button');
      del.className = 'mini-icon-btn danger';
      del.innerHTML = TRASH;
      del.title = 'Remove this entry';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        saveCustomNotation(loadCustomNotation().filter((c) => c.id !== entry.id));
        rerenderPanel();
      });
      row.appendChild(del);
      list.appendChild(row);
    }
    // add form
    const form = document.createElement('form');
    form.className = 'custom-notation-form';
    form.innerHTML = `
      <input class="cn-syntax" type="text" maxlength="80" placeholder="syntax, e.g. bd(3,8)" aria-label="Notation syntax" />
      <input class="cn-name" type="text" maxlength="40" placeholder="name, e.g. my clave" aria-label="Notation name" />
      <button type="submit" class="mini-btn" title="Add this row to your cheat sheet">＋ Add</button>`;
    const syntax = form.querySelector<HTMLInputElement>('.cn-syntax')!;
    const name = form.querySelector<HTMLInputElement>('.cn-name')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const s = syntax.value.trim();
      if (!s) { syntax.focus(); return; }
      const entries = loadCustomNotation();
      entries.push({ id: `c${Date.now().toString(36)}`, syntax: s, name: name.value.trim() || s, desc: 'your own entry' });
      saveCustomNotation(entries);
      syntax.value = ''; name.value = '';
      setGroupOpen('notation:_custom', true);
      rerenderPanel();
      toast('Cheat sheet updated');
    });
    list.appendChild(form);
  };
  renderCustomList();
  customWrap.appendChild(head);
  customWrap.appendChild(list);
  body.appendChild(customWrap);

  return el;
}

function notationRow(favId: string, syntax: string, name: string, desc: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'notion-row';
  const main = document.createElement('button');
  main.className = 'notion-main';
  main.innerHTML = `<code>${escapeHtml(syntax)}</code><span class="notion-name">${escapeHtml(name)}</span>`;
  main.title = `${desc} — click to insert into the selected layer`;
  main.addEventListener('click', () => insertNotation(syntax));
  row.appendChild(main);
  row.appendChild(starButton(favId, syntax));
  return row;
}

function insertNotation(token: string): void {
  const { song, selection } = store.state;
  const track = song.tracks.find((t) => t.id === selection.trackId) ?? song.tracks[song.tracks.length - 1];
  if (!track) {
    toast('Add a layer first', 'info');
    return;
  }
  if (track.source === 'drums') {
    store.updateTrack(track.id, { drumPattern: `${track.drumPattern} ${token}`.replace(/\s+/g, ' ').trim() });
  } else {
    store.updateTrack(track.id, { notePattern: `${track.notePattern} ${token}`.replace(/\s+/g, ' ').trim() });
  }
}

function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  window.dispatchEvent(new CustomEvent('studio.toast', { detail: { kind, text } }));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
