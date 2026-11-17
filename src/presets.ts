// ─── Song presets (ready-made, actually musical starting points) ─────────────
// Each preset is a complete little arrangement: a real chord progression,
// a bass that follows the roots, and a drum groove that fits the style.
// Tempo is setcpm = cycles per minute, where one cycle is one 4/4 bar.
import type { Song } from './types';
import { makeTrack, makeFx } from './types';

export interface Preset {
  id: string;
  label: string;
  desc: string;
  /** user-created presets can be deleted */
  user?: boolean;
  build: () => Song;
}

function song(name: string, bpm: number, tracks: ReturnType<typeof makeTrack>[]): Song {
  return { formatVersion: 1, name, bpm, tracks };
}

/** one chord per bar — chains read left to right, one cycle each */
const chords = (...rows: string[]): string => `<${rows.join(' ')}>`;

export const PRESETS: Preset[] = [
  {
    id: 'house', label: 'House — Warm Up', desc: '124 bpm · round kick, quarter hats, warm C-minor chords',
    build: () => song('House — Warm Up', 124, [
      // Official Strudel "Classic house": bd*4, clap on 2 & 4, OFFBEAT hats.
      makeTrack('drums', {
        name: 'Four on the Floor', drumPattern: 'bd*4, [- cp]*2, [- hh]*4', gain: 0.8,
      }),
      makeTrack('bass', {
        name: 'Bass', notePattern: 'c2 ~ ~ ~ ab1 ~ ~ ~ eb2 ~ ~ ~ bb1 ~ ~ ~', wave: 'triangle',
        gain: 0.75, fx: [makeFx('lpf', 600)],
      }),
      makeTrack('keys', {
        name: 'Chords', notePattern: chords('[c4,eb4,g4]', '[ab3,c4,eb4]', '[eb3,g3,bb3]', '[bb2,d3,f3]'),
        wave: 'triangle', gain: 0.45, fx: [makeFx('lpf', 2000), makeFx('room', 2)],
      }),
      makeTrack('pad', {
        name: 'Pad', notePattern: chords('[c3,eb3,g3]', '[ab2,c3,eb3]', '[eb2,g2,bb2]', '[bb1,d2,f2]'),
        wave: 'sawtooth', gain: 0.3, fx: [makeFx('lpf', 1100), makeFx('room', 5)],
        automation: { target: 'lpf', wave: 'sine', rate: 8, depth: 0.3 },
      }),
      makeTrack('lead', {
        name: 'Top Line', notePattern: '~ g4 ~ ~ eb5 ~ ~ c5 ~', wave: 'triangle',
        gain: 0.26, fx: [makeFx('lpf', 2600), makeFx('delay', 0.3), makeFx('delayfb', 0.35)],
      }),
    ]),
  },
  {
    id: 'techno', label: 'Techno — Night Drive', desc: '132 bpm · steady kick, sparse hats, warm bass and haze',
    build: () => song('Techno — Night Drive', 132, [
      // Techno: straight kick with offbeat hats, clap on the backbeat.
      makeTrack('drums', {
        name: 'Drive', drumPattern: 'bd*4, [- hh]*4, [- cp]*2', gain: 0.85,
      }),
      makeTrack('bass', {
        name: 'Bass', notePattern: 'c2 ~ c2 ~ eb2 ~ g2 ~', wave: 'sawtooth', gain: 0.7,
        fx: [makeFx('lpf', 420), makeFx('lpq', 10)],
        automation: { target: 'lpf', wave: 'sine', rate: 4, depth: 0.35 },
      }),
      makeTrack('pad', {
        name: 'Atmosphere', notePattern: chords('[c3,g3,bb3]', '[ab2,eb3,g3]', '[eb2,bb2,d3]', '[bb2,f3,ab3]'),
        wave: 'sawtooth', gain: 0.32, fx: [makeFx('lpf', 1000), makeFx('room', 6)],
        automation: { target: 'lpf', wave: 'perlin', rate: 8, depth: 0.3 },
      }),
      makeTrack('keys', {
        name: 'Spark', notePattern: '~ ~ eb4 ~ ~ ~ g4 ~', wave: 'triangle', gain: 0.3,
        fx: [makeFx('lpf', 2400), makeFx('delay', 0.35), makeFx('delayfb', 0.4)],
      }),
    ]),
  },
  {
    id: 'boombap', label: 'Boom Bap — Backpack', desc: '90 bpm · laid-back backbeat, smoky chord stabs',
    build: () => song('Boom Bap — Backpack', 90, [
      makeTrack('drums', {
        name: 'Kit', drumPattern: 'bd ~ ~ bd ~ ~ sd ~, hh*8, ~ ~ ~ cp', gain: 0.92,
      }),
      makeTrack('bass', {
        name: 'Walking Bass', notePattern: 'c2 ~ e2 g2 ~ a2 g2 e2 ~', wave: 'triangle', gain: 0.8,
        fx: [makeFx('lpf', 700)],
      }),
      makeTrack('keys', {
        name: 'Stabs', notePattern: '[c4,eb4,g4] ~ [eb4,g4,bb4] ~ [f4,a4,c5] ~ [g4,bb4,d5] ~',
        wave: 'sawtooth', gain: 0.34, fx: [makeFx('lpf', 1800), makeFx('room', 2)],
      }),
    ]),
  },
  {
    id: 'dnb', label: 'Drum & Bass — Rollout', desc: '174 bpm · 10s pad intro, then break + sub drop in',
    build: () => song('Drum & Bass — Rollout', 174, [
      // Two-step break in 16 steps: kick on 1 / 2.5 / 3.5, snare on 2 & 4
      // with ghost hits, straight eight hats — the standard DnB backbone.
      makeTrack('drums', {
        name: 'Break', drumPattern: 'bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~, ~ ~ ~ ~ sd ~ ~ sd ~ ~ ~ ~ sd ~ sd ~, hh*8', gain: 0.88,
        delaySeconds: 10, // intro: pad + stab first, drums drop in at 10s
      }),
      makeTrack('bass', {
        name: 'Sub', notePattern: 'c2 ~ c2 ~ ab1 ~ eb2 ~', wave: 'sine', gain: 0.85,
        fx: [makeFx('lpf', 800)], delaySeconds: 10,
      }),
      makeTrack('pad', {
        name: 'Pad', notePattern: chords('[c3,eb3,g3]', '[ab2,c3,eb3]', '[eb2,g2,bb2]'),
        wave: 'sawtooth', gain: 0.3, fx: [makeFx('lpf', 1400), makeFx('room', 4)],
      }),
      makeTrack('keys', {
        name: 'Stab', notePattern: '~ [c4,eb4,g4] ~ ~ [ab3,c4,eb4] ~',
        wave: 'triangle', gain: 0.3, fx: [makeFx('lpf', 2800), makeFx('delay', 0.25), makeFx('delayfb', 0.3)],
      }),
    ]),
  },
  {
    id: 'ambient', label: 'Ambient — Slow Tide', desc: '72 bpm · long chords, glass bells, no drums',
    build: () => song('Ambient — Slow Tide', 72, [
      makeTrack('pad', {
        name: 'Drone', notePattern: chords('[c3,eb3,g3]', '[ab2,c3,eb3]', '[f2,a2,c3]', '[g2,b2,d3]'),
        wave: 'sawtooth', gain: 0.36, fx: [makeFx('lpf', 1300), makeFx('room', 6)],
        automation: { target: 'lpf', wave: 'perlin', rate: 8, depth: 0.6 },
      }),
      makeTrack('keys', {
        name: 'Bells', notePattern: 'g5 ~ ~ eb5 ~ ~ c5 ~ d5 ~ ~ ~', wave: 'sine', gain: 0.38,
        fx: [makeFx('delay', 0.4), makeFx('delayfb', 0.55), makeFx('room', 3)],
      }),
      makeTrack('bass', {
        name: 'Low', notePattern: 'c2 ~ ~ ~ ~ ~ ~ ~', wave: 'sine', gain: 0.5,
      }),
    ]),
  },
];

// ── user presets — songs saved from the app, persisted in localStorage ───────
const USER_KEY = 'strudel-studio.presets.v1';

interface StoredUserPreset {
  id: string;
  label: string;
  desc: string;
  createdAt: number;
  song: Song;
}

export function loadUserPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as StoredUserPreset[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e) => e && e.song?.formatVersion === 1 && Array.isArray(e.song?.tracks))
      .map((e) => ({
        id: e.id,
        label: e.label,
        desc: e.desc || 'your preset',
        user: true,
        build: () => JSON.parse(JSON.stringify(e.song)) as Song,
      }));
  } catch {
    return [];
  }
}

function readStored(): StoredUserPreset[] {
  try {
    const raw = localStorage.getItem(USER_KEY);
    const arr = raw ? (JSON.parse(raw) as StoredUserPreset[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Save the current song as a user preset. Returns the new preset. */
export function saveUserPreset(label: string, current: Song): Preset | null {
  const name = label.trim();
  if (!name) return null;
  const stored = readStored();
  const entry: StoredUserPreset = {
    id: `user-${Date.now().toString(36)}`,
    label: name,
    desc: `${current.bpm}bpm · ${current.tracks.length} layer${current.tracks.length === 1 ? '' : 's'} · your preset`,
    createdAt: Date.now(),
    song: JSON.parse(JSON.stringify({ ...current, name })) as Song,
  };
  stored.push(entry);
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(stored));
  } catch {
    return null;
  }
  return {
    id: entry.id,
    label: entry.label,
    desc: entry.desc,
    user: true,
    build: () => JSON.parse(JSON.stringify(entry.song)) as Song,
  };
}

export function deleteUserPreset(id: string): void {
  const stored = readStored().filter((e) => e.id !== id);
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(stored));
  } catch {
    /* quota */
  }
}
