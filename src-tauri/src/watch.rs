use crate::commands::IdPayload;
use crate::error::CmdResult;
use crate::state::AppState;
use crate::{tray, watch_folder, windows};
use snapnote_core::watcher::{spawn, WatchConfig, WatchStatus};
use snapnote_core::{ingest, CoreError};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// (Re)starts the folder watcher from current settings. Safe to call any time.
pub fn start(app: &AppHandle) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let settings = state.store()?.get_settings()?;
    let folder = watch_folder::resolve_from_settings(&settings);
    state.store()?.set_default_destination_path(&folder.to_string_lossy())?;
    *state.watch_folder.lock()? = folder.clone();

    let old = state.watcher.lock()?.take();
    if let Some(old) = old {
        old.stop();
    }
    let app_new = app.clone();
    let app_status = app.clone();
    let handle = spawn(
        WatchConfig {
            folder,
            quiet: Duration::from_millis(300),
            max_wait: Duration::from_secs(5),
            retry: Duration::from_secs(10),
        },
        Arc::new(move |path| on_new_file(&app_new, path)),
        Arc::new(move |status| on_status(&app_status, status)),
    );
    *state.watcher.lock()? = Some(handle);
    Ok(())
}

fn on_new_file(app: &AppHandle, path: PathBuf) {
    let state = app.state::<AppState>();
    let shot = {
        let Ok(store) = state.store() else { return };
        match ingest::ingest_new_file(&store, &path) {
            Ok(s) => s,
            Err(CoreError::InvalidInput(_)) => return, // already tracked (duplicate event)
            Err(e) => {
                eprintln!("ingest {}: {e}", path.display());
                return;
            }
        }
    };
    let _ = app.emit("screenshot:new", IdPayload { id: shot.id });
    windows::show_toast(app, shot.id);
}

fn on_status(app: &AppHandle, status: WatchStatus) {
    match status {
        WatchStatus::Watching(folder) => tray::set_tooltip(app, &format!("snapnote — watching {}", folder.display())),
        WatchStatus::Paused { reason, .. } => tray::set_tooltip(app, &format!("snapnote — watching paused: {reason}")),
    }
}
