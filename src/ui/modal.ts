// ─── In-app modals ───────────────────────────────────────────────────────────
// Tauri WebView2 resolves window.confirm()/window.prompt() to false/null with
// no dialog at all. Every question in the desktop app therefore uses a native
// <dialog> opened with showModal(): the browser supplies focus containment,
// Esc dismissal, the top layer and focus return. No manual focus trap.
import './modal.css';

let nextId = 0;
const uid = (): string => `st-dialog-${++nextId}`;

interface ModalOptions {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** the primary action is destructive — start focus on Cancel */
  danger?: boolean;
}

function build(options: ModalOptions): {
  dialog: HTMLDialogElement;
  titleId: string;
  messageEl: HTMLElement;
  detailEl: HTMLElement;
  confirm: HTMLButtonElement;
  cancel: HTMLButtonElement;
} {
  const titleId = uid();
  const dialog = document.createElement('dialog');
  dialog.className = 'st-dialog';
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('closedby', 'any');
  dialog.innerHTML = `
    <div class="st-dialog-card">
      <h2 class="st-dialog-title" id="${titleId}"></h2>
      <p class="st-dialog-message"></p>
      <p class="st-dialog-detail" hidden></p>
      <div class="st-dialog-actions">
        <button type="button" class="st-dialog-btn st-dialog-cancel"></button>
        <button type="button" class="st-dialog-btn st-dialog-confirm"></button>
      </div>
    </div>`;
  const q = <T extends HTMLElement>(sel: string): T => dialog.querySelector<T>(sel)!;
  q<HTMLHeadingElement>('.st-dialog-title').textContent = options.title;
  q<HTMLElement>('.st-dialog-message').textContent = options.message;
  const detailEl = q<HTMLElement>('.st-dialog-detail');
  if (options.detail) { detailEl.textContent = options.detail; detailEl.hidden = false; }
  const cancel = q<HTMLButtonElement>('.st-dialog-cancel');
  const confirm = q<HTMLButtonElement>('.st-dialog-confirm');
  cancel.textContent = options.cancelLabel ?? 'Cancel';
  confirm.textContent = options.confirmLabel ?? 'Continue';
  confirm.classList.toggle('is-danger', !!options.danger);
  if (options.danger) cancel.setAttribute('autofocus', '');
  else confirm.setAttribute('autofocus', '');
  return { dialog, titleId, messageEl: q('.st-dialog-message'), detailEl, confirm, cancel };
}

/** Light-dismiss fallback: `closedby` is not in Safari / older WebView2. */
export function lightDismissFallback(dialog: HTMLDialogElement): void {
  if ('closedBy' in HTMLDialogElement.prototype) return;
  let pressedOutside = false;
  const outside = (e: MouseEvent): boolean => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  dialog.addEventListener('pointerdown', (e) => { pressedOutside = outside(e as MouseEvent); });
  dialog.addEventListener('pointerup', (e) => {
    if (pressedOutside && outside(e as MouseEvent)) dialog.close();
  });
}

/** Ask a yes/no question. Esc / backdrop / Cancel resolves false. */
export function showConfirm(options: ModalOptions): Promise<boolean> {
  const { dialog, confirm, cancel } = build(options);
  document.body.appendChild(dialog);
  lightDismissFallback(dialog);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (value: boolean): void => {
      if (done) return;
      done = true;
      dialog.removeEventListener('close', onClose);
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const onClose = (): void => {
      const value = dialog.returnValue === 'ok';
      dialog.returnValue = ''; // a stale value can leak after Esc
      finish(value);
    };
    dialog.addEventListener('close', onClose);
    confirm.addEventListener('click', () => { dialog.returnValue = 'ok'; finish(true); });
    cancel.addEventListener('click', () => finish(false));
    dialog.showModal();
  });
}

/** Text input for the browser-demo sample-folder field (desktop uses a native picker). */
export function showTextInput(options: {
  title: string;
  label: string;
  value?: string;
  placeholder?: string;
}): Promise<string | null> {
  const id = uid();
  const dialog = document.createElement('dialog');
  dialog.className = 'st-dialog';
  dialog.setAttribute('aria-labelledby', id);
  dialog.setAttribute('closedby', 'any');
  dialog.innerHTML = `
    <div class="st-dialog-card">
      <h2 class="st-dialog-title" id="${id}"></h2>
      <label class="st-dialog-label" for="${id}-input"></label>
      <input class="st-dialog-input" id="${id}-input" type="text" spellcheck="false" />
      <div class="st-dialog-actions">
        <button type="button" class="st-dialog-btn st-dialog-cancel">Cancel</button>
        <button type="button" class="st-dialog-btn st-dialog-confirm">Use folder</button>
      </div>
    </div>`;
  dialog.querySelector<HTMLHeadingElement>('.st-dialog-title')!.textContent = options.title;
  dialog.querySelector<HTMLLabelElement>('.st-dialog-label')!.textContent = options.label;
  const input = dialog.querySelector<HTMLInputElement>('.st-dialog-input')!;
  input.setAttribute('autocomplete', 'off');
  input.value = options.value ?? '';
  if (options.placeholder) input.placeholder = options.placeholder;
  document.body.appendChild(dialog);
  lightDismissFallback(dialog);
  return new Promise<string | null>((resolve) => {
    let done = false;
    const finish = (value: string | null): void => {
      if (done) return;
      done = true;
      dialog.removeEventListener('close', onClose);
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const onClose = (): void => finish(null);
    dialog.addEventListener('close', onClose);
    dialog.querySelector('.st-dialog-cancel')!.addEventListener('click', () => finish(null));
    dialog.querySelector('.st-dialog-confirm')!.addEventListener('click', () => {
      const value = input.value.trim();
      finish(value || null);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); dialog.querySelector<HTMLButtonElement>('.st-dialog-confirm')!.click(); }
    });
    dialog.showModal();
    input.focus();
  });
}
