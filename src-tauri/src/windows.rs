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
    let state = app.state::<AppState>();
    // A maximized placement restored while the window was hidden is applied now: maximizing a
    // hidden window makes tao show, maximize and re-hide it, which flashes on screen.
    let maximize = state.library_placement.lock().map(|mut p| std::mem::take(&mut p.maximize_on_show)).unwrap_or(false);
    let _ = w.show();
    if maximize {
        let _ = w.maximize();
    }
    let _ = w.unminimize();
    let _ = w.set_focus();
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

// ---- library window placement ----

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// What is persisted. `maximized` is required on purpose: earlier builds saved the maximized
/// rectangle as if it were the normal size, and restoring it made the maximize button toggle
/// between two identical placements, so a value without the flag is ignored once and replaced.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub maximized: bool,
}

/// Live bookkeeping for the library window.
#[derive(Debug, Default)]
pub struct LibraryPlacement {
    /// Last geometry seen while neither maximized nor minimized.
    pub normal: Option<Bounds>,
    /// Set by a restore while the window is hidden; applied on the next show.
    pub maximize_on_show: bool,
}

/// The normal geometry is only observable while the window is neither maximized (Windows
/// reports the maximized rectangle) nor minimized (it sits at -32000 with no size).
pub fn normal_bounds(maximized: bool, minimized: bool, x: i32, y: i32, w: u32, h: u32) -> Option<Bounds> {
    if maximized || minimized || w == 0 || h == 0 {
        return None;
    }
    Some(Bounds { x, y, w, h })
}

pub fn placement_to_save(normal: Option<Bounds>, maximized: bool) -> Option<Placement> {
    normal.map(|b| Placement { x: b.x, y: b.y, w: b.w, h: b.h, maximized })
}

pub fn parse_placement(json: &str) -> Option<Placement> {
    serde_json::from_str(json).ok()
}

/// True if the window's top-left corner (plus a little slack for the title bar) is on some monitor.
pub fn bounds_visible_on(monitors: &[(i32, i32, u32, u32)], b: &Bounds) -> bool {
    monitors.iter().any(|&(mx, my, mw, mh)| {
        let (px, py) = (b.x + 40, b.y + 40);
        px >= mx && py >= my && px < mx + mw as i32 && py < my + mh as i32
    })
}

/// Called on every move and resize of the library window.
pub fn note_library_bounds(window: &tauri::Window) {
    let (Ok(maximized), Ok(minimized), Ok(pos), Ok(size)) = (window.is_maximized(), window.is_minimized(), window.outer_position(), window.inner_size()) else {
        return;
    };
    let Some(b) = normal_bounds(maximized, minimized, pos.x, pos.y, size.width, size.height) else { return };
    let state = window.app_handle().state::<AppState>();
    let guard = state.library_placement.lock();
    if let Ok(mut p) = guard {
        p.normal = Some(b);
    }
}

pub fn save_library_bounds(app: &AppHandle) {
    let Some(w) = win(app, LIBRARY) else { return };
    let state = app.state::<AppState>();
    let maximized = w.is_maximized().unwrap_or(false);
    let noted = state.library_placement.lock().ok().and_then(|p| p.normal.clone());
    let live = || {
        let (Ok(pos), Ok(size)) = (w.outer_position(), w.inner_size()) else { return None };
        normal_bounds(maximized, w.is_minimized().unwrap_or(false), pos.x, pos.y, size.width, size.height)
    };
    let normal = if maximized { noted } else { live().or(noted) };
    let Some(p) = placement_to_save(normal, maximized) else { return };
    let Ok(json) = serde_json::to_string(&p) else { return };
    // Runs on the main thread from the close handler: never wait on a busy store.
    let store = state.store.try_lock();
    if let Ok(store) = store {
        let _ = store.set_setting("library_window_bounds", &json);
    }
}

pub fn restore_library_bounds(app: &AppHandle) {
    let state = app.state::<AppState>();
    let saved = match state.store() {
        Ok(store) => match store.get_settings() {
            Ok(s) => s.library_window_bounds,
            Err(_) => return,
        },
        Err(_) => return,
    };
    let Some(p) = parse_placement(&saved) else { return };
    let Some(w) = win(app, LIBRARY) else { return };
    let b = Bounds { x: p.x, y: p.y, w: p.w, h: p.h };
    let monitors: Vec<(i32, i32, u32, u32)> = w
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .collect();
    let visible = bounds_visible_on(&monitors, &b);
    // Moving the window fires Moved/Resized synchronously, and their handler takes this lock.
    if visible {
        let _ = w.set_position(PhysicalPosition::new(b.x, b.y));
        let _ = w.set_size(PhysicalSize::new(b.w, b.h));
    }
    let guard = state.library_placement.lock();
    if let Ok(mut placement) = guard {
        if visible {
            placement.normal = Some(b);
        }
        placement.maximize_on_show = p.maximized;
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

    #[test]
    fn only_a_normal_window_reports_bounds_worth_remembering() {
        assert_eq!(normal_bounds(false, false, 10, 20, 1100, 720), Some(Bounds { x: 10, y: 20, w: 1100, h: 720 }));
        assert_eq!(normal_bounds(true, false, -8, -8, 1920, 1057), None, "the maximized rectangle is not the normal size");
        assert_eq!(normal_bounds(false, true, -32000, -32000, 1100, 720), None, "minimized windows sit off-screen");
        assert_eq!(normal_bounds(false, false, 0, 0, 0, 0), None);
    }

    #[test]
    fn placement_keeps_the_normal_bounds_alongside_the_maximized_flag() {
        let normal = Bounds { x: 10, y: 20, w: 1100, h: 720 };
        assert_eq!(placement_to_save(Some(normal.clone()), true), Some(Placement { x: 10, y: 20, w: 1100, h: 720, maximized: true }));
        assert_eq!(placement_to_save(Some(normal), false).map(|p| p.maximized), Some(false));
        assert_eq!(placement_to_save(None, true), None, "nothing known to restore to");
    }

    #[test]
    fn placement_round_trips_and_legacy_bounds_are_ignored() {
        let p = Placement { x: 10, y: 20, w: 1100, h: 720, maximized: true };
        assert_eq!(parse_placement(&serde_json::to_string(&p).unwrap()), Some(p));
        // Earlier builds saved the maximized rectangle as if it were the normal size; restoring
        // it made the maximize button toggle between two identical placements.
        assert_eq!(parse_placement(r#"{"x":-8,"y":-8,"w":1920,"h":1057}"#), None);
        assert_eq!(parse_placement(""), None);
    }
}
