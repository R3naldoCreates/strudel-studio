// ─── Output oscilloscope + spectrum ─────────────────────────────────────────
import { readScope } from '../engine';
import { store } from '../state';

export type ScopeMode = 'time' | 'frequency';

export class Scope {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mode: ScopeMode = 'time';
  private raf = 0;
  private timer: number | null = null;
  private dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(canvas.parentElement as HTMLElement);
    this.fit();
    // interval-driven: keeps drawing when the window is backgrounded (rAF does not)
    this.timer = window.setInterval(() => this.draw(), 33);
  }

  setMode(mode: ScopeMode): void {
    this.mode = mode;
  }

  getMode(): ScopeMode {
    return this.mode;
  }

  destroy(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  private fit(): void {
    const parent = this.canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    this.canvas.width = Math.max(200, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(40, Math.floor(rect.height * this.dpr));
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // backdrop grid
    ctx.strokeStyle = 'rgba(122, 133, 180, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const midY = h / 2;
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    for (const frac of [0.25, 0.75]) {
      ctx.moveTo(0, h * frac);
      ctx.lineTo(w, h * frac);
    }
    ctx.stroke();

    const frame = readScope(this.mode === 'time' ? 'time' : 'frequency');
    const playing = store.state.isPlaying;

    if (!frame || !playing) {
      this.drawIdle(w, h);
      return;
    }

    if (this.mode === 'time') this.drawTime(frame.data, w, h);
    else this.drawFrequency(frame.data, w, h);
  }

  private drawIdle(w: number, h: number): void {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(53, 224, 255, 0.35)';
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.beginPath();
    const midY = h / 2;
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(139, 147, 184, 0.65)';
    ctx.font = `${11 * this.dpr}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('press play — output scope', w / 2, midY - 8 * this.dpr);
  }

  private drawTime(data: Float32Array, w: number, h: number): void {
    const { ctx } = this;
    const midY = h / 2;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#35e0ff');
    grad.addColorStop(0.45, '#ff3ea5');
    grad.addColorStop(1, '#b6ff3b');

    // glow pass
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.4 * this.dpr;
    ctx.shadowColor = '#ff3ea5';
    ctx.shadowBlur = 12 * this.dpr;
    ctx.beginPath();
    const step = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = midY + data[i] * midY * 0.92;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  private drawFrequency(data: Float32Array, w: number, h: number): void {
    const { ctx } = this;
    const bins = Math.floor(data.length * 0.72); // top bins are usually empty
    const barW = w / bins;
    for (let i = 0; i < bins; i++) {
      // dB range roughly [-100, -30]
      const db = data[i];
      const norm = Math.min(1, Math.max(0, (db + 95) / 60));
      const barH = norm * h * 0.94;
      const hue = 190 + (i / bins) * 130; // cyan → magenta → lime-ish
      ctx.fillStyle = `hsla(${hue}, 95%, 62%, ${0.35 + norm * 0.65})`;
      ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
    }
  }
}
