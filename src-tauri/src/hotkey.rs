use crate::state::AppState;
use crate::windows;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Registers `combo` (e.g. "Ctrl+Shift+L") as the label hotkey, replacing any previous one.
/// On failure the message is remembered in state, sent to the library, shown in the tray
/// tooltip, and returned. The app keeps running either way.
pub fn register_label_hotkey(app: &AppHandle, combo: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let result = gs
        .on_shortcut(combo, |app, _shortcut, event| {
            if matches!(event.state, ShortcutState::Pressed) {
                windows::label_current_or_newest(app);
            }
        })
        .map_err(|e| format!("Could not register hotkey {combo}: {e}. Choose another one in Settings."));

    let state = app.state::<AppState>();
    if let Ok(mut slot) = state.hotkey_error.lock() {
        *slot = result.as_ref().err().cloned();
    }
    match &result {
        Ok(()) => {}
        Err(msg) => {
            let _ = app.emit_to(windows::LIBRARY, "hotkey:error", windows::HotkeyError { message: msg.clone() });
            crate::tray::set_tooltip(app, &format!("snapnote — hotkey {combo} unavailable"));
        }
    }
    result
}
