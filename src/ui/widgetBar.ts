// ─── Widget bar: renders strudel slider() calls as draggable controls ───────
// Lives under the editor toolbar; rewrites the code in place on drag,
// exactly like strudel.cc's built-in widgets (they edit the same source).
import { findWidgets, formatWidgetNumber, type WidgetSlider } from './widgets';

export interface WidgetBarHandle {
  /** re-scan the doc and sync the bar (no-op while a slider is dragging) */
  update(doc: string): void;
}

interface WidgetBarOptions {
  getDoc: () => string;
  replaceRange: (from: number, to: number, text: string) => void;
  /** called after a value rewrite — main re-evaluates the pattern (debounced there) */
  onLiveChange: () => void;
}

export function createWidgetBar(root: HTMLElement, opts: WidgetBarOptions): WidgetBarHandle {
  let dragging = false;
  let lastDoc = '';
  let widgets: WidgetSlider[] = [];

  const renderWidget = (w: WidgetSlider): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'widget';

    const name = document.createElement('span');
    name.className = 'widget-name';
    name.textContent = `${w.context} ·L${w.line}`;
    name.title = `slider at line ${w.line} — feeds into ${w.context}(…)`;
    el.appendChild(name);

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'widget-slider';
    range.min = String(w.min);
    range.max = String(w.max);
    range.step = String(w.step > 0 ? w.step : (w.max - w.min) / 200);
    range.value = String(w.value);
    range.setAttribute('aria-label', `${w.context} slider`);
    el.appendChild(range);

    const readout = document.createElement('span');
    readout.className = 'widget-value';
    readout.textContent = formatWidgetNumber(w.value);
    el.appendChild(readout);

    const release = (): void => {
      if (!dragging) return;
      dragging = false;
      opts.onLiveChange();
      syncToDoc();
    };

    range.addEventListener('pointerdown', () => {
      dragging = true;
    });
    range.addEventListener('input', () => {
      const v = Number(range.value);
      readout.textContent = formatWidgetNumber(v);
      // rewrite only arg0 of this slider(...) — w holds fresh offsets (see rescan)
      opts.replaceRange(w.valueFrom, w.valueTo, formatWidgetNumber(v));
      rescan(); // offsets in `widgets` stay true after our own edit
      opts.onLiveChange();
    });
    range.addEventListener('pointerup', release);
    range.addEventListener('keydown', () => {
      dragging = true;
    });
    range.addEventListener('keyup', release);

    return el;
  };

  /** re-parse the doc and copy fresh offsets/values onto the shared widget objects */
  const rescan = (): void => {
    const doc = opts.getDoc();
    const found = findWidgets(doc);
    if (found.length !== widgets.length) {
      widgets = found;
      render(doc);
      return;
    }
    for (let i = 0; i < widgets.length; i++) {
      Object.assign(widgets[i], found[i]);
    }
  };

  /** full re-render from the current doc */
  const syncToDoc = (): void => {
    const doc = opts.getDoc();
    lastDoc = doc;
    render(doc);
  };

  const render = (doc: string): void => {
    root.innerHTML = '';
    widgets = findWidgets(doc);
    if (widgets.length === 0) {
      root.hidden = true;
      return;
    }
    root.hidden = false;

    const label = document.createElement('span');
    label.className = 'widget-bar-label';
    label.textContent = `LIVE ${widgets.length}×`;
    label.title = 'slider() calls found in your code — drag to perform';
    root.appendChild(label);

    for (const widget of widgets) {
      root.appendChild(renderWidget(widget));
    }
  };

  // global release keeps state sane when the pointer leaves the slider
  window.addEventListener('pointerup', () => {
    if (dragging) {
      dragging = false;
      opts.onLiveChange();
      syncToDoc();
    }
  });

  return {
    update(doc: string): void {
      if (dragging) return;
      if (doc === lastDoc) return;
      lastDoc = doc;
      render(doc);
    },
  };
}
