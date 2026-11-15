// ─── Toasts ──────────────────────────────────────────────────────────────────
export type ToastKind = 'info' | 'error';

let container: HTMLElement | null = null;

export function initToasts(): void {
  container = document.getElementById('toasts');
  window.addEventListener('studio.toast', ((e: CustomEvent) => {
    const detail = e.detail as { kind?: ToastKind; text?: string };
    if (detail?.text) showToast(detail.text, detail.kind ?? 'info');
  }) as EventListener);
}

export function showToast(text: string, kind: ToastKind = 'info'): void {
  if (!container) container = document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.classList.add('leaving'), 3600);
  setTimeout(() => el.remove(), 4000);
}
