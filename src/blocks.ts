// ─── Block palette (left sidebar) ────────────────────────────────────────────
import type { TrackKind } from './types';
import { makeTrack } from './types';
import type { Track } from './types';

export interface BlockItem {
  id: string;
  label: string;
  desc: string;
  /** inline svg innerHTML */
  icon: string;
  color: string;
  create: () => Track;
}

export interface BlockGroup {
  id: string;
  title: string;
  items: BlockItem[];
}

const ICON = {
  kick: '<path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>',
  snare: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M6 14l12-4M6 10l12 4" stroke="currentColor" stroke-width="1.6"/>',
  bass: '<path d="M3 14c2-6 4-6 6 0s4 6 6 0 4-6 6 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  keys: '<rect x="3" y="7" width="18" height="10" rx="1.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 7v5M12 7v5M16 7v5" stroke="currentColor" stroke-width="1.6"/>',
  pad: '<path d="M4 18h16M6 18V9l6-5 6 5v9" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>',
  arp: '<path d="M4 15l4-6 4 8 4-10 4 8 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  lead: '<path d="M5 17l7-10 2.5 6L17 11l2 3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  breakbeat: '<path d="M4 18V8l3 4 3-7 3 9 3-5 3 6 3-3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  wave: '<path d="M3 12c2.5-5 5-5 7.5 0s5 5 7.5 0 3.5-3 5 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  bell: '<path d="M12 3a5 5 0 0 1 5 5v4l2 4H5l2-4V8a5 5 0 0 1 5-5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="2"/>',
  fm: '<circle cx="9" cy="12" r="6" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="16" cy="12" r="4" stroke="currentColor" stroke-width="2" fill="none"/>',
};

export const BLOCK_GROUPS: BlockGroup[] = [
  {
    id: 'sources',
    title: 'Source Blocks',
    items: [
      {
        id: 'supersaw-lead', label: 'Supersaw Lead', desc: 'Detuned saw stack — big & bright', icon: ICON.lead, color: '#35e0ff',
        create: () => makeTrack('lead', { name: 'Supersaw', notePattern: '<c4 eb4 g4 bb4>*2', wave: 'supersaw', gain: 0.35 }),
      },
      {
        id: 'pulse-keys', label: 'Pulse Keys', desc: 'Hollow pulse-width keys, retro', icon: ICON.keys, color: '#c792ea',
        create: () => makeTrack('keys', { name: 'Pulse', notePattern: 'e4 ~ g4 ~ b4 g4 e4 ~', wave: 'pulse', gain: 0.5 }),
      },
      {
        id: 'bytebeat', label: 'Bytebeat', desc: 'Raw 8-bit chiptune crunch', icon: ICON.fm, color: '#ff9f43',
        create: () => makeTrack('lead', { name: 'Bytebeat', notePattern: 'c3*8', wave: 'bytebeat', gain: 0.35 }),
      },
      {
        id: 'sbd-kick', label: 'Synth Kick', desc: 'Synthesized sub-bass drum', icon: ICON.kick, color: '#ff9f43',
        create: () => makeTrack('drums', { name: 'Synth Kick', drumPattern: 'sbd*4, ~ hh*4' }),
      },
      {
        id: 'four-on-floor', label: 'Four on the Floor', desc: 'Kick pulse + offbeat hats', icon: ICON.kick, color: '#ff9f43',
        create: () => makeTrack('drums', { name: 'Drums', drumPattern: 'bd*4, ~ hh*2' }),
      },
      {
        id: 'breakbeat', label: 'Breakbeat', desc: 'Syncopated funk chop', icon: ICON.breakbeat, color: '#ff9f43',
        create: () => makeTrack('drums', { name: 'Break', drumPattern: 'bd*2, [~ bd], sd(3,8), hh*8' }),
      },
      {
        id: 'rock-kit', label: 'Rock Kit', desc: 'Classic kit pattern', icon: ICON.snare, color: '#ff9f43',
        create: () => makeTrack('drums', { name: 'Kit', drumPattern: 'bd ~ sd bd, hh*8, ~ cp' }),
      },
      {
        id: 'percussion', label: 'Perc Loop', desc: 'Shuffled hats + rim', icon: ICON.wave, color: '#ff9f43',
        create: () => makeTrack('drums', { name: 'Perc', drumPattern: 'hh*8(3,4), ~ rim*2' }),
      },
      {
        id: 'sub-bass', label: 'Sub Bass', desc: 'Deep square wave, LP-filtered', icon: ICON.bass, color: '#b6ff3b',
        create: () => makeTrack('bass', {
          name: 'Bass', notePattern: 'c2 ~ c2 eb2 g2 ~ g1 ~', wave: 'square',
          fx: [{ id: `fx-${rid()}`, type: 'lpf', value: 750 }],
        }),
      },
      {
        id: 'acid-bass', label: 'Acid Bass', desc: 'Resonant 303-style line', icon: ICON.bass, color: '#b6ff3b',
        create: () => makeTrack('bass', {
          name: 'Acid', notePattern: 'c2 c2 eb2 c2 g2 ab1 g2 eb2', wave: 'sawtooth',
          fx: [
            { id: `fx-${rid()}`, type: 'lpf', value: 420 },
            { id: `fx-${rid()}`, type: 'lpq', value: 18 },
          ],
          automation: { target: 'lpf', wave: 'saw', rate: 2, depth: 0.55 },
        }),
      },
      {
        id: 'lead-saw', label: 'Saw Lead', desc: 'Bright cutting lead', icon: ICON.lead, color: '#35e0ff',
        create: () => makeTrack('lead', { name: 'Lead', notePattern: '<c4 eb4 g4 bb4>*2', wave: 'sawtooth', gain: 0.4 }),
      },
      {
        id: 'lead-square', label: 'Square Lead', desc: 'Hollow chiptune lead', icon: ICON.lead, color: '#35e0ff',
        create: () => makeTrack('lead', { name: 'Chiptune', notePattern: 'c5 ~ e5 ~ g5 e5 ~ d5', wave: 'square', gain: 0.3, octave: 0 }),
      },
      {
        id: 'pad-warm', label: 'Warm Pad', desc: 'Slow evolving saw pad', icon: ICON.pad, color: '#ff3ea5',
        create: () => makeTrack('pad', { name: 'Pad', notePattern: '<c3 eb3 g3> <ab2 bb2 g3>', wave: 'sawtooth', gain: 0.35, fx: [{ id: `fx-${rid()}`, type: 'room', value: 3 }] }),
      },
      {
        id: 'pad-strings', label: 'Triangle Pad', desc: 'Soft mellow triad wash', icon: ICON.pad, color: '#ff3ea5',
        create: () => makeTrack('pad', { name: 'Strings', notePattern: '<c3 e3 g3 b3>/2 <a2 c3 e3>/2', wave: 'triangle', gain: 0.5, fx: [{ id: `fx-${rid()}`, type: 'room', value: 4 }] }),
      },
      {
        id: 'arp-minor', label: 'Minor Arp', desc: 'Classic minor arpeggio', icon: ICON.arp, color: '#ffd166',
        create: () => makeTrack('arp', { name: 'Arp', notePattern: '[c4 e4 g4] [e4 g4 c5] [g4 c5 eb5] [e4 g4 c5]', wave: 'square', gain: 0.32 }),
      },
      {
        id: 'keys-bell', label: 'Bell Keys', desc: 'FM-ish triangle bell', icon: ICON.bell, color: '#c792ea',
        create: () => makeTrack('keys', { name: 'Bells', notePattern: 'g5 ~ e5 ~ c5 ~ ~ b4', wave: 'triangle', gain: 0.5, octave: 0, fx: [{ id: `fx-${rid()}`, type: 'delay', value: 0.3 }, { id: `fx-${rid()}`, type: 'delayfb', value: 0.5 }] }),
      },
      {
        id: 'keys-fm', label: 'FM Keys', desc: 'Sine + tremolo-style FM feel', icon: ICON.fm, color: '#c792ea',
        create: () => makeTrack('keys', { name: 'FM Keys', notePattern: '<e4 g4 b4 d5>*2', wave: 'sine', gain: 0.6, automation: { target: 'gain', wave: 'sine', rate: 2, depth: 0.18 } }),
      },
    ],
  },
];

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const WAVES = ['sawtooth', 'square', 'triangle', 'sine'] as const;
