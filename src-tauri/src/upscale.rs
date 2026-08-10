//! Local image upscaling via Real-ESRGAN's ncnn-vulkan build.
//!
//! Deliberately CPU-only. The binary supports `-g <id>` to pick a GPU,
//! and `-g -1` to stay off it entirely — which is what this passes. The
//! voice services and whichever local model Ollama has resident are
//! already sharing this machine's Radeon 680M, and a background upscale
//! stealing the Vulkan device from live narration is a worse trade than
//! the upscale simply taking longer.
//!
//! The binary is not vendored into this repo. It lives alongside the
//! other local AI tooling under `D:\_Dev\AI-Setup`, same as the voice
//! services, and this reports plainly when it isn't there rather than
//! failing with something cryptic.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use serde::Serialize;

/// Where the portable build is expected, following the same
/// one-folder-per-service layout the voice stack already uses.
const TOOL_DIR: &str = r"D:\_Dev\AI-Setup\upscaler\realesrgan-ncnn-vulkan";
const TOOL_EXE: &str = "realesrgan-ncnn-vulkan.exe";

/// A 4x upscale of a large sticker on CPU is genuinely slow. This is a
/// backstop against a wedged process, not a performance target.
const UPSCALE_TIMEOUT: Duration = Duration::from_secs(600);

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

/**
 * Upscales `input_path` and returns the written output path.
 *
 * Both paths are handed to the tool as arguments rather than
 * interpolated into a shell string, so a path containing spaces or
 * quotes is a non-issue.
 */
#[tauri::command]
pub async fn upscale_image(
    input_path: String,
    output_path: String,
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
    if !Path::new(&input_path).is_file() {
        return Err(format!("no such image: {input_path}"));
    }

    // Blocking process work off the async runtime, same pattern the
    // OpenClaw subprocess wrapper uses.
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut child = Command::new(&exe)
            .arg("-i")
            .arg(&input_path)
            .arg("-o")
            .arg(&output_path)
            .arg("-s")
            .arg(scale.to_string())
            // -1 keeps this off the GPU entirely. See the module note.
            .arg("-g")
            .arg("-1")
            .current_dir(TOOL_DIR)
            .spawn()
            .map_err(|e| format!("couldn't start the upscaler: {e}"))?;

        let started = std::time::Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    return if status.success() {
                        Ok(output_path)
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
}
