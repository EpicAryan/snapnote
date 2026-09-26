use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// Applies the "start with Windows" setting. No-op in debug builds so `tauri dev` never
/// registers a development executable in the Run key.
pub fn apply(app: &AppHandle, enabled: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    if let Err(e) = result {
        eprintln!("autostart: {e}");
    }
}
