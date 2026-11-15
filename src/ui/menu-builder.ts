// ─── Context menu builder ────────────────────────────────────────────────────
// Given a code span (or its absence), produce the actions that make sense
// *right there*. This is the mapping between strudel's model and the UI.
import type { CodeSpan, Track } from '../types';
import { store } from '../state';
import { BLOCK_GROUPS } from '../blocks';
import { FX_MAP } from '../fx';

import type { CtxEntry } from './contextmenu';

const svg = (path: string) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICONS = {
  mute: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>'),
  solo: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1.5 14a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8L18 6"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4z"/>'),
  lfo: svg('<path d="M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/>'),
  wave: svg('<path d="M2 12h4l2-7 3 14 3-11 2 4h6"/>'),
  note: svg('<path d="M9 18V5l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>'),
  bolt: svg('<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
  grid: svg('<path d="M4 4h16v16H4zM4 12h16M12 4v16"/>'),
};

function getTrack(id: string | undefined): Track | undefined {
  return store.state.song.tracks.find((t) => t.id === id);
}

function addTrackOf(blockId: string): void {
  const item = BLOCK_GROUPS.flatMap((g) => g.items).find((i) => i.id === blockId);
  if (item) store.addTrack(item.create());
}

export function buildMenu(span: CodeSpan | undefined, offset: number): CtxEntry[] {
  const entries: CtxEntry[] = [];

  const addLayerBlocks = (): CtxEntry[] => [
    { id: 'add-drums', label: 'Add Drum Layer', hint: 'bd sd hh…', icon: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>'), run: () => addTrackOf('four-on-floor') },
    { id: 'add-break', label: 'Add Breakbeat Layer', icon: svg('<path d="M4 18V8l3 4 3-7 3 9 3-5 3 6 3-3"/>'), run: () => addTrackOf('breakbeat') },
    { id: 'add-bass', label: 'Add Bass Layer', hint: 'square · lpf', icon: ICONS.wave, run: () => addTrackOf('sub-bass') },
    { id: 'add-lead', label: 'Add Lead Layer', hint: 'sawtooth', icon: ICONS.wave, run: () => addTrackOf('lead-saw') },
    { id: 'add-pad', label: 'Add Pad Layer', hint: 'slow saw', icon: ICONS.note, run: () => addTrackOf('pad-warm') },
    { id: 'add-arp', label: 'Add Arp Layer', icon: ICONS.repeat, run: () => addTrackOf('arp-minor') },
    { id: 'add-keys', label: 'Add Keys Layer', icon: ICONS.note, run: () => addTrackOf('keys-bell') },
  ];

  const trackTail = (t: Track): CtxEntry[] => {
    const fxTotal = t.fx.length;
    const fxLive = t.fx.filter((f) => !f.bypassed).length;
    const additiveCount =
      fxTotal +
      (t.automation ? 1 : 0) +
      (t.sampleIndex > 0 ? 1 : 0) +
      (t.octave !== 0 ? 1 : 0) +
      (t.orbit !== null ? 1 : 0);

    const cleanup: CtxEntry[] = [];
    if (fxTotal > 0) {
      cleanup.push({
        id: 'fx-bypass-all',
        label: fxLive > 0 ? `Bypass All ${fxTotal} Effect${fxTotal > 1 ? 's' : ''}` : `Re-enable All ${fxTotal} Effect${fxTotal > 1 ? 's' : ''}`,
        hint: 'mute without deleting',
        icon: ICONS.bolt,
        run: () => store.setFxBypassAll(t.id, fxLive > 0),
      });
      cleanup.push({
        id: 'fx-clear-all',
        label: `Clear All Effects`,
        hint: `${fxTotal} effect${fxTotal > 1 ? 's' : ''} — Ctrl+Z to undo`,
        icon: ICONS.trash,
        run: () => store.clearFx(t.id),
      });
    }
    if (t.automation) {
      cleanup.push({
        id: 'auto-clear',
        label: `Remove LFO → ${t.automation.target}`,
        icon: ICONS.lfo,
        run: () => store.updateTrack(t.id, { automation: null }),
      });
      cleanup.push({
        id: 'auto-toggle',
        label: t.automation.bypassed ? 'Enable LFO (unmute)' : 'Bypass LFO (mute)',
        icon: ICONS.lfo,
        run: () => store.updateTrack(t.id, { automation: { ...t.automation!, bypassed: !t.automation!.bypassed } }),
      });
    }
    if (t.sampleIndex > 0) {
      cleanup.push({ id: 'n-clear2', label: `Clear Variation (n = ${t.sampleIndex})`, icon: ICONS.repeat, run: () => store.updateTrack(t.id, { sampleIndex: 0 }) });
    }
    if (t.octave !== 0) {
      cleanup.push({ id: 'oct-clear', label: `Clear Octave (${t.octave > 0 ? '+' : ''}${t.octave})`, icon: ICONS.repeat, run: () => store.updateTrack(t.id, { octave: 0 }) });
    }
    if (t.orbit !== null) {
      cleanup.push({ id: 'orbit-clear', label: `Clear Orbit (${t.orbit})`, icon: ICONS.grid, run: () => store.updateTrack(t.id, { orbit: null }) });
    }
    if (additiveCount > 1) {
      cleanup.push({
        id: 'clear-additives',
        label: `Clear Everything Added (${additiveCount})`,
        hint: 'keeps pattern + gain — Ctrl+Z to undo',
        icon: ICONS.trash,
        danger: true,
        run: () => store.clearAdditives(t.id),
      });
    }

    return [
      ...(cleanup.length > 0 ? [{ separator: true } as CtxEntry, ...cleanup] : []),
      { separator: true } as CtxEntry,
      { id: 'mute', label: t.muted ? 'Unmute Track' : 'Mute Track', icon: ICONS.mute, run: () => store.updateTrack(t.id, { muted: !t.muted }) },
      { id: 'solo', label: t.solo ? 'Unsolo Track' : 'Solo Track', icon: ICONS.solo, run: () => store.updateTrack(t.id, { solo: !t.solo }) },
      { id: 'dup', label: 'Duplicate Track', icon: ICONS.copy, run: () => store.duplicateTrack(t.id) },
      { id: 'up', label: 'Move Earlier', icon: ICONS.arrowUp, run: () => store.moveTrack(t.id, -1) },
      { id: 'down', label: 'Move Later', icon: ICONS.arrowDown, run: () => store.moveTrack(t.id, +1) },
      { id: 'delete', label: 'Delete Track (removes its code block)', icon: ICONS.trash, danger: true, run: () => store.removeTrack(t.id) },
    ];
  };

  // ── no span → empty code area or the setcpm line ─────────────────────────
  if (!span) {
    entries.push(...addLayerBlocks());
    entries.push({ separator: true } as CtxEntry);
    entries.push({ id: 'reorder-hint', label: 'Tip: layers play top-to-bottom', disabled: true });
    return entries;
  }

  const track = getTrack(span.trackId);
  if (!track) return addLayerBlocks();
  const t = track;

  switch (span.kind) {
    case 'track': {
      entries.push(
        { id: 'inspect', label: 'Edit in Inspector', icon: ICONS.edit, run: () => store.selectTrack(t.id, 'track') },
      );
      entries.push(...trackTail(t));
      break;
    }

    case 'drums-pattern':
    case 'synth-pattern': {
      const isDrums = span.kind === 'drums-pattern';
      const patternKey = isDrums ? 'drumPattern' : 'notePattern';
      const pattern = t[patternKey];
      const innerFrom = span.from + 1; // skip opening quote
      const rel = Math.max(0, Math.min(pattern.length, offset - innerFrom));
      const insert = (token: string) => {
        const next = pattern.slice(0, rel) + token + pattern.slice(rel);
        store.updateTrack(t.id, { [patternKey]: next } as Partial<Track>);
      };
      entries.push(
        { id: 'edit-pattern', label: 'Open Pattern Editor', hint: 'inspector', icon: ICONS.edit, run: () => store.selectTrack(t.id, span.kind) },
        { separator: true } as CtxEntry,
        { id: 'ins-fast2', label: 'Insert ×2 (fast)', hint: 'a*2', icon: ICONS.repeat, run: () => insert('*2') },
        { id: 'ins-fast4', label: 'Insert ×4', hint: 'a*4', icon: ICONS.repeat, run: () => insert('*4') },
        { id: 'ins-group', label: 'Insert [ group ]', hint: 'squeeze into one step', icon: ICONS.grid, run: () => insert('[]') },
        { id: 'ins-alternate', label: 'Insert < alt >', hint: 'cycle per cycle', icon: ICONS.repeat, run: () => insert('<>') },
        { id: 'ins-euclidean', label: 'Insert Euclidean (3,8)', hint: 'bjorklund rhythm', icon: ICONS.bolt, run: () => insert('(3,8)') },
        { id: 'ins-rest', label: 'Insert rest ~', icon: ICONS.plus, run: () => insert(' ~ ') },
        { id: 'ins-coin', label: 'Insert chance ?', hint: '50% play chance', icon: ICONS.bolt, run: () => insert('?') },
        { id: 'ins-stack', label: 'Insert stack ,', hint: 'parallel patterns', icon: ICONS.grid, run: () => insert(',') },
      );
      if (isDrums) {
        entries.push({ separator: true } as CtxEntry);
        const kit = ['bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'cr', 'cb', 'tb', 'misc'];
        for (const s of kit) {
          entries.push({ id: `kit-${s}`, label: `Insert “${s}”`, icon: ICONS.note, run: () => insert(` ${s} `) });
        }
      }
      entries.push(...trackTail(t));
      break;
    }

    case 'synth-source': {
      for (const wave of ['sawtooth', 'square', 'triangle', 'sine'] as const) {
        entries.push({
          id: `wave-${wave}`,
          label: `Wave: ${wave}${t.wave === wave ? '  ✓' : ''}`,
          icon: ICONS.wave,
          run: () => store.updateTrack(t.id, { wave }),
        });
      }
      entries.push({ separator: true } as CtxEntry);
      entries.push(
        { id: 'oct-up', label: 'Octave Up', icon: ICONS.arrowUp, run: () => store.updateTrack(t.id, { octave: t.octave + 1 }) },
        { id: 'oct-down', label: 'Octave Down', icon: ICONS.arrowDown, run: () => store.updateTrack(t.id, { octave: t.octave - 1 }) },
      );
      entries.push(...trackTail(t));
      break;
    }

    case 'drums-source': {
      entries.push(
        { id: 'n-next', label: 'Next Sample Variant', hint: `n = ${(t.sampleIndex + 1) % 99}`, icon: ICONS.repeat, run: () => store.updateTrack(t.id, { sampleIndex: t.sampleIndex + 1 }) },
        { id: 'n-prev', label: 'Previous Variant', icon: ICONS.repeat, run: () => store.updateTrack(t.id, { sampleIndex: Math.max(0, t.sampleIndex - 1) }) },
        { id: 'n-clear', label: 'Clear Variant (n = 0)', icon: ICONS.plus, run: () => store.updateTrack(t.id, { sampleIndex: 0 }) },
      );
      entries.push(...trackTail(t));
      break;
    }

    case 'gain': {
      entries.push(
        { id: 'gain-up', label: 'Gain +0.08', icon: ICONS.plus, run: () => store.updateTrack(t.id, { gain: round2(t.gain + 0.08) }) },
        { id: 'gain-down', label: 'Gain −0.08', icon: ICONS.plus, run: () => store.updateTrack(t.id, { gain: round2(Math.max(0, t.gain - 0.08)) }) },
        { id: 'gain-reset', label: 'Reset to 0.8', icon: ICONS.repeat, run: () => store.updateTrack(t.id, { gain: 0.8 }) },
        { separator: true } as CtxEntry,
        { id: 'gain-lfo', label: 'Add Gain LFO (volume changer)', hint: 'sine · 4 cycles', icon: ICONS.lfo, run: () => store.updateTrack(t.id, { automation: { target: 'gain', wave: 'sine', rate: 4, depth: 0.35 } }) },
      );
      entries.push(...trackTail(t));
      break;
    }

    case 'automation': {
      const a = t.automation;
      entries.push({
        id: 'auto-toggle2',
        label: a?.bypassed ? 'Enable LFO (unmute)' : 'Bypass LFO (mute)',
        icon: ICONS.lfo,
        run: () => a && store.updateTrack(t.id, { automation: { ...a, bypassed: !a.bypassed } }),
      });
      entries.push(
        { id: 'auto-off', label: 'Remove Automation', danger: true, icon: ICONS.trash, run: () => store.updateTrack(t.id, { automation: null }) },
        { id: 'auto-fast', label: 'LFO ×2 Faster', icon: ICONS.plus, run: () => a && store.updateTrack(t.id, { automation: { ...a, rate: Math.max(1, a.rate / 2) } }) },
        { id: 'auto-slow', label: 'LFO ÷2 Slower', icon: ICONS.plus, run: () => a && store.updateTrack(t.id, { automation: { ...a, rate: a.rate * 2 } }) },
        { id: 'auto-deeper', label: 'Deeper (+0.12)', icon: ICONS.arrowUp, run: () => a && store.updateTrack(t.id, { automation: { ...a, depth: Math.min(1, a.depth + 0.12) } }) },
        { id: 'auto-shallower', label: 'Shallower (−0.12)', icon: ICONS.arrowDown, run: () => a && store.updateTrack(t.id, { automation: { ...a, depth: Math.max(0.05, a.depth - 0.12) } }) },
        { separator: true } as CtxEntry,
        ...(['sine', 'saw', 'tri', 'square', 'rand', 'perlin'] as const).map((wave) => ({
          id: `auto-wave-${wave}`,
          label: `Wave: ${wave}`,
          icon: ICONS.wave,
          run: () => store.updateTrack(t.id, { automation: { ...(a ?? { target: 'gain' as const, rate: 4, depth: 0.35 }), wave } }),
        })),
      );
      entries.push(...trackTail(t));
      break;
    }

    case 'fx': {
      const fxId = span.fxId;
      const fx = t.fx.find((f) => f.id === fxId);
      const def = fx ? FX_MAP[fx.type] : undefined;
      entries.push({
        id: 'fx-open',
        label: `Edit “${def?.label ?? 'FX'}” in Inspector`,
        icon: ICONS.edit,
        run: () => store.select({ kind: 'fx', trackId: t.id, fxId }),
      });
      if (fx) {
        entries.push({
          id: 'fx-bypass',
          label: fx.bypassed ? 'Enable This Effect (unmute)' : 'Bypass This Effect (mute)',
          hint: 'stays in the chain, silent in code',
          icon: ICONS.bolt,
          run: () => store.updateTrack(t.id, { fx: t.fx.map((f) => (f.id === fx.id ? { ...f, bypassed: !f.bypassed } : f)) }),
        });
        const automatable = fx.type === 'pan' || fx.type === 'lpf';
        if (automatable) {
          entries.push({
            id: 'fx-lfo',
            label: 'Automate with LFO',
            hint: `${fx.type} · sine`,
            icon: ICONS.lfo,
            run: () => store.updateTrack(t.id, { automation: { target: fx.type as 'pan' | 'lpf', wave: 'sine', rate: 4, depth: 0.5 } }),
          });
        }
        entries.push({
          id: 'fx-reset',
          label: 'Reset to Default',
          icon: ICONS.repeat,
          run: () => store.updateTrack(t.id, { fx: t.fx.map((f) => (f.id === fx.id ? { ...f, value: def?.enumValues ? def.defEnum ?? 'a' : def?.params?.[0]?.def ?? f.value } : f)) }),
        });
        entries.push({
          id: 'fx-remove',
          label: 'Remove This FX',
          danger: true,
          icon: ICONS.trash,
          run: () => store.updateTrack(t.id, { fx: t.fx.filter((f) => f.id !== fx.id) }),
        });
      }
      entries.push(...trackTail(t));
      break;
    }

    case 'orbit': {
      for (const orbit of [0, 1, 2, 3]) {
        entries.push({
          id: `orbit-${orbit}`,
          label: `Orbit ${orbit}${t.orbit === orbit ? '  ✓' : ''}`,
          icon: ICONS.grid,
          run: () => store.updateTrack(t.id, { orbit }),
        });
      }
      entries.push({ id: 'orbit-off', label: 'Clear Orbit', icon: ICONS.trash, run: () => store.updateTrack(t.id, { orbit: null }) });
      entries.push(...trackTail(t));
      break;
    }
  }

  return entries;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
