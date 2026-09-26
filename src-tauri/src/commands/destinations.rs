use super::Empty;
use crate::error::CmdResult;
use crate::state::AppState;
use snapnote_core::Destination;
use tauri::{AppHandle, Emitter, State};

#[tauri::command(async)]
pub fn list_destinations(state: State<'_, AppState>) -> CmdResult<Vec<Destination>> {
    Ok(state.store()?.list_destinations()?)
}

#[tauri::command(async)]
pub fn create_destination(app: AppHandle, state: State<'_, AppState>, name: String, path: String) -> CmdResult<Destination> {
    let d = state.store()?.create_destination(&name, &path)?;
    app.emit("settings:changed", Empty {})?;
    Ok(d)
}

#[tauri::command(async)]
pub fn update_destination(app: AppHandle, state: State<'_, AppState>, id: i64, name: String, path: String) -> CmdResult<()> {
    state.store()?.update_destination(id, &name, &path)?;
    app.emit("settings:changed", Empty {})?;
    Ok(())
}

#[tauri::command(async)]
pub fn delete_destination(app: AppHandle, state: State<'_, AppState>, id: i64, reassign_to: i64) -> CmdResult<()> {
    state.store()?.delete_destination(id, reassign_to)?;
    app.emit("settings:changed", Empty {})?;
    Ok(())
}

#[tauri::command(async)]
pub fn reorder_destinations(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>) -> CmdResult<()> {
    state.store()?.reorder_destinations(&ids)?;
    app.emit("settings:changed", Empty {})?;
    Ok(())
}
