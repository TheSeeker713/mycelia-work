//! Startup-phase system initialization (Phase 14-ish, per Jeremy's
//! explicit request for a loading screen ahead of onboarding). This
//! module only handles *launching* local services this app depends on
//! — health checks against their HTTP endpoints already happen from
//! the frontend (voiceClient.isTtsAvailable/isSttAvailable,
//! hardwareCheck.ts), since that's a plain fetch and doesn't need
//! Rust. OpenClaw's own check+start+wait already exists as
//! `openclaw_ensure_daemon` — this only adds the piece that was
//! missing: the Voice-Agent Piper/faster-whisper stack.

use std::process::{Command, Stdio};

/// Absolute, hardcoded — this is a private, personal, single-machine
/// build now (see CLAUDE.md), not something meant to run on another
/// user's filesystem layout.
const VOICE_AGENT_DIR: &str = r"D:\_Dev\AI-Setup\Voice-Agent";

/// Fires `start_all.ps1` and returns immediately — doesn't wait for it
/// to finish. The script itself is idempotent (each service checks
/// whether its port is already listening before starting), so calling
/// this on every app launch is safe even when everything's already up;
/// the frontend polls the actual HTTP health endpoints afterward to
/// know when (or whether) things are actually ready, since "the launch
/// script returned" and "the model finished loading" are different
/// moments.
#[tauri::command]
pub async fn ensure_voice_agent_running() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                "start_all.ps1",
            ])
            .current_dir(VOICE_AGENT_DIR)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_child| ())
            .map_err(|e| format!("couldn't launch start_all.ps1: {e}"))
    })
    .await
    .map_err(|e| format!("background task panicked: {e}"))?
}
