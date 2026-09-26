use crate::commands::{Empty, IdPayload};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

pub const LIBRARY: &str = "library";
pub const POPUP: &str = "popup";
pub const TOAST: &str = "toast";

#[derive(Debug, Clone, Serialize)]
pub struct HotkeyError {
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ViewPayload {
    pub view: String,
}

fn win(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
    app.get_webview_window(label)
}

/// Bottom-right corner of the work area (taskbar excluded), inset by `margin` physical pixels.
pub fn toast_position(work_x: i32, work_y: i32, work_w: u32, work_h: u32, win_w: u32, win_h: u32, margin: i32) -> (i32, i32) {
    (
        work_x + work_w as i32 - win_w as i32 - margin,
        work_y + work_h as i32 - win_h as i32 - margin,
    )
}

pub fn show_toast(app: &AppHandle, id: i64) {
    let state = app.state::<AppState>();
    if let Ok(mut t) = state.toast_id.lock() {
        *t = Some(id);
    }
    let Some(w) = win(app, TOAST) else { return };
    if let (Ok(Some(m)), Ok(size)) = (w.primary_monitor(), w.outer_size()) {
        let wa = m.work_area();
        let margin = (16.0 * m.scale_factor()).round() as i32;
        let (x, y) = toast_position(wa.position.x, wa.position.y, wa.size.width, wa.size.height, size.width, size.height, margin);
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    let _ = app.emit_to(TOAST, "toast:show", IdPayload { id });
    let _ = w.show();
}

pub fn hide_toast(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(mut t) = state.toast_id.lock() {
        *t = None;
    }
    if let Some(w) = win(app, TOAST) {
        let _ = w.hide();
    }
    let _ = app.emit_to(TOAST, "toast:hide", Empty {});
}

pub fn show_popup(app: &AppHandle, id: i64) {
    hide_toast(app);
    let Some(w) = win(app, POPUP) else { return };
    let _ = app.emit_to(POPUP, "popup:open", IdPayload { id });
    let _ = w.center();
    let _ = w.show();
    let _ = w.set_focus();
}

pub fn hide_popup(app: &AppHandle) {
    if let Some(w) = win(app, POPUP) {
        let _ = w.hide();
    }
}

pub fn show_library(app: &AppHandle) {
    let Some(w) = win(app, LIBRARY) else { return };
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
    let state = app.state::<AppState>();
    let pending = state.hotkey_error.lock().ok().and_then(|g| g.clone());
    if let Some(msg) = pending {
        let _ = app.emit_to(LIBRARY, "hotkey:error", HotkeyError { message: msg });
    }
}

pub fn show_settings(app: &AppHandle) {
    show_library(app);
    let _ = app.emit_to(LIBRARY, "library:view", ViewPayload { view: "settings".into() });
}

/// Hotkey and tray action: the toasted screenshot if one is showing, else the newest, else the library.
pub fn label_current_or_newest(app: &AppHandle) {
    // A popup that is already open holds unsaved typing: just bring it to the front.
    if let Some(w) = win(app, POPUP) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.set_focus();
            return;
        }
    }
    // The hotkey and tray handlers run on the main thread, and the store lock may be held by
    // a long command (an import, a move with retries), so the lookup runs on its own thread.
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let toast = state.toast_id.lock().ok().and_then(|t| *t);
        let newest = || state.store().ok().and_then(|s| s.newest_screenshot().ok().flatten()).map(|s| s.id);
        let chosen = toast.or_else(newest);
        match chosen {
            Some(id) => show_popup(&app, id),
            None => show_library(&app),
        }
    });
}

// ---- library window bounds ----

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// True if the window's top-left corner (plus a little slack for the title bar) is on some monitor.
pub fn bounds_visible_on(monitors: &[(i32, i32, u32, u32)], b: &Bounds) -> bool {
    monitors.iter().any(|&(mx, my, mw, mh)| {
        let (px, py) = (b.x + 40, b.y + 40);
        px >= mx && py >= my && px < mx + mw as i32 && py < my + mh as i32
    })
}

pub fn save_library_bounds(app: &AppHandle) {
    let Some(w) = win(app, LIBRARY) else { return };
    let (Ok(pos), Ok(size)) = (w.outer_position(), w.inner_size()) else { return };
    let b = Bounds { x: pos.x, y: pos.y, w: size.width, h: size.height };
    let Ok(json) = serde_json::to_string(&b) else { return };
    let state = app.state::<AppState>();
    // Runs on the main thread from the close handler: never wait on a busy store.
    let store = state.store.try_lock();
    if let Ok(store) = store {
        let _ = store.set_setting("library_window_bounds", &json);
    }
}

pub fn restore_library_bounds(app: &AppHandle) {
    let state = app.state::<AppState>();
    let settings = match state.store() {
        Ok(store) => match store.get_settings() {
            Ok(s) => s,
            Err(_) => return,
        },
        Err(_) => return,
    };
    let Ok(b) = serde_json::from_str::<Bounds>(&settings.library_window_bounds) else { return };
    let Some(w) = win(app, LIBRARY) else { return };
    let monitors: Vec<(i32, i32, u32, u32)> = w
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .collect();
    if bounds_visible_on(&monitors, &b) {
        let _ = w.set_position(PhysicalPosition::new(b.x, b.y));
        let _ = w.set_size(PhysicalSize::new(b.w, b.h));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toast_sits_in_the_bottom_right_of_the_work_area() {
        // Work area starts at (0,0) 2560x1400 (taskbar excluded), toast 340x88, margin 16.
        assert_eq!(toast_position(0, 0, 2560, 1400, 340, 88, 16), (2560 - 340 - 16, 1400 - 88 - 16));
        // Secondary monitor to the left of primary: negative origin.
        assert_eq!(toast_position(-1920, 0, 1920, 1040, 340, 88, 16), (-1920 + 1920 - 340 - 16, 1040 - 88 - 16));
    }

    #[test]
    fn saved_bounds_are_only_restored_when_on_a_monitor() {
        let monitors = [(0, 0, 2560, 1440), (-1920, 0, 1920, 1080)];
        assert!(bounds_visible_on(&monitors, &Bounds { x: 100, y: 100, w: 1100, h: 720 }));
        assert!(bounds_visible_on(&monitors, &Bounds { x: -1500, y: 200, w: 1100, h: 720 }));
        assert!(!bounds_visible_on(&monitors, &Bounds { x: 5000, y: 100, w: 1100, h: 720 }), "unplugged monitor");
        assert!(!bounds_visible_on(&monitors, &Bounds { x: 100, y: -900, w: 1100, h: 720 }));
    }
}
