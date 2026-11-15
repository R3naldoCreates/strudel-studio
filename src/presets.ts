// ─── Song presets (ready-made multi-track starting points) ───────────────────
import type { Song, TrackKind } from './types';
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

export const PRESETS: Preset[] = [
  {
    id: 'house', label: 'House Four', desc: '128bpm · four-on-the-floor + offbeat bass',
    build: () => song('House Four', 124, [
      makeTrack('drums', { name: 'Drums', drumPattern: 'bd*4, ~ hh ~ hh, ~ ~ sd ~', gain: 0.9 }),
      makeTrack('bass', { name: 'Bass', notePattern: '[c2*2 c2*2] ~ [eb2*2 eb2*2] ~', wave: 'square', fx: [makeFx('lpf', 800)] }),
      makeTrack('lead', { name: 'Stab', notePattern: '<c4 eb4 g4>*2 ~ <ab3 bb3 g3>*2 ~', wave: 'sawtooth', gain: 0.35, fx: [makeFx('lpf', 2400), makeFx('room', 1.5)] }),
      makeTrack('pad', { name: 'Pad', notePattern: '<c3 g3>/2 <bb2 f3>/2', wave: 'triangle', gain: 0.4, fx: [makeFx('room', 4)] }),
    ]),
  },
  {
    id: 'breakcore', label: 'Breakcore Chop', desc: '160bpm · chopped breaks + grit',
    build: () => song('Breakcore Chop', 160, [
      makeTrack('drums', { name: 'Break', drumPattern: 'bd*2 [~ bd], sd(3,8), hh*16', gain: 0.85, fx: [makeFx('crush', 8)] }),
      makeTrack('bass', { name: 'Rumble', notePattern: 'c2 ~ ~ c2 ~ c2 ~ ~', wave: 'sawtooth', fx: [makeFx('lpf', 500)], automation: { target: 'gain', wave: 'saw', rate: 4, depth: 0.4 } }),
      makeTrack('lead', { name: 'Siren', notePattern: '<c5 eb5>*4', wave: 'square', gain: 0.22, automation: { target: 'lpf', wave: 'sine', rate: 4, depth: 0.8 }, fx: [makeFx('lpf', 3000)] }),
    ]),
  },
  {
    id: 'neon', label: 'Neon Bass', desc: '112bpm · dub-techno weight',
    build: () => song('Neon Bass', 112, [
      makeTrack('drums', { name: 'Dust', drumPattern: 'bd ~ ~ bd, ~ sd ~ ~, hh*4', gain: 0.95, sampleIndex: 1 }),
      makeTrack('bass', { name: 'Sub', notePattern: '<c2 ~ ab1 ~> <f1 ~ g2 ~>', wave: 'sine', gain: 0.8 }),
      makeTrack('keys', { name: 'Bells', notePattern: 'c5 ~ eb5 ~ g4 ~ b4 ~', wave: 'triangle', gain: 0.42, fx: [makeFx('delay', 0.35), makeFx('delayfb', 0.55), makeFx('room', 2)] }),
      makeTrack('pad', { name: 'Haze', notePattern: '<ab2 bb2>/2', wave: 'sawtooth', gain: 0.3, fx: [makeFx('lpf', 1100), makeFx('room', 5)] }),
    ]),
  },
  {
    id: 'ambient', label: 'Ambient Drift', desc: '72bpm · slow evolving drone',
    build: () => song('Ambient Drift', 72, [
      makeTrack('pad', { name: 'Drift', notePattern: '<c3 eb3 g3 bb3>/4 <ab2 c3 f3 g3>/4', wave: 'sawtooth', gain: 0.4, fx: [makeFx('lpf', 1400), makeFx('room', 7)], automation: { target: 'lpf', wave: 'perlin', rate: 8, depth: 0.7 } }),
      makeTrack('keys', { name: 'Glass', notePattern: 'g5 ~ ~ eb5 ~ ~ c6 ~', wave: 'sine', gain: 0.35, fx: [makeFx('delay', 0.4), makeFx('delayfb', 0.6)] }),
      makeTrack('keys', { name: 'Deep Sub', notePattern: 'c2 ~ ~ ~ ~ ~ ~ ~', wave: 'sine', gain: 0.5, octave: 0 }),
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
