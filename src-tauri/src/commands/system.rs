use super::{Empty, IdPayload, Progress};
use crate::error::{AppError, CmdResult};
use crate::state::AppState;
use crate::watch_folder;
use serde::Serialize;
use snapnote_core::add::{self, AddPlan};
use snapnote_core::{capture, import, thumbs, ImportReport, LibraryCounts, RecentLabel};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
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

/// What became of each file handed to `add_files` or `paste_clipboard`.
#[derive(Debug, Clone, Serialize, Default)]
pub struct AddReport {
    /// Paths now in the library, or in the Screenshots folder on their way in.
    pub added: Vec<String>,
    /// Ids of files that were already tracked.
    pub existing: Vec<i64>,
    pub skipped: Vec<Skipped>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Skipped {
    pub path: String,
    pub reason: String,
}

fn add_paths(app: &AppHandle, state: &AppState, paths: Vec<PathBuf>) -> CmdResult<AddReport> {
    let folder = state.watch_folder();
    let mut report = AddReport::default();
    let mut tracked = Vec::new();
    for p in paths {
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| p.to_string_lossy().into_owned());
        let plan = {
            let store = state.store()?;
            add::plan_add(&store, &p)?
        };
        match plan {
            AddPlan::Tracked(id) => report.existing.push(id),
            AddPlan::Skip(reason) => report.skipped.push(Skipped { path: name, reason }),
            AddPlan::InPlace { destination_id } => {
                let result = {
                    let store = state.store()?;
                    add::track_in_place(&store, &p, destination_id)
                };
                match result {
                    Ok(shot) => {
                        tracked.push(shot.id);
                        report.added.push(shot.path);
                    }
                    Err(e) => report.skipped.push(Skipped { path: name, reason: e.to_string() }),
                }
            }
            // The watcher notices the copy and toasts it like any new screenshot.
            AddPlan::CopyIn => match add::copy_in(&p, &folder) {
                Ok(target) => report.added.push(target.to_string_lossy().into_owned()),
                Err(e) => report.skipped.push(Skipped { path: name, reason: e.to_string() }),
            },
        }
    }
    for id in tracked {
        let _ = app.emit("screenshot:new", IdPayload { id });
    }
    Ok(report)
}

/// Adds image files (dropped or pasted from Explorer) to the library. See `add::plan_add`.
#[tauri::command(async)]
pub fn add_files(app: AppHandle, state: State<'_, AppState>, paths: Vec<String>) -> CmdResult<AddReport> {
    add_paths(&app, &state, paths.into_iter().map(PathBuf::from).collect())
}

/// Files on the clipboard are added; otherwise a clipboard image is saved into the watch folder
/// as a screenshot-named PNG, which the watcher toasts like any other screenshot.
#[tauri::command(async)]
pub fn paste_clipboard(app: AppHandle, state: State<'_, AppState>) -> CmdResult<AddReport> {
    let files = crate::clipboard::file_list();
    if !files.is_empty() {
        return add_paths(&app, &state, files);
    }
    let img = app
        .clipboard()
        .read_image()
        .map_err(|_| AppError::new("InvalidInput", "Nothing to paste. Copy an image or image files first."))?;
    let folder = state.watch_folder();
    let path = capture::save_capture_now(&folder, img.rgba(), img.width(), img.height())?;
    Ok(AddReport { added: vec![path.to_string_lossy().into_owned()], ..Default::default() })
}

/// Re-checks every tracked file against the disk. Returns how many rows changed status.
#[tauri::command(async)]
pub fn reconcile_now(app: AppHandle) -> CmdResult<usize> {
    crate::reconcile::run(&app)
}

/// Labels used recently with the destination they went to: the toast and popup offer them as
/// one-click choices.
#[tauri::command(async)]
pub fn recent_labels(state: State<'_, AppState>) -> CmdResult<Vec<RecentLabel>> {
    Ok(state.store()?.recent_labels(5)?)
}

#[tauri::command(async)]
pub fn library_counts(state: State<'_, AppState>) -> CmdResult<LibraryCounts> {
    Ok(state.store()?.library_counts()?)
}
