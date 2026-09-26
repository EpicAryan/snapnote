use crate::error::{AppError, CmdResult};
use crate::state::AppState;
use crate::watch_folder;
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

/// The auto-detected Screenshots folder, ignoring any override (the settings UI shows both).
#[tauri::command]
pub fn detect_watch_folder() -> String {
    watch_folder::detected_default().to_string_lossy().into_owned()
}

#[tauri::command]
pub fn folder_exists(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
pub fn create_folder(path: String) -> CmdResult<()> {
    std::fs::create_dir_all(&path)?;
    Ok(())
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    app.opener()
        .open_path(state.data_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::new("Io", e.to_string()))
}
