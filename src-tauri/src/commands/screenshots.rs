use crate::error::CmdResult;
use crate::state::AppState;
use snapnote_core::{ListQuery, Screenshot, ScreenshotCard};
use tauri::State;

#[tauri::command(async)]
pub fn list_screenshots(state: State<'_, AppState>, query: ListQuery) -> CmdResult<Vec<ScreenshotCard>> {
    Ok(state.store()?.list_screenshots(&query)?)
}

#[tauri::command(async)]
pub fn get_screenshot(state: State<'_, AppState>, id: i64) -> CmdResult<Screenshot> {
    Ok(state.store()?.get_screenshot(id)?)
}
