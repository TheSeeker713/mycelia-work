//! Local image upscaling via Real-ESRGAN's ncnn-vulkan build.
//!
//! ## The CPU-only plan didn't survive contact with the tool
//!
//! This module used to pass `-g -1`, on the theory that it would keep
//! the upscaler off the Radeon 680M that the voice services and Ollama
//! are already sharing. That flag is a waifu2x-ncnn-vulkan convention.
//! Real-ESRGAN rejects it: its argument check is
//! `if (gpuid < 0 || gpuid >= gpu_count)` followed by "invalid gpu
//! device", so every negative id is refused and there is no CPU mode to
//! fall back to. Measured on this machine, `-g -1` failed in 0.1s
//! having done nothing.
//!
//! What the measurement also showed is that the original worry was
//! bigger than the problem. Real reward art (a 117KB webp) upscales in
//! 2.2s at 2x and 4.0s at 4x. That's a short burst, not the sustained
//! GPU occupation that would actually interrupt live narration. So this
//! passes no `-g` at all and lets the tool pick a device, which also
//! means it keeps working on a machine with a different GPU layout.
//!
//! ## Images arrive as bytes, not paths
//!
//! The reward art is bundled through Vite, so at runtime it's a webview
//! URL with no filesystem path behind it. Handing that string to a
//! subprocess could never work. The frontend reads the bytes it already
//! has and sends them here, and this writes the temp file the tool
//! needs.
//!
//! The binary is not vendored into this repo. It lives alongside the
//! other local AI tooling under `D:\_Dev\AI-Setup`, same as the voice
//! services, and this reports plainly when it isn't there rather than
//! failing with something cryptic.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use tauri::Manager;

/// Where the portable build is expected, following the same
/// one-folder-per-service layout the voice stack already uses.
const TOOL_DIR: &str = r"D:\_Dev\AI-Setup\upscaler\realesrgan-ncnn-vulkan";
const TOOL_EXE: &str = "realesrgan-ncnn-vulkan.exe";

/// Measured runs finish in seconds. This is a backstop against a wedged
/// process, not a performance target.
const UPSCALE_TIMEOUT: Duration = Duration::from_secs(600);

/// What the tool will actually read, per its own usage text.
const ALLOWED_EXTS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct UpscalerStatus {
    pub installed: bool,
    /// Where it was looked for, so a "not installed" message can say where to put it.
    pub expected_path: String,
}

fn tool_path() -> PathBuf {
    Path::new(TOOL_DIR).join(TOOL_EXE)
}

#[tauri::command]
pub fn upscaler_status() -> UpscalerStatus {
    let path = tool_path();
    UpscalerStatus {
        installed: path.is_file(),
        expected_path: path.to_string_lossy().to_string(),
    }
}

/// Only these two are offered in the UI, and validating here means a
/// bad value can't reach the command line at all.
fn valid_scale(scale: u32) -> bool {
    scale == 2 || scale == 4
}

/// Keeps a label from the UI from turning into a path.
///
/// Reward labels are things like "Level 10" and "first journal entry",
/// but they reach this from the frontend, and a filename is the one
/// place where an unexpected `..\..` would matter.
fn safe_stem(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "reward".to_string()
    } else {
        trimmed
    }
}

/// Lowercased and checked against what the tool reads, defaulting to
/// png rather than trusting an arbitrary string into a filename.
fn safe_ext(raw: &str) -> String {
    let lower = raw.trim().trim_start_matches('.').to_ascii_lowercase();
    if ALLOWED_EXTS.contains(&lower.as_str()) {
        lower
    } else {
        "png".to_string()
    }
}

/// First free `{stem}-{scale}x.png`, so a second upscale of the same
/// piece doesn't silently replace the first.
fn unique_output(dir: &Path, stem: &str, scale: u32) -> PathBuf {
    let base = format!("{stem}-{scale}x");
    let mut candidate = dir.join(format!("{base}.png"));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{base}-{n}.png"));
        n += 1;
    }
    candidate
}

/**
 * Upscales the supplied image bytes and returns the written output path.
 *
 * Paths are handed to the tool as arguments rather than interpolated
 * into a shell string, so a path containing spaces is a non-issue.
 */
#[tauri::command]
pub async fn upscale_image(
    app: tauri::AppHandle,
    image_base64: String,
    file_stem: String,
    source_ext: String,
    scale: u32,
) -> Result<String, String> {
    if !valid_scale(scale) {
        return Err(format!("unsupported scale {scale} (expected 2 or 4)"));
    }
    let exe = tool_path();
    if !exe.is_file() {
        return Err(format!(
            "Real-ESRGAN isn't installed yet. Expected it at {}",
            exe.to_string_lossy()
        ));
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image_base64.as_bytes())
        .map_err(|e| format!("couldn't read that image: {e}"))?;
    if bytes.is_empty() {
        return Err("that image is empty".to_string());
    }

    let stem = safe_stem(&file_stem);
    let ext = safe_ext(&source_ext);

    // Upscales land somewhere the person can actually find them.
    let out_dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("Mycelia Time");
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("couldn't create {out_dir:?}: {e}"))?;

    let in_path = std::env::temp_dir().join(format!(
        "mycelia-upscale-{}.{ext}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    std::fs::write(&in_path, &bytes).map_err(|e| format!("couldn't stage the image: {e}"))?;

    let out_path = unique_output(&out_dir, &stem, scale);

    // Blocking process work off the async runtime, same pattern the
    // OpenClaw subprocess wrapper uses.
    let staged = in_path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let outcome = (|| {
            let mut child = Command::new(&exe)
                .arg("-i")
                .arg(&staged)
                .arg("-o")
                .arg(&out_path)
                .arg("-s")
                .arg(scale.to_string())
                // No -g. The tool has no CPU mode, and auto-select keeps
                // this working on whatever GPU is actually present.
                .current_dir(TOOL_DIR)
                .spawn()
                .map_err(|e| format!("couldn't start the upscaler: {e}"))?;

            let started = std::time::Instant::now();
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        return if status.success() {
                            Ok(out_path.to_string_lossy().to_string())
                        } else {
                            Err(format!("upscaler exited with {status}"))
                        };
                    }
                    Ok(None) => {
                        if started.elapsed() > UPSCALE_TIMEOUT {
                            let _ = child.kill();
                            return Err("upscale timed out".to_string());
                        }
                        std::thread::sleep(Duration::from_millis(200));
                    }
                    Err(e) => return Err(format!("lost track of the upscaler: {e}")),
                }
            }
        })();
        // The staged copy is disposable either way.
        let _ = std::fs::remove_file(&staged);
        outcome
    })
    .await
    .map_err(|e| format!("upscale task failed: {e}"))?;

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_2x_and_4x_are_accepted() {
        assert!(valid_scale(2));
        assert!(valid_scale(4));
        assert!(!valid_scale(3));
        assert!(!valid_scale(0));
        assert!(!valid_scale(8));
    }

    #[test]
    fn status_reports_where_it_looked_even_when_missing() {
        let status = upscaler_status();
        assert!(status.expected_path.contains("realesrgan-ncnn-vulkan"));
    }

    #[test]
    fn a_missing_binary_is_reported_as_not_installed_rather_than_assumed_present() {
        // Whatever the machine's actual state, `installed` must agree
        // with the filesystem rather than being hardcoded either way.
        let status = upscaler_status();
        assert_eq!(status.installed, tool_path().is_file());
    }

    #[test]
    fn a_label_cannot_climb_out_of_the_output_folder() {
        let stem = safe_stem(r"..\..\windows\system32\evil");
        assert!(!stem.contains('.'));
        assert!(!stem.contains('\\'));
        assert!(!stem.contains('/'));
    }

    #[test]
    fn ordinary_labels_stay_readable() {
        assert_eq!(safe_stem("Level 10"), "Level-10");
        assert_eq!(safe_stem("first journal entry"), "first-journal-entry");
    }

    #[test]
    fn an_empty_label_still_produces_a_filename() {
        assert_eq!(safe_stem("///"), "reward");
        assert_eq!(safe_stem(""), "reward");
    }

    #[test]
    fn only_extensions_the_tool_reads_are_kept() {
        assert_eq!(safe_ext("webp"), "webp");
        assert_eq!(safe_ext(".PNG"), "png");
        assert_eq!(safe_ext("jpeg"), "jpeg");
        // Anything else becomes png rather than reaching a filename.
        assert_eq!(safe_ext("exe"), "png");
        assert_eq!(safe_ext(""), "png");
    }

    #[test]
    fn a_second_upscale_does_not_overwrite_the_first() {
        let dir = std::env::temp_dir().join(format!(
            "mycelia-upscale-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let first = unique_output(&dir, "Level-10", 2);
        assert!(first.to_string_lossy().ends_with("Level-10-2x.png"));
        std::fs::write(&first, b"x").unwrap();

        let second = unique_output(&dir, "Level-10", 2);
        assert_ne!(first, second);
        assert!(second.to_string_lossy().ends_with("Level-10-2x-2.png"));

        std::fs::remove_dir_all(&dir).ok();
    }
}
