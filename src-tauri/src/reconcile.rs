use crate::commands::Empty;
use crate::error::CmdResult;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager};

/// Snapshot rows under the store lock, check file existence without it, apply the flips under
/// the lock again, and tell the library to refresh when anything changed.
pub fn run(app: &AppHandle) -> CmdResult<usize> {
    let state = app.state::<AppState>();
    let rows = {
        let store = state.store()?;
        store.all_rows_status()?
    };
    let changes = snapnote_core::reconcile::plan(&rows, |p| p.exists());
    if changes.is_empty() {
        return Ok(0);
    }
    {
        let store = state.store()?;
        snapnote_core::reconcile::apply(&store, &changes)?;
    }
    app.emit("library:refresh", Empty {})?;
    Ok(changes.len())
}

/// Fire-and-forget on its own thread: used at startup and whenever the library gains focus.
pub fn spawn(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = run(&app) {
            eprintln!("reconcile: {e}");
        }
    });
}
