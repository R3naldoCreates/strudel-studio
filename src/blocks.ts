// ─── Block palette (left sidebar) ────────────────────────────────────────────
// Every block is a small, usable musical idea — a groove or a part that sounds
// good on its own and is easy to edit. No filler/noise patterns.
import type { Track, TrackKind } from './types';
import { makeTrack } from './types';

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
  perc: '<path d="M3 12c2.5-5 5-5 7.5 0s5 5 7.5 0 3.5-3 5 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  bell: '<path d="M12 3a5 5 0 0 1 5 5v4l2 4H5l2-4V8a5 5 0 0 1 5-5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="2"/>',
};

const ORANGE = '#ff9f43';
const GREEN = '#b6ff3b';
const CYAN = '#35e0ff';
const PINK = '#ff3ea5';
const GOLD = '#ffd166';
const PURPLE = '#c792ea';

export const WAVES = ['sawtooth', 'square', 'triangle', 'sine'] as const;

function fx(type: string, value: number) {
  return { id: `fx-${Math.random().toString(36).slice(2, 10)}`, type, value };
}

function track(kind: TrackKind, name: string, partial: Partial<Track>): Track {
  return makeTrack(kind, { name, ...partial });
}

export const BLOCK_GROUPS: BlockGroup[] = [
  {
    id: 'sources',
    title: 'Source Blocks',
    items: [
      // ── drums: standard grooves that work in a full mix ────────────────────
      {
        id: 'four-on-floor', label: 'Four on the Floor', desc: 'Classic house · kick on 1–4, clap on 2 & 4, offbeat hats', icon: ICON.kick, color: ORANGE,
        create: () => track('drums', 'Four on the Floor', { drumPattern: 'bd*4, [- cp]*2, [- hh]*4', gain: 0.85 }),
      },
      {
        id: 'backbeat', label: 'Backbeat Kit', desc: 'Basic rock · [bd sd]*2 with eight hats (Strudel workshop)', icon: ICON.snare, color: ORANGE,
        create: () => track('drums', 'Backbeat', { drumPattern: '[bd sd]*2, hh*8', gain: 0.9 }),
      },
      {
        id: 'boom-bap', label: 'Boom Bap', desc: 'Hip-hop · laid-back kick, snare on the 3', icon: ICON.snare, color: ORANGE,
        create: () => track('drums', 'Boom Bap', { drumPattern: 'bd ~ ~ bd ~ ~ sd ~, hh*8', gain: 0.92 }),
      },
      {
        id: 'techno-drive', label: 'Techno Drive', desc: 'Techno · straight kick, offbeat hats, clap on 2 & 4', icon: ICON.kick, color: ORANGE,
        create: () => track('drums', 'Techno Drive', { drumPattern: 'bd*4, [- hh]*4, [- cp]*2', gain: 0.85 }),
      },
      {
        id: 'breakbeat', label: 'Breakbeat', desc: 'Chopped two-step break with ghost snares', icon: ICON.breakbeat, color: ORANGE,
        create: () => track('drums', 'Breakbeat', { drumPattern: 'bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~, ~ ~ ~ ~ sd ~ ~ sd ~ ~ ~ ~ sd ~ sd ~, hh*8', gain: 0.88 }),
      },
      {
        id: 'shaker-rim', label: 'Shaker & Rim', desc: 'Light eight hats + rim accents to widen a groove', icon: ICON.perc, color: ORANGE,
        create: () => track('drums', 'Percussion', { drumPattern: 'hh*8, ~ rim ~ rim', gain: 0.55 }),
      },
      {
        id: 'synth-kick', label: 'Synth Kick', desc: 'Deep generated kick with offbeat hats', icon: ICON.kick, color: ORANGE,
        create: () => track('drums', 'Synth Kick', { drumPattern: 'sbd*4, [- hh]*4', gain: 0.85 }),
      },

      // ── bass: a root-following part per feel ────────────────────────────────
      {
        id: 'sub-pulse', label: 'Sub Pulse', desc: 'Clean sine sub — the foundation of a track', icon: ICON.bass, color: GREEN,
        create: () => track('bass', 'Sub', { notePattern: 'c2 ~ c2 ~ ab1 ~ ab1 ~', wave: 'sine', gain: 0.85, fx: [fx('lpf', 600)] }),
      },
      {
        id: 'acid-line', label: 'Acid Line', desc: 'Resonant 303 bass with a moving filter', icon: ICON.bass, color: GREEN,
        create: () => track('bass', 'Acid', {
          notePattern: 'c2 c2 eb2 c2 g2 ab1 g2 eb2', wave: 'sawtooth', gain: 0.7,
          fx: [fx('lpf', 420), fx('lpq', 16)],
          automation: { target: 'lpf', wave: 'saw', rate: 2, depth: 0.45 },
        }),
      },
      {
        id: 'walking-bass', label: 'Walking Bass', desc: 'Simple major-scale walk — jazzy and warm', icon: ICON.bass, color: GREEN,
        create: () => track('bass', 'Walking Bass', { notePattern: 'c2 e2 g2 a2 g2 e2 d2 ~', wave: 'triangle', gain: 0.8, fx: [fx('lpf', 700)] }),
      },

      // ── melodic: short motifs, not random note clouds ───────────────────────
      {
        id: 'warm-saw', label: 'Warm Saw Lead', desc: 'Singable sawtooth motif with a soft filter', icon: ICON.lead, color: CYAN,
        create: () => track('lead', 'Lead', { notePattern: 'g4 ~ bb4 c5 ~ eb5 ~ c5 bb4 g4 ~', wave: 'sawtooth', gain: 0.32, fx: [fx('lpf', 2400), fx('delay', 0.25)] }),
      },
      {
        id: 'chord-arp', label: 'Chord Arp', desc: 'C-minor chord arpeggio — instant movement', icon: ICON.arp, color: GOLD,
        create: () => track('arp', 'Arp', { notePattern: '[c4,eb4,g4] [ab3,c4,eb4] [eb3,g3,bb3] [bb2,d3,f3]', wave: 'triangle', gain: 0.4 }),
      },
      {
        id: 'bell-melody', label: 'Bell Melody', desc: 'Sparse bell phrase with a little delay', icon: ICON.bell, color: PURPLE,
        create: () => track('keys', 'Bells', { notePattern: 'g5 ~ e5 ~ c5 ~ ~ b4', wave: 'sine', gain: 0.45, fx: [fx('delay', 0.3), fx('delayfb', 0.4)] }),
      },
      {
        id: 'pulse-keys', label: 'Pulse Keys', desc: 'Hollow retro keyboard chord stabs', icon: ICON.keys, color: PURPLE,
        create: () => track('keys', 'Keys', { notePattern: '[c4,eb4,g4] ~ [ab3,c4,eb4] ~', wave: 'square', gain: 0.32, fx: [fx('lpf', 1800)] }),
      },
      {
        id: 'rhodes', label: 'Soft E.Piano', desc: 'Mellow electric-piano voicings', icon: ICON.keys, color: PURPLE,
        create: () => track('keys', 'E.Piano', { notePattern: '<[c4,eb4,g4,b4] [ab3,c4,eb4,g4]>', wave: 'sine', gain: 0.5, fx: [fx('lpf', 2600), fx('room', 1.5)] }),
      },

      // ── pads: longer harmonic beds ─────────────────────────────────────────
      {
        id: 'filter-pad', label: 'Filter Pad', desc: 'Slow C-minor pad with a breathing filter', icon: ICON.pad, color: PINK,
        create: () => track('pad', 'Pad', {
          notePattern: '<[c3,eb3,g3] [ab2,c3,eb3] [eb2,g2,bb2] [bb1,d2,f2]>',
          wave: 'sawtooth', gain: 0.34, fx: [fx('lpf', 1200), fx('room', 4)],
          automation: { target: 'lpf', wave: 'sine', rate: 8, depth: 0.4 },
        }),
      },
      {
        id: 'string-wash', label: 'String Wash', desc: 'Soft sustained string-style harmony', icon: ICON.pad, color: PINK,
        create: () => track('pad', 'Strings', { notePattern: '<[c3,e3,g3] [a2,c3,e3]>/2', wave: 'triangle', gain: 0.42, fx: [fx('room', 5)] }),
      },
    ],
  },
];
