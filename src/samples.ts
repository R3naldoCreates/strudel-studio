// ─── Sample libraries ────────────────────────────────────────────────────────
// Bundled starter kit + a user-picked folder scanned by the Rust side.
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { store } from './state';
import { registerSampleJson } from './engine';

export interface SoundEntry {
  /** registered sound name, e.g. "bd" */
  name: string;
  /** url usable for <audio>/fetch (bundled = ./…, custom = asset protocol) */
  url: string;
  /** how many variations n = 0..nVar-1 */
  variations: number;
}

export interface SampleBank {
  name: string;
  sounds: SoundEntry[];
  source: 'bundled' | 'folder';
}

const BUNDLED_BANKS: { name: string; json: string; base: string }[] = [
  { name: 'uzu-drumkit', json: './samples/uzu-drumkit/strudel.json', base: './samples/uzu-drumkit/' },
];

export async function enumerateBundledBanks(): Promise<SampleBank[]> {
  const banks: SampleBank[] = [];
  for (const b of BUNDLED_BANKS) {
    try {
      const res = await fetch(b.json);
      if (!res.ok) continue;
      const map = (await res.json()) as Record<string, string[] | string>;
      const sounds: SoundEntry[] = [];
      for (const [name, value] of Object.entries(map)) {
        if (name === '_base') continue;
        const files = Array.isArray(value) ? value : [value];
        sounds.push({ name, url: b.base + files[0], variations: files.length });
      }
      banks.push({ name: b.name, sounds, source: 'bundled' });
    } catch (err) {
      console.warn('[samples] bundled bank failed:', err);
    }
  }
  return banks;
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface FolderScanResult {
  banks: { name: string; sounds: { name: string; path: string }[] }[];
  totalFiles: number;
}

/** Scan a folder on disk → register every file as a sound → return bank metadata. */
export async function registerFolder(path: string): Promise<SampleBank[]> {
  if (!isTauriRuntime()) {
    throw new Error('Folder scanning is only available in the desktop app');
  }
  const scan = await invoke<FolderScanResult>('scan_samples', { path });
  // Build a strudel.json blob: every sound individually, no base.
  const map: Record<string, string[]> = {};
  const banks: SampleBank[] = [];
  for (const bank of scan.banks) {
    const sounds: SoundEntry[] = [];
    for (const s of bank.sounds) {
      const url = convertFileSrc(s.path);
      map[s.name] = [url];
      sounds.push({ name: s.name, url, variations: 1 });
    }
    banks.push({ name: bank.name, sounds, source: 'folder' });
  }
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await registerSampleJson(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  return banks;
}

/** Absolute path of a sensible default folder the app creates on first run. */
export async function ensureDefaultSampleDir(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<string>('ensure_samples_dir');
  } catch {
    return null;
  }
}

export function soundList(banks: SampleBank[]): SoundEntry[] {
  const seen = new Set<string>();
  const out: SoundEntry[] = [];
  for (const bank of banks) {
    for (const s of bank.sounds) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
