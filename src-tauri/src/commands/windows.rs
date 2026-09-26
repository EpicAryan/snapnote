use crate::windows;
use tauri::AppHandle;

#[tauri::command]
pub fn hide_toast(app: AppHandle) {
    windows::hide_toast(&app);
}

#[tauri::command]
pub fn open_popup_for(app: AppHandle, id: i64) {
    windows::show_popup(&app, id);
}

#[tauri::command]
pub fn hide_popup(app: AppHandle) {
    windows::hide_popup(&app);
}

#[tauri::command]
pub fn label_last_screenshot(app: AppHandle) {
    windows::label_current_or_newest(&app);
}
