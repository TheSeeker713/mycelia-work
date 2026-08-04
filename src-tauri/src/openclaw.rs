//! Subprocess wrapper around the `openclaw` CLI (the local OpenClaw
//! install already running as a Windows Scheduled Task on this
//! machine). The app never holds its own model keys — every AI call
//! shells out to `openclaw agent` and lets OpenClaw's own routing pick
//! the model.
//!
//! Daemon lifecycle rule (from the project plan): the Gateway is shared
//! with other tools on this machine, so this app must never stop it out
//! from under something else. Before a call, check whether it's already
//! running; if so, leave it alone. If *this* app had to start it, only
//! this app is allowed to stop it again afterward. `ensure_daemon` /
//! `release_daemon` are split out (rather than folded into a single
//! call) so a multi-turn conversation can wake the Gateway once, make
//! several calls, then release it — waking and sleeping it once per
//! turn would add several seconds of latency to every reply.

use serde::Serialize;
use serde_json::Value;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct OpenClawAgentResult {
    pub text: String,
    pub model: String,
}

/// A hard backstop the CLI's own `--timeout` flag can't be trusted to
/// enforce on its own (Phase 11) — if the CLI hangs before it even gets
/// to honoring its own timeout, the old `.output()`-based call blocked
/// this Rust process forever with no way to cancel it. `daemon status/
/// start/stop` calls are short and don't take a `--timeout` arg of
/// their own, so they get one flat ceiling here.
const DAEMON_COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

/// Runs `openclaw <args>` via `cmd /C` — required on Windows since
/// npm-installed CLIs ship as `.cmd` shims, which `CreateProcess` can't
/// launch directly without going through the command interpreter.
///
/// Unlike `Command::output()` (which blocks unconditionally until the
/// child exits), this polls `try_wait()` against a real deadline and
/// kills the child if it's exceeded — a genuinely cancellable
/// subprocess, not just a timeout argument handed to the child and
/// hoped for. Stdout/stderr are drained on their own threads while
/// polling, same as `output()` does internally, so a chatty child can't
/// deadlock by filling its pipe buffer while nothing's reading it.
fn run_cli(args: &[&str], hard_timeout: Duration) -> Result<Value, String> {
    let mut child = Command::new("cmd")
        .arg("/C")
        .arg("openclaw")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to launch openclaw: {e}"))?;

    let mut stdout_pipe = child.stdout.take().expect("stdout was piped");
    let mut stderr_pipe = child.stderr.take().expect("stderr was piped");
    let (stdout_tx, stdout_rx) = mpsc::channel();
    let (stderr_tx, stderr_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout_pipe.read_to_string(&mut buf);
        let _ = stdout_tx.send(buf);
    });
    std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr_pipe.read_to_string(&mut buf);
        let _ = stderr_tx.send(buf);
    });

    let start = Instant::now();
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) => {
                if start.elapsed() >= hard_timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "openclaw {} didn't finish within {hard_timeout:?} and was killed",
                        args.join(" "),
                    ));
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(format!("failed to poll the openclaw process: {e}")),
        }
    };

    let stdout = stdout_rx.recv().unwrap_or_default();
    let stderr = stderr_rx.recv().unwrap_or_default();

    if !success {
        let detail = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
        return Err(format!("openclaw {} failed: {detail}", args.join(" ")));
    }

    serde_json::from_str(&stdout)
        .map_err(|e| format!("couldn't parse openclaw output as JSON: {e}\n{stdout}"))
}

fn is_daemon_running(status_json: &Value) -> bool {
    status_json
        .pointer("/service/runtime/status")
        .and_then(|v| v.as_str())
        == Some("running")
}

fn daemon_running() -> Result<bool, String> {
    let json = run_cli(
        &["daemon", "status", "--json", "--no-probe", "--timeout", "5000"],
        DAEMON_COMMAND_TIMEOUT,
    )?;
    Ok(is_daemon_running(&json))
}

fn daemon_start() -> Result<(), String> {
    run_cli(&["daemon", "start", "--json"], DAEMON_COMMAND_TIMEOUT).map(|_| ())
}

fn daemon_stop() -> Result<(), String> {
    run_cli(&["daemon", "stop", "--json"], DAEMON_COMMAND_TIMEOUT).map(|_| ())
}

fn wait_for_daemon_running(max_wait: Duration) -> Result<(), String> {
    let start = Instant::now();
    loop {
        if daemon_running().unwrap_or(false) {
            return Ok(());
        }
        if start.elapsed() >= max_wait {
            return Err("timed out waiting for the OpenClaw Gateway to come up".into());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

/// Pulls the reply text and model id out of `openclaw agent --json`'s
/// (much larger) response envelope. Kept standalone so the parsing
/// logic is unit-testable against fixture JSON without a real
/// subprocess call.
fn extract_agent_result(json: &Value) -> Result<OpenClawAgentResult, String> {
    let text = json
        .pointer("/result/payloads/0/text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "openclaw response had no payload text".to_string())?
        .to_string();
    let provider = json
        .pointer("/result/meta/agentMeta/provider")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let model = json
        .pointer("/result/meta/agentMeta/model")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    Ok(OpenClawAgentResult {
        text,
        model: format!("{provider}/{model}"),
    })
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), nanos)
}

/// One agent turn. Does *not* manage the daemon's lifecycle — callers
/// making several calls in a row (a multi-turn conversation) should
/// wrap the whole exchange in `ensure_daemon`/`release_daemon` once,
/// not per turn.
fn call_agent(session_key: &str, message: &str, timeout_secs: u64) -> Result<OpenClawAgentResult, String> {
    let temp_path: PathBuf = std::env::temp_dir().join(format!("mycelia-openclaw-{}.md", unique_suffix()));
    std::fs::write(&temp_path, message)
        .map_err(|e| format!("couldn't write agent message file: {e}"))?;

    let path_str = temp_path.to_string_lossy().to_string();
    let timeout_arg = timeout_secs.to_string();
    // The CLI's own --timeout should fire first under normal conditions;
    // this Rust-level deadline is the backstop for when it doesn't (a
    // hang before the CLI ever reaches its own timeout logic) — a real
    // grace window, not a race against the CLI's own clock.
    let hard_timeout = Duration::from_secs(timeout_secs) + Duration::from_secs(15);
    let json_result = run_cli(
        &[
            "agent",
            "--agent",
            "main",
            "--session-key",
            session_key,
            "--message-file",
            &path_str,
            "--json",
            "--timeout",
            &timeout_arg,
        ],
        hard_timeout,
    );

    let _ = std::fs::remove_file(&temp_path);

    extract_agent_result(&json_result?)
}

/// Tauri's `#[tauri::command]` macro dispatches a plain (non-async) `fn`
/// by calling it directly, synchronously, wherever the IPC message is
/// handled — no thread-pool offload of its own. Every command in this
/// file does blocking I/O (subprocess spawn/wait, `thread::sleep`
/// polling for the Gateway to come up), so without `spawn_blocking`
/// each one freezes the whole window for its full duration. Confirmed
/// by reading tauri-macros' `body_blocking` codegen after Jeremy hit
/// exactly this — the app went fully unresponsive right after a
/// clock-out kicked off journal generation.
fn run_blocking<F, T>(func: F) -> impl std::future::Future<Output = Result<T, String>>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    async move {
        tauri::async_runtime::spawn_blocking(func)
            .await
            .map_err(|e| format!("background task panicked: {e}"))?
    }
}

#[tauri::command]
pub async fn openclaw_ensure_daemon() -> Result<bool, String> {
    run_blocking(|| {
        let was_running = daemon_running()?;
        if !was_running {
            daemon_start()?;
            wait_for_daemon_running(Duration::from_secs(15))?;
        }
        Ok(was_running)
    })
    .await
}

#[tauri::command]
pub async fn openclaw_release_daemon(was_already_running: bool) -> Result<(), String> {
    run_blocking(move || {
        if was_already_running {
            return Ok(());
        }
        daemon_stop()
    })
    .await
}

#[tauri::command]
pub async fn openclaw_call_agent(
    session_key: String,
    message: String,
    timeout_secs: Option<u64>,
) -> Result<OpenClawAgentResult, String> {
    run_blocking(move || call_agent(&session_key, &message, timeout_secs.unwrap_or(120))).await
}

/// Single-shot convenience for one-off calls (the session journal, the
/// weekly roll-up): wakes the Gateway if it's down, makes one call.
///
/// Deliberately does *not* stop the Gateway again afterward — that used
/// to happen here, and it was the single biggest cost in a burst of
/// clock-outs (each one paying the ~4-9s daemon-start cost again,
/// because the previous call had just shut it back down). The
/// architecture doc's own reasoning already covers why this is safe to
/// leave running: "an idle Gateway process and Ollama's own idle-unload
/// behavior already mean 'no call in flight' costs ~nothing." Multi-turn
/// callers (the adaptive check-in) still explicitly ensure/release
/// around their whole exchange via the two commands above — this only
/// changes the single-shot path.
#[tauri::command]
pub async fn run_openclaw_agent(
    session_key: String,
    message: String,
    timeout_secs: Option<u64>,
) -> Result<OpenClawAgentResult, String> {
    openclaw_ensure_daemon().await?;
    openclaw_call_agent(session_key, message, timeout_secs).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_daemon_running_reads_service_runtime_status() {
        let running = serde_json::json!({ "service": { "runtime": { "status": "running" } } });
        let stopped = serde_json::json!({ "service": { "runtime": { "status": "stopped" } } });
        let missing = serde_json::json!({ "service": {} });
        assert!(is_daemon_running(&running));
        assert!(!is_daemon_running(&stopped));
        assert!(!is_daemon_running(&missing));
    }

    /// Fixture captured from a real `openclaw agent --json` smoke test
    /// run during Phase 6 planning.
    fn agent_response_fixture() -> Value {
        serde_json::json!({
            "runId": "e88d2563-a95f-4ee5-892d-5460354f82ec",
            "status": "ok",
            "result": {
                "payloads": [
                    { "text": "pong", "mediaUrl": null }
                ],
                "meta": {
                    "agentMeta": {
                        "provider": "xai",
                        "model": "grok-4.5"
                    }
                }
            }
        })
    }

    #[test]
    fn extract_agent_result_pulls_text_and_provider_model() {
        let result = extract_agent_result(&agent_response_fixture()).unwrap();
        assert_eq!(result.text, "pong");
        assert_eq!(result.model, "xai/grok-4.5");
    }

    #[test]
    fn extract_agent_result_fails_closed_on_missing_payload() {
        let malformed = serde_json::json!({ "result": { "payloads": [] } });
        assert!(extract_agent_result(&malformed).is_err());
    }

    #[test]
    fn extract_agent_result_falls_back_to_unknown_model_fields() {
        let json = serde_json::json!({
            "result": {
                "payloads": [{ "text": "hi" }],
                "meta": { "agentMeta": {} }
            }
        });
        let result = extract_agent_result(&json).unwrap();
        assert_eq!(result.text, "hi");
        assert_eq!(result.model, "unknown/unknown");
    }
}
