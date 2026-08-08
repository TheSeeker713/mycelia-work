use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;

mod capture_log;
mod journal_export;
mod openclaw;
mod resource_watchdog;
mod system_init;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// System-wide idle time (via GetLastInputInfo on Windows), not scoped
/// to this app's own window — working in another app still counts as
/// active, which the original DOM-events-only idle watcher draft got
/// wrong.
#[tauri::command]
fn system_idle_seconds() -> Result<u64, String> {
    user_idle::UserIdle::get_time()
        .map(|idle| idle.as_seconds())
        .map_err(|e| e.to_string())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ctrl+Shift+Q is the emergency exit's system-wide shortcut — it has
    // to work even when the window is hidden to the tray, not just
    // while it's focused, which is why this is a real OS-level global
    // shortcut rather than an in-window keydown listener.
    let global_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                app.exit(0);
            }
        })
        .with_shortcut("ctrl+shift+q")
        .expect("ctrl+shift+q is a valid shortcut string")
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(global_shortcut_plugin)
        .manage(resource_watchdog::WatchdogState(std::sync::Mutex::new(
            sysinfo::System::new(),
        )))
        .manage(openclaw::CallCancelState(std::sync::Arc::new(
            std::sync::atomic::AtomicBool::new(false),
        )))
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Show Mycelia Time", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        // The pocket book lives in the tray, not the taskbar - any close
        // attempt (taskbar, Alt+F4) hides the window instead of quitting.
        // The emergency-exit control uses destroy(), which skips this
        // event entirely, for the one genuine full-shutdown path.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            system_idle_seconds,
            openclaw::openclaw_ensure_daemon,
            openclaw::openclaw_release_daemon,
            openclaw::openclaw_call_agent,
            openclaw::run_openclaw_agent,
            openclaw::cancel_active_agent_call,
            journal_export::export_workjournal_file,
            capture_log::append_capture_log,
            resource_watchdog::check_resource_pressure,
            system_init::ensure_voice_agent_running,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
