use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;

mod capture_log;
mod journal_export;
mod openclaw;
mod resource_watchdog;
mod system_init;
mod upscale;
mod activity;

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

/// Bring the pocket book back to the front from wherever it went.
///
/// `unminimize` matters as much as `show` here: hiding to the tray and
/// being minimized to the taskbar are different states, and a window
/// that's merely minimized will accept `show()` and `set_focus()`
/// without ever coming back up.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
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

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Registered before anything else, which the plugin requires: it
    // has to win the race for the lock before the rest of the app
    // starts doing setup work a second process shouldn't be doing.
    //
    // Without this, launching again while the app is already running
    // just opened another window, which for a tray-resident app is easy
    // to do by accident — the window is hidden, so it looks closed.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(global_shortcut_plugin)
        .plugin(tauri_plugin_notification::init())
        .manage(resource_watchdog::WatchdogState(std::sync::Mutex::new(
            sysinfo::System::new(),
        )))
        .manage(openclaw::CallCancelState(std::sync::Arc::new(
            std::sync::atomic::AtomicBool::new(false),
        )))
        .setup(|app| {
            let pause_item = MenuItem::with_id(app, "pause_capture", "Pause activity capture", true, None::<&str>)?;
            let resume_item = MenuItem::with_id(app, "resume_capture", "Resume activity capture", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "Show Mycelia Time", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&pause_item, &resume_item, &show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "pause_capture" => {
                        let _ = app.emit("activity-capture-pause", true);
                    }
                    "resume_capture" => {
                        let _ = app.emit("activity-capture-pause", false);
                    }
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

            // Windows doesn't reliably give a newly-created window real
            // OS focus on its own, especially launched from a terminal
            // (`npm run tauri dev`) — the window can end up sitting in
            // the taskbar without ever actually coming to the front,
            // which is exactly wrong for the startup checklist screen
            // ("needs to be visible... displayed over apps"). Forcing
            // show+focus here, once setup has actually run, is the fix.
            show_main_window(app.handle());

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
            activity::sample_foreground_activity,
            openclaw::openclaw_ensure_daemon,
            openclaw::openclaw_probe_daemon,
            openclaw::openclaw_release_daemon,
            openclaw::openclaw_call_agent,
            openclaw::run_openclaw_agent,
            openclaw::cancel_active_agent_call,
            journal_export::export_workjournal_file,
            capture_log::append_capture_log,
            resource_watchdog::check_resource_pressure,
            system_init::ensure_voice_agent_running,
            system_init::ensure_ollama_running,
            upscale::upscaler_status,
            upscale::upscale_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
