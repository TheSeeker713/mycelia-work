//! Foreground-app sampling for the local activity log (Phase 3).
//! Metadata only: process name, window title, idle flag. No screenshots,
//! keylogging, or clipboard. Browser URL is omitted unless a later
//! pass can read it without extra permissions.

use serde::Serialize;

#[derive(Serialize)]
pub struct ActivitySample {
    pub app: String,
    pub title: String,
    pub url: Option<String>,
    pub idle: bool,
    pub idle_seconds: u64,
}

#[cfg(windows)]
mod win {
    use std::ffi::OsString;
    use std::os::raw::c_void;
    use std::os::windows::ffi::OsStringExt;

    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> *mut c_void;
        fn GetWindowTextW(hwnd: *mut c_void, lp_string: *mut u16, n_max_count: i32) -> i32;
        fn GetWindowThreadProcessId(hwnd: *mut c_void, lpdw_process_id: *mut u32) -> u32;
    }

    pub fn foreground() -> (String, String) {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return (String::new(), String::new());
            }
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            let title = if len > 0 {
                OsString::from_wide(&buf[..len as usize])
                    .to_string_lossy()
                    .into_owned()
            } else {
                String::new()
            };
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            let app = process_name(pid);
            (app, title)
        }
    }

    fn process_name(pid: u32) -> String {
        if pid == 0 {
            return String::new();
        }
        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        sys.process(sysinfo::Pid::from_u32(pid))
            .map(|p| p.name().to_string_lossy().into_owned())
            .unwrap_or_default()
    }
}

#[cfg(not(windows))]
mod win {
    pub fn foreground() -> (String, String) {
        (String::new(), String::new())
    }
}

#[tauri::command]
pub fn sample_foreground_activity() -> Result<ActivitySample, String> {
    let idle_seconds = user_idle::UserIdle::get_time()
        .map(|idle| idle.as_seconds())
        .unwrap_or(0);
    let (app, title) = win::foreground();
    Ok(ActivitySample {
        app,
        title,
        url: None,
        idle: idle_seconds >= 60,
        idle_seconds,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_serializes_with_no_url() {
        let sample = ActivitySample {
            app: "Code.exe".into(),
            title: "mycelia-work".into(),
            url: None,
            idle: false,
            idle_seconds: 3,
        };
        let json = serde_json::to_value(&sample).unwrap();
        assert_eq!(json["url"], serde_json::Value::Null);
        assert_eq!(json["app"], "Code.exe");
    }
}
