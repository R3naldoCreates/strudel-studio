//! Strudel Studio — Rust backend.
//! Everything the frontend cannot (and should not) do from the webview:
//! scanning sample folders, reading/writing song files, project directories.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

const AUDIO_EXTENSIONS: [&str; 9] = [
    "wav", "mp3", "ogg", "flac", "aif", "aiff", "m4a", "opus", "webm",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SoundInfo {
    /// registered sound name, e.g. "bd" for bd.wav
    name: String,
    /// absolute path on disk (frontend converts via convertFileSrc)
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BankInfo {
    name: String,
    sounds: Vec<SoundInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult {
    banks: Vec<BankInfo>,
    total_files: usize,
    /// absolute path that was scanned (for display)
    root: String,
}

/// Scan `path` recursively for audio files.
/// Layout convention: files in the root land in one bank named after the
/// folder; each first-level subdirectory becomes its own bank.
#[tauri::command]
fn scan_samples(path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    // bank name → sound entries (BTreeMap for deterministic order)
    let mut banks: BTreeMap<String, Vec<SoundInfo>> = BTreeMap::new();
    let mut total = 0usize;

    let mut stack: Vec<PathBuf> = vec![root.clone()];
    let mut depth_guard = 0usize;

    while let Some(dir) = stack.pop() {
        depth_guard += 1;
        if depth_guard > 100_000 {
            return Err("folder too large (>100k entries)".into());
        }
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue, // unreadable subfolder — skip, don't fail the scan
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !AUDIO_EXTENSIONS.contains(&ext.as_str()) {
                continue;
            }
            let Some(stem) = path.file_stem().map(|s| s.to_string_lossy().to_string()) else {
                continue;
            };
            // bank = first path segment below the scanned root ("root" for root files)
            let bank = bank_for(&root, &path);
            let name = sanitize_sound_name(&stem);
            let slot = banks.entry(bank).or_default();
            let entry_name = dedupe(slot, name);
            slot.push(SoundInfo {
                name: entry_name,
                path: path.to_string_lossy().to_string(),
            });
            total += 1;
        }
    }

    // sort sounds inside each bank for a stable picker
    let banks = banks
        .into_iter()
        .map(|(name, mut sounds)| {
            sounds.sort_by(|a, b| a.name.cmp(&b.name));
            BankInfo { name, sounds }
        })
        .collect();

    Ok(ScanResult { banks, total_files: total, root: path })
}

fn bank_for(root: &Path, file: &Path) -> String {
    if let Ok(rel) = file.strip_prefix(root) {
        let mut comps = rel.components();
        if let Some(first) = comps.next() {
            if comps.next().is_some() {
                return sanitize_bank_name(&first.as_os_str().to_string_lossy());
            }
        }
    }
    sanitize_bank_name(
        &root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "samples".to_string()),
    )
}

fn sanitize_bank_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if cleaned.is_empty() { "bank".into() } else { cleaned }
}

fn sanitize_sound_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if cleaned.is_empty() { "sound".into() } else { cleaned.to_lowercase() }
}

/// Ensure sampled name is unique inside a bank by appending _2, _3…
fn dedupe(existing: &mut Vec<SoundInfo>, name: String) -> String {
    if !existing.iter().any(|s| s.name == name) {
        return name;
    }
    for n in 2..1000 {
        let candidate = format!("{name}_{n}");
        if !existing.iter().any(|s| s.name == candidate) {
            return candidate;
        }
    }
    format!("{name}_dup")
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir {parent:?}: {e}"))?;
    }
    fs::write(&path, contents).map_err(|e| format!("write {path}: {e}"))
}

/// Create (if missing) and return the app's own sample drop folder.
#[tauri::command]
fn ensure_samples_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("resolve config dir: {e}"))?
        .join("samples");
    fs::create_dir_all(&dir).map_err(|e| format!("create {dir:?}: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_samples,
            read_text_file,
            write_text_file,
            ensure_samples_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Strudel Studio");
}
