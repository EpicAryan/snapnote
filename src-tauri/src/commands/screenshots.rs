use super::{Empty, IdPayload};
use crate::error::{AppError, CmdResult};
use crate::state::AppState;
use crate::undo::{self, UndoBatch, UndoItem};
use base64::Engine;
use serde::Serialize;
use snapnote_core::{files, save, thumbs, CoreError, Destination, DestinationChoice, ListQuery, SaveResult, Screenshot, ScreenshotCard, Status};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command(async)]
pub fn list_screenshots(state: State<'_, AppState>, query: ListQuery) -> CmdResult<Vec<ScreenshotCard>> {
    Ok(state.store()?.list_screenshots(&query)?)
}

#[tauri::command(async)]
pub fn get_screenshot(state: State<'_, AppState>, id: i64) -> CmdResult<Screenshot> {
    Ok(state.store()?.get_screenshot(id)?)
}

#[tauri::command(async)]
pub fn save_metadata(app: AppHandle, state: State<'_, AppState>, id: i64, label: String, notes: String, tags: Vec<String>, choice: DestinationChoice) -> CmdResult<SaveResult> {
    let pending = {
        let store = state.store()?;
        let rename = store.get_settings()?.rename_on_label;
        save::prepare(&store, id, &label, &notes, &tags, &choice, rename)?
    };
    // The disk move (with its retries) runs without the store lock so other commands and the
    // hotkey keep working while a locked file is retried.
    let outcome = save::execute(&pending, &*files::default_mover());
    let result = {
        let store = state.store()?;
        save::commit(&store, &pending, outcome)?
    };
    app.emit("screenshot:updated", IdPayload { id })?;
    app.emit("settings:changed", Empty {})?;
    Ok(result)
}

#[tauri::command(async)]
pub fn retry_move(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<SaveResult> {
    let pending = {
        let store = state.store()?;
        let rename = store.get_settings()?.rename_on_label;
        save::prepare_retry(&store, id, rename)?
    };
    let outcome = save::execute(&pending, &*files::default_mover());
    let result = {
        let store = state.store()?;
        save::commit(&store, &pending, outcome)?
    };
    app.emit("screenshot:updated", IdPayload { id })?;
    Ok(result)
}

#[derive(Debug, Clone, Serialize)]
pub struct Failed {
    pub id: i64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct MoveReport {
    pub moved: usize,
    pub unchanged: usize,
    /// Metadata saved, but the file could not be moved yet (Retry move later).
    pub pending: usize,
    pub failed: Vec<Failed>,
    pub destination: Option<Destination>,
}

/// Moves several screenshots to one destination, keeping each one's label, notes and tags.
#[tauri::command(async)]
pub fn move_screenshots(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>, choice: DestinationChoice) -> CmdResult<MoveReport> {
    let rename = state.store()?.get_settings()?.rename_on_label;
    let mut report = MoveReport::default();
    for id in ids {
        let pending = {
            let store = state.store()?;
            store.get_screenshot(id).and_then(|shot| save::prepare(&store, id, &shot.label, &shot.notes, &shot.tags, &choice, rename))
        };
        let pending = match pending {
            Ok(p) => p,
            Err(e) => {
                report.failed.push(Failed { id, reason: e.to_string() });
                continue;
            }
        };
        let outcome = save::execute(&pending, &*files::default_mover());
        let result = {
            let store = state.store()?;
            save::commit(&store, &pending, outcome)
        };
        match result {
            Ok(r) => {
                report.destination = Some(r.destination.clone());
                if r.warning.is_some() {
                    report.pending += 1;
                } else if r.moved {
                    report.moved += 1;
                } else {
                    report.unchanged += 1;
                }
            }
            Err(e) => report.failed.push(Failed { id, reason: e.to_string() }),
        }
    }
    app.emit("library:refresh", Empty {})?;
    app.emit("settings:changed", Empty {})?;
    Ok(report)
}

/// Adds tags to several screenshots without touching their other tags. Returns rows changed.
#[tauri::command(async)]
pub fn add_tags(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>, tags: Vec<String>) -> CmdResult<usize> {
    let changed = state.store()?.add_tags(&ids, &tags)?;
    app.emit("library:refresh", Empty {})?;
    Ok(changed)
}

#[tauri::command(async)]
pub fn get_thumbnail(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<String> {
    let shot = state.store()?.get_screenshot(id)?;
    let out = match thumbs::ensure_thumbnail(&state.thumbs_dir, id, Path::new(&shot.path), thumbs::THUMB_WIDTH) {
        Ok(p) => p,
        Err(CoreError::FileMissing(m)) => {
            let _ = state.store()?.set_status(id, Status::Missing);
            let _ = app.emit("screenshot:updated", IdPayload { id });
            return Err(CoreError::FileMissing(m).into());
        }
        Err(e) => return Err(e.into()),
    };
    // Imported rows have no hash yet; the thumbnail read already paid for reading the file.
    if shot.hash.is_empty() {
        if let Ok(h) = files::hash_file(Path::new(&shot.path)) {
            let _ = state.store()?.update_hash(id, &h);
        }
    }
    Ok(out.to_string_lossy().into_owned())
}

pub fn data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}

const MAX_PREVIEW_BYTES: u64 = 40 * 1024 * 1024;

#[tauri::command(async)]
pub fn get_image_data_url(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<String> {
    let path = existing_path(&app, &state, id)?;
    let meta = std::fs::metadata(&path)?;
    if meta.len() > MAX_PREVIEW_BYTES {
        return Err(AppError::new("InvalidInput", "image is too large to preview"));
    }
    Ok(data_url(&std::fs::read(&path)?))
}

/// The screenshot's path if the file exists; otherwise flags the row missing, tells the
/// library so the card updates, and fails.
fn existing_path(app: &AppHandle, state: &State<'_, AppState>, id: i64) -> CmdResult<String> {
    let shot = state.store()?.get_screenshot(id)?;
    if !Path::new(&shot.path).is_file() {
        state.store()?.set_status(id, Status::Missing)?;
        let _ = app.emit("screenshot:updated", IdPayload { id });
        return Err(AppError::new("FileMissing", format!("{} no longer exists", shot.path)));
    }
    Ok(shot.path)
}

#[tauri::command(async)]
pub fn open_file(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    let path = existing_path(&app, &state, id)?;
    app.opener().open_path(path, None::<&str>).map_err(|e| AppError::new("Io", e.to_string()))
}

#[tauri::command(async)]
pub fn reveal_file(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    let path = existing_path(&app, &state, id)?;
    app.opener().reveal_item_in_dir(&path).map_err(|e| AppError::new("Io", e.to_string()))
}

/// Copies screenshots as files (Explorer paste). A single one also goes on as an image, for
/// editors and chat apps. Missing files are skipped.
#[tauri::command(async)]
pub fn copy_screenshots(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>) -> CmdResult<usize> {
    let mut paths: Vec<PathBuf> = Vec::new();
    for id in ids {
        if let Ok(p) = existing_path(&app, &state, id) {
            paths.push(PathBuf::from(p));
        }
    }
    let io = |e: String| AppError::new("Io", format!("Could not copy to the clipboard: {e}"));
    match paths.as_slice() {
        [] => Err(AppError::new("FileMissing", "Nothing to copy: the file is missing")),
        [single] => {
            let png = std::fs::read(single)?;
            let bmp = snapnote_core::export::bmp_bytes(single)?;
            crate::clipboard::write_image_file(single, &png, &bmp).map_err(io)?;
            Ok(1)
        }
        many => {
            crate::clipboard::write_file_list(many).map_err(io)?;
            Ok(many.len())
        }
    }
}

#[tauri::command(async)]
pub fn remove_from_library(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    state.store()?.delete_screenshot(id)?;
    let _ = thumbs::remove_thumbnail(&state.thumbs_dir, id);
    app.emit("screenshot:removed", IdPayload { id })?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DeleteReport {
    pub deleted: Vec<i64>,
    /// How many files went to the Recycle Bin (the rest were already missing).
    pub trashed: usize,
    pub failed: Vec<Failed>,
    pub undo_token: u64,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct UndoReport {
    pub restored: Vec<i64>,
    pub failed: Vec<Failed>,
}

static UNDO_SEQ: AtomicU64 = AtomicU64::new(1);

/// Sends the files to the Recycle Bin (never a hard delete) and forgets them. The batch can be
/// undone with `undo_delete` until the next delete replaces it.
#[tauri::command(async)]
pub fn delete_screenshots(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>) -> CmdResult<DeleteReport> {
    let mut report = DeleteReport { undo_token: UNDO_SEQ.fetch_add(1, Ordering::Relaxed), ..Default::default() };
    let mut items = Vec::new();
    for id in ids {
        let shot = match state.store()?.get_screenshot(id) {
            Ok(s) => s,
            Err(e) => {
                report.failed.push(Failed { id, reason: e.to_string() });
                continue;
            }
        };
        let mut trashed = false;
        if Path::new(&shot.path).is_file() {
            if let Err(e) = trash::delete(&shot.path) {
                report.failed.push(Failed { id, reason: format!("Could not move to the Recycle Bin: {e}") });
                continue;
            }
            trashed = true;
        }
        if let Err(e) = state.store()?.delete_screenshot(id) {
            report.failed.push(Failed { id, reason: e.to_string() });
            continue;
        }
        let _ = thumbs::remove_thumbnail(&state.thumbs_dir, id);
        if trashed {
            report.trashed += 1;
        }
        report.deleted.push(id);
        items.push(UndoItem { shot, trashed });
    }
    if !items.is_empty() {
        *state.undo.lock()? = Some(UndoBatch { token: report.undo_token, items });
    }
    app.emit("library:refresh", Empty {})?;
    Ok(report)
}

/// Brings the last deleted batch back: files out of the Recycle Bin, rows with their original
/// ids, labels, notes and tags. A file that cannot be restored comes back as a missing entry.
#[tauri::command(async)]
pub fn undo_delete(app: AppHandle, state: State<'_, AppState>, token: u64) -> CmdResult<UndoReport> {
    let batch = {
        let mut slot = state.undo.lock()?;
        match slot.take() {
            Some(b) if b.token == token => b,
            other => {
                *slot = other;
                return Err(AppError::new("InvalidInput", "That delete can no longer be undone"));
            }
        }
    };
    let mut report = UndoReport::default();
    for item in batch.items {
        let mut problem: Option<String> = None;
        let mut status = Status::Missing;
        if item.trashed {
            match undo::restore_from_bin(&item.shot.path) {
                Ok(true) => status = Status::Present,
                Ok(false) => problem = Some("it is no longer in the Recycle Bin".into()),
                Err(e) => problem = Some(e),
            }
        }
        if Path::new(&item.shot.path).is_file() {
            status = Status::Present;
        }
        let id = item.shot.id;
        let inserted = {
            let store = state.store()?;
            store.restore_screenshot(&item.shot, status)
        };
        match inserted {
            Ok(()) => {
                report.restored.push(id);
                if let Some(p) = problem {
                    report.failed.push(Failed { id, reason: format!("entry restored, but the file was not: {p}") });
                }
            }
            Err(e) => report.failed.push(Failed { id, reason: e.to_string() }),
        }
    }
    app.emit("library:refresh", Empty {})?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::data_url;

    #[test]
    fn data_url_is_png_base64() {
        assert_eq!(data_url(b"\x89PNG"), "data:image/png;base64,iVBORw==");
    }
}
