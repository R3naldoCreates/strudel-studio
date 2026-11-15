// ─── Floating context menu ───────────────────────────────────────────────────
export interface CtxItem {
  id: string;
  label: string;
  hint?: string;
  icon?: string;
  danger?: boolean;
  /** disabled items render but don't fire */
  disabled?: boolean;
  run?: () => void;
}

export interface CtxSeparator { separator: true }

export type CtxEntry = CtxItem | CtxSeparator;

let el: HTMLElement | null = null;
let open = false;
let currentEntries: CtxEntry[] = [];
let activeIndex = -1;

function menuEl(): HTMLElement {
  if (!el) el = document.getElementById('ctx-menu')!;
  return el;
}

export function hideContextMenu(): void {
  if (!el) return;
  el.hidden = true;
  open = false;
  activeIndex = -1;
}

export function isContextMenuOpen(): boolean {
  return open;
}

export function showContextMenu(x: number, y: number, entries: CtxEntry[]): void {
  const menu = menuEl();
  currentEntries = entries;
  activeIndex = -1;
  menu.innerHTML = '';

  for (const entry of entries) {
    if ('separator' in entry) {
      const hr = document.createElement('div');
      hr.className = 'ctx-sep';
      menu.appendChild(hr);
      continue;
    }
    const item = entry as CtxItem;
    const btn = document.createElement('button');
    btn.className = `ctx-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`;
    btn.dataset.id = item.id;
    btn.innerHTML = `
      <span class="ctx-icon">${item.icon ?? ''}</span>
      <span class="ctx-label">${escapeHtml(item.label)}${item.hint ? `<span class="ctx-hint">${escapeHtml(item.hint)}</span>` : ''}</span>
      <span class="ctx-key"></span>`;
    if (!item.disabled) {
      btn.addEventListener('click', () => {
        hideContextMenu();
        item.run?.();
      });
    } else {
      btn.disabled = true;
    }
    btn.addEventListener('mousemove', () => setActive(indexOfItem(menu, btn)));
    menu.appendChild(btn);
  }

  menu.hidden = false;
  open = true;

  // position within viewport
  const rect = menu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = rect.width || 260;
  const h = rect.height || entries.length * 34;
  menu.style.left = `${Math.max(8, Math.min(x, vw - w - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, vh - h - 8))}px`;
}

function indexOfItem(menu: HTMLElement, btn: HTMLElement): number {
  return Array.from(menu.children).filter((c) => c.classList.contains('ctx-item')).indexOf(btn);
}

function setActive(index: number): void {
  activeIndex = index;
  const items = menuEl().querySelectorAll('.ctx-item:not(.disabled)');
  items.forEach((n, i) => n.classList.toggle('active', i === index));
}

function items(): CtxItem[] {
  return currentEntries.filter((e): e is CtxItem => !('separator' in e) && !e.disabled);
}

// keyboard navigation + global dismiss
export function initContextMenuGlobal(): void {
  window.addEventListener('mousedown', (e) => {
    if (el && open && !el.contains(e.target as Node)) hideContextMenu();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      hideContextMenu();
      return;
    }
    const list = items();
    if (list.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex < 0 ? (dir === 1 ? 0 : list.length - 1) : (activeIndex + dir + list.length) % list.length;
      setActive(next);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const item = list[activeIndex];
      hideContextMenu();
      item.run?.();
    }
  });
  window.addEventListener('blur', hideContextMenu);
  window.addEventListener('resize', hideContextMenu);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
