//! Phase 11's resource watchdog — real CPU/memory pressure checks via
//! `sysinfo`, backing the deferred-job queue and the "tell the user
//! plainly instead of degrading invisibly" rule the plan calls for.
//!
//! The `System` handle is kept as Tauri managed state (not recreated
//! per call) for two reasons: `System::new_all()` enumerates every
//! process on the machine, which isn't free to redo on every check,
//! and `sysinfo` itself documents that CPU-usage accuracy needs two
//! refreshes with real time between them — a fresh `System` on every
//! call would report 0% every time.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::System;

/// Under pressure if *either* crosses its line — the watchdog's job is
/// to catch whichever resource is actually the bottleneck right now,
/// not require both at once. Raised from 85/90 (2026-08-08, Jeremy hit
/// false positives during normal multitasking) — these are still a
/// judgment call, not measured against his actual baseline usage.
const CPU_PRESSURE_THRESHOLD_PERCENT: f32 = 90.0;
const MEM_PRESSURE_THRESHOLD_PERCENT: f32 = 95.0;
/// How long to wait before re-sampling once the first reading already
/// looks like pressure — long enough for a momentary spike to pass,
/// short enough not to be felt by whatever's waiting on this check.
const CONFIRM_DELAY: Duration = Duration::from_millis(300);

pub struct WatchdogState(pub Mutex<System>);

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct ResourcePressure {
    pub under_pressure: bool,
    pub cpu_percent: f32,
    pub mem_percent: f32,
}

fn classify(cpu_percent: f32, mem_percent: f32) -> ResourcePressure {
    ResourcePressure {
        under_pressure: cpu_percent >= CPU_PRESSURE_THRESHOLD_PERCENT
            || mem_percent >= MEM_PRESSURE_THRESHOLD_PERCENT,
        cpu_percent,
        mem_percent,
    }
}

fn mem_percent(sys: &System) -> f32 {
    let total = sys.total_memory();
    if total == 0 {
        0.0
    } else {
        (sys.used_memory() as f64 / total as f64 * 100.0) as f32
    }
}

/// A single fresh sample — `sys.refresh_cpu_usage()` needs to be called
/// with real elapsed time since the *previous* refresh to be accurate
/// (see the module doc comment), which the persisted `System` handle
/// already guarantees across separate calls into this module.
fn sample(sys: &mut System) -> ResourcePressure {
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    classify(sys.global_cpu_usage(), mem_percent(sys))
}

#[tauri::command]
pub fn check_resource_pressure(state: tauri::State<WatchdogState>) -> ResourcePressure {
    let mut sys = state.0.lock().expect("resource watchdog mutex poisoned");
    let first = sample(&mut sys);
    if !first.under_pressure {
        return first;
    }
    // The first sample looks like pressure — confirm it isn't just a
    // momentary spike before surfacing anything, rather than taxing
    // every normal (not-under-pressure) call with the extra delay.
    std::thread::sleep(CONFIRM_DELAY);
    sample(&mut sys)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_flags_pressure_when_cpu_crosses_the_line() {
        let result = classify(95.0, 10.0);
        assert!(result.under_pressure);
    }

    #[test]
    fn classify_flags_pressure_when_memory_crosses_the_line() {
        let result = classify(10.0, 96.0);
        assert!(result.under_pressure);
    }

    #[test]
    fn classify_reports_no_pressure_when_both_are_comfortable() {
        let result = classify(20.0, 40.0);
        assert!(!result.under_pressure);
    }

    #[test]
    fn classify_is_not_fooled_by_being_right_at_the_line() {
        let just_under = classify(89.9, 94.9);
        assert!(!just_under.under_pressure);
        let just_over = classify(90.0, 94.9);
        assert!(just_over.under_pressure);
    }
}
