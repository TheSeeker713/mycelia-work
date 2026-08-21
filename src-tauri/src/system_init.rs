//! Startup-phase system initialization (Phase 14-ish, per Jeremy's
//! explicit request for a loading screen ahead of onboarding). This
//! module only handles *launching* local services this app depends on
//! — health checks against their HTTP endpoints already happen from
//! the frontend (voiceClient.isTtsAvailable/isSttAvailable,
//! hardwareCheck.ts), since that's a plain fetch and doesn't need
//! Rust. OpenClaw's own check+start+wait already exists as
//! `openclaw_ensure_daemon` — this only adds the piece that was
//! missing: the Voice-Agent Piper/faster-whisper stack.

use std::net::{SocketAddr, TcpStream};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Absolute, hardcoded — this is a private, personal, single-machine
/// build now (see CLAUDE.md), not something meant to run on another
/// user's filesystem layout.
const VOICE_AGENT_DIR: &str = r"D:\_Dev\AI-Setup\Voice-Agent";
const OLLAMA_PORT: u16 = 11434;
const OLLAMA_PROBE_TIMEOUT: Duration = Duration::from_millis(400);
const OLLAMA_START_WAIT: Duration = Duration::from_secs(10);

fn probe_tcp(port: u16, timeout: Duration) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpStream::connect_timeout(&addr, timeout).is_ok()
}

/// Probe 11434; if down, spawn `ollama serve` from PATH and poll.
/// Fail-soft: spawn or timeout errors return Ok(false), never panic.
#[tauri::command]
pub async fn ensure_ollama_running() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        if probe_tcp(OLLAMA_PORT, OLLAMA_PROBE_TIMEOUT) {
            return Ok(true);
        }
        match Command::new("ollama")
            .arg("serve")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(_child) => {}
            Err(_) => return Ok(false),
        }
        let start = Instant::now();
        while start.elapsed() < OLLAMA_START_WAIT {
            if probe_tcp(OLLAMA_PORT, OLLAMA_PROBE_TIMEOUT) {
                return Ok(true);
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        Ok(false)
    })
    .await
    .map_err(|e| format!("background task panicked: {e}"))?
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_tcp_true_when_something_is_actually_listening() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind an ephemeral port");
        let port = listener.local_addr().unwrap().port();
        assert!(probe_tcp(port, Duration::from_millis(200)));
    }

    #[test]
    fn probe_tcp_false_when_nothing_is_listening() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind an ephemeral port");
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(!probe_tcp(port, Duration::from_millis(200)));
    }
}

