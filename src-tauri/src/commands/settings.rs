use super::Empty;
use crate::error::CmdResult;
use crate::state::AppState;
use snapnote_core::Settings;
use tauri::{AppHandle, Emitter, State};

#[tauri::command(async)]
pub fn get_settings(state: State<'_, AppState>) -> CmdResult<Settings> {
    Ok(state.store()?.get_settings()?)
}

#[tauri::command(async)]
pub fn set_setting(app: AppHandle, state: State<'_, AppState>, key: String, value: String) -> CmdResult<()> {
    state.store()?.set_setting(&key, &value)?;
    apply_side_effects(&app, &key, &value);
    app.emit("settings:changed", Empty {})?;
    Ok(())
}

/// Settings that change live behaviour.
pub fn apply_side_effects(app: &AppHandle, key: &str, value: &str) {
    match key {
        "label_hotkey" => {
            let _ = crate::hotkey::register_label_hotkey(app, value);
        }
        "autostart" => crate::autostart::apply(app, value == "true"),
        "watch_folder_override" => {
            if let Err(e) = crate::watch::start(app) {
                eprintln!("restart watcher: {e}");
            }
        }
        _ => {}
    }
}
