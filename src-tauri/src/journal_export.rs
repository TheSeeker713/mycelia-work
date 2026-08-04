//! Writes generated work-journal entries to `docs/workjournal/` in this
//! project's own repo checkout, per CLAUDE.md — Jeremy's real generated
//! journals become committed history alongside the devlog while he
//! dogfoods the app from a dev build. `CARGO_MANIFEST_DIR` points at
//! `src-tauri` at compile time, so its parent is the project root this
//! is built from.

use std::path::PathBuf;

fn workjournal_dir() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest_dir
        .parent()
        .ok_or_else(|| "couldn't resolve the project root from CARGO_MANIFEST_DIR".to_string())?;
    Ok(project_root.join("docs").join("workjournal"))
}

/// `filename` is caller-built (already slugified, timestamped) — this
/// just resolves the target directory and writes it, creating the
/// directory if it doesn't exist yet. Returns the full path written.
#[tauri::command]
pub fn export_workjournal_file(filename: String, content: String) -> Result<String, String> {
    let dir = workjournal_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;

    let path = dir.join(&filename);
    std::fs::write(&path, content).map_err(|e| format!("couldn't write {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().to_string())
}
