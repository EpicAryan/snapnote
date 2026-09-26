use super::{Empty, IdPayload};
use crate::error::{AppError, CmdResult};
use crate::state::AppState;
use base64::Engine;
use snapnote_core::{files, save, thumbs, CoreError, DestinationChoice, ListQuery, SaveResult, Screenshot, ScreenshotCard, Status};
use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
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
pub fn save_metadata(app: AppHandle, state: State<'_, AppState>, id: i64, label: String, notes: String, choice: DestinationChoice) -> CmdResult<SaveResult> {
    let pending = {
        let store = state.store()?;
        let rename = store.get_settings()?.rename_on_label;
        save::prepare(&store, id, &label, &notes, &choice, rename)?
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

/// Puts the screenshot's pixels on the clipboard so it can be pasted into any app.
#[tauri::command(async)]
pub fn copy_image(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    let path = existing_path(&app, &state, id)?;
    let img = tauri::image::Image::from_path(&path)?;
    app.clipboard().write_image(&img).map_err(|e| AppError::new("Io", format!("Could not copy to the clipboard: {e}")))
}

#[tauri::command(async)]
pub fn remove_from_library(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    state.store()?.delete_screenshot(id)?;
    let _ = thumbs::remove_thumbnail(&state.thumbs_dir, id);
    app.emit("screenshot:removed", IdPayload { id })?;
    Ok(())
}

/// Sends the file to the Recycle Bin (never a hard delete), then forgets it.
#[tauri::command(async)]
pub fn delete_file(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    let shot = state.store()?.get_screenshot(id)?;
    let p = Path::new(&shot.path);
    if p.is_file() {
        trash::delete(p).map_err(|e| AppError::new("Io", format!("Could not move to Recycle Bin: {e}")))?;
    }
    remove_from_library(app, state, id)
}

#[cfg(test)]
mod tests {
    use super::data_url;

    #[test]
    fn data_url_is_png_base64() {
        assert_eq!(data_url(b"\x89PNG"), "data:image/png;base64,iVBORw==");
    }
}
