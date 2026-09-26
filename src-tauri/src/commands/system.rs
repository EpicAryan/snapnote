use super::{Empty, Progress};
use crate::error::{AppError, CmdResult};
use crate::state::AppState;
use crate::watch_folder;
use snapnote_core::{import, thumbs, ImportReport};
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
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

/// Walks the watch folder once and tracks PNGs that are not yet in the library.
/// Reads no file contents, so OneDrive placeholders stay in the cloud.
#[tauri::command(async)]
pub fn import_existing(app: AppHandle, state: State<'_, AppState>) -> CmdResult<ImportReport> {
    let folder = state.watch_folder();
    let report = {
        let store = state.store()?;
        let emitter = app.clone();
        let mut last = Instant::now();
        import::import_folder(&store, &folder, &mut |done, total| {
            if done == total || last.elapsed() > Duration::from_millis(100) {
                last = Instant::now();
                let _ = emitter.emit("import:progress", Progress { done, total });
            }
        })?
    };
    app.emit("library:refresh", Empty {})?;
    Ok(report)
}

#[tauri::command(async)]
pub fn clear_thumbnail_cache(state: State<'_, AppState>) -> CmdResult<usize> {
    Ok(thumbs::clear_cache(&state.thumbs_dir)?)
}
