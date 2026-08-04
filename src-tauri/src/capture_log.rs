//! Local-first logging for every capture-agent interaction, per
//! docs/reference/capture-agent-guide.md's "Logging" section — declines
//! and clarify exchanges get logged too, not just successful routes.
//! One append-only JSON-lines file per calendar day, in the app's
//! per-user data directory (same `app_data_dir()` pattern as
//! rewards.rs) — never transmitted anywhere, so there's nothing to
//! secure beyond normal filesystem permissions. Configurable in
//! Settings; the frontend is what actually gates whether this gets
//! called at all.

use std::path::PathBuf;

fn capture_log_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("couldn't resolve the app data directory: {e}"))?;
    Ok(base.join("capture-log"))
}

/// `entry_json` is a single already-serialized JSON object from the
/// frontend (it owns the shape) — this just appends it as one line to
/// today's file, creating the directory and file as needed.
#[tauri::command]
pub async fn append_capture_log(app: tauri::AppHandle, date: String, entry_json: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;

        let name = safe_filename(&date)?;
        let dir = capture_log_dir(&app)?;
        std::fs::create_dir_all(&dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;

        let path = dir.join(format!("{name}.jsonl"));
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("couldn't open {}: {e}", path.display()))?;

        writeln!(file, "{entry_json}").map_err(|e| format!("couldn't write to {}: {e}", path.display()))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("background task panicked: {e}"))?
}

/// Same traversal guard as rewards.rs's `safe_filename` — `date` comes
/// from the frontend, treated as untrusted even though it's normally
/// just a YYYY-MM-DD string this app generated itself.
fn safe_filename(name: &str) -> Result<&str, String> {
    let is_safe = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\');
    if is_safe {
        Ok(name)
    } else {
        Err(format!("'{name}' isn't a valid log file name"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_filename_rejects_traversal_and_separators() {
        assert!(safe_filename("2026-08-04").is_ok());
        assert!(safe_filename("..").is_err());
        assert!(safe_filename("../secrets").is_err());
        assert!(safe_filename("a/b").is_err());
        assert!(safe_filename("a\\b").is_err());
        assert!(safe_filename("").is_err());
    }
}
