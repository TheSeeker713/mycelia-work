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
use sysinfo::System;

/// Under pressure if *either* crosses its line — the watchdog's job is
/// to catch whichever resource is actually the bottleneck right now,
/// not require both at once.
const CPU_PRESSURE_THRESHOLD_PERCENT: f32 = 85.0;
const MEM_PRESSURE_THRESHOLD_PERCENT: f32 = 90.0;

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

#[tauri::command]
pub fn check_resource_pressure(state: tauri::State<WatchdogState>) -> ResourcePressure {
    let mut sys = state.0.lock().expect("resource watchdog mutex poisoned");
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_usage();
    let total = sys.total_memory();
    let mem_percent = if total == 0 {
        0.0
    } else {
        (sys.used_memory() as f64 / total as f64 * 100.0) as f32
    };

    classify(cpu_percent, mem_percent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_flags_pressure_when_cpu_crosses_the_line() {
        let result = classify(90.0, 10.0);
        assert!(result.under_pressure);
    }

    #[test]
    fn classify_flags_pressure_when_memory_crosses_the_line() {
        let result = classify(10.0, 95.0);
        assert!(result.under_pressure);
    }

    #[test]
    fn classify_reports_no_pressure_when_both_are_comfortable() {
        let result = classify(20.0, 40.0);
        assert!(!result.under_pressure);
    }

    #[test]
    fn classify_is_not_fooled_by_being_right_at_the_line() {
        let just_under = classify(84.9, 89.9);
        assert!(!just_under.under_pressure);
        let just_over = classify(85.0, 89.9);
        assert!(just_over.under_pressure);
    }
}
