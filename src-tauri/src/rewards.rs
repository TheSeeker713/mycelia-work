//! The hidden Rewards/18+ unlock, per Jeremy's spec (2026-08-04).
//!
//! The unlock *sequence itself* (Help menu item, blank-panel click/type
//! challenge, password prompt) lives entirely in the frontend — this
//! module only does the two things that have to live in Rust:
//! 1. Verify the password without the plaintext sitting in a public
//!    diff (`git blame` would show a plaintext string forever; a hash
//!    at least isn't literally readable).
//! 2. Read/list reward asset files from a folder *outside* `src/`
//!    entirely (Tauri's per-user app-data directory), so nothing here
//!    can ever be swept into `dist/` by Vite or committed to the public
//!    repo — the gitignore approach Jeremy first suggested only
//!    protects against `git add`, not against the bundler; assets have
//!    to never be inside the project directory at all to guarantee
//!    that.
//!
//! None of this claims to be a real security boundary — the sequence
//! and the hash are both readable in this public repo's source. It's a
//! deliberate, honest "hidden from casual discovery" gate, not
//! encryption, and Jeremy confirmed that's the intent: the actual
//! sensitive content (the asset files) never ships in the repo or the
//! build at all, so finding the sequence unlocks an empty folder unless
//! you also have local access to this machine's app-data directory.

use base64::Engine;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// SHA-256 of "there is no spoon" — see module docs for why a hash
/// instead of the plaintext, and why that's "enough" here.
const REWARD_PASSWORD_HASH: &str = "c604974367cab8cb1ae0e81eacc7e9f8fae1b149f54a52d85ed324f42c2c8335";

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex_encode(&hasher.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[tauri::command]
pub fn verify_rewards_password(password: String) -> bool {
    sha256_hex(&password) == REWARD_PASSWORD_HASH
}

fn rewards_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("couldn't resolve the app data directory: {e}"))?;
    Ok(base.join("rewards-18"))
}

/// Filenames only — no path separators, no traversal (`..`), nothing
/// that could resolve outside the rewards directory once joined. The
/// filename comes from a Tauri command argument, i.e. from the
/// frontend, so it's treated as untrusted input here even though this
/// app has no remote attacker model.
fn safe_filename(name: &str) -> Result<&str, String> {
    let is_safe = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\');
    if is_safe {
        Ok(name)
    } else {
        Err(format!("'{name}' isn't a valid asset filename"))
    }
}

#[tauri::command]
pub async fn list_reward_assets(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = rewards_dir(&app)?;
        std::fs::create_dir_all(&dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;

        let mut names = Vec::new();
        for entry in std::fs::read_dir(&dir).map_err(|e| format!("couldn't read {}: {e}", dir.display()))? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                if let Some(name) = entry.file_name().to_str() {
                    names.push(name.to_string());
                }
            }
        }
        names.sort();
        Ok(names)
    })
    .await
    .map_err(|e| format!("background task panicked: {e}"))?
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) {
        Some(ext) if ext == "png" => "image/png",
        Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
        Some(ext) if ext == "gif" => "image/gif",
        Some(ext) if ext == "webp" => "image/webp",
        Some(ext) if ext == "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// Returns a `data:` URI (base64) rather than a filesystem path — the
/// frontend never needs to know where on disk this lives, and it keeps
/// the rewards directory out of Tauri's asset-protocol scope entirely.
#[tauri::command]
pub async fn read_reward_asset(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = safe_filename(&filename)?;
        let dir = rewards_dir(&app)?;
        let path = dir.join(name);
        let bytes = std::fs::read(&path).map_err(|e| format!("couldn't read {}: {e}", path.display()))?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        Ok(format!("data:{};base64,{}", mime_for(&path), encoded))
    })
    .await
    .map_err(|e| format!("background task panicked: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_rewards_password_accepts_the_real_password() {
        assert!(verify_rewards_password("there is no spoon".to_string()));
    }

    #[test]
    fn verify_rewards_password_rejects_anything_else() {
        assert!(!verify_rewards_password("wrong".to_string()));
        assert!(!verify_rewards_password("".to_string()));
        assert!(!verify_rewards_password("There Is No Spoon".to_string()));
    }

    #[test]
    fn safe_filename_rejects_traversal_and_separators() {
        assert!(safe_filename("sticker.png").is_ok());
        assert!(safe_filename("..").is_err());
        assert!(safe_filename("../secrets.txt").is_err());
        assert!(safe_filename("a/b.png").is_err());
        assert!(safe_filename("a\\b.png").is_err());
        assert!(safe_filename("").is_err());
    }

    #[test]
    fn mime_for_recognizes_common_image_extensions() {
        assert_eq!(mime_for(Path::new("x.png")), "image/png");
        assert_eq!(mime_for(Path::new("x.JPG")), "image/jpeg");
        assert_eq!(mime_for(Path::new("x.unknown")), "application/octet-stream");
    }
}
