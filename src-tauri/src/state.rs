use crate::error::CmdResult;
use crate::undo::UndoBatch;
use crate::windows::LibraryPlacement;
use snapnote_core::store::Store;
use snapnote_core::watcher::WatcherHandle;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

pub struct AppState {
    pub store: Mutex<Store>,
    pub data_dir: PathBuf,
    pub thumbs_dir: PathBuf,
    pub watch_folder: Mutex<PathBuf>,
    /// Screenshot the toast currently shows, if any. Drives the hotkey.
    pub toast_id: Mutex<Option<i64>>,
    pub watcher: Mutex<Option<WatcherHandle>>,
    /// Last hotkey registration failure, replayed to the library when it opens.
    pub hotkey_error: Mutex<Option<String>>,
    /// The library window's last normal geometry and whether it should come up maximized.
    pub library_placement: Mutex<LibraryPlacement>,
    /// The last delete batch, undoable until the next delete.
    pub undo: Mutex<Option<UndoBatch>>,
}

impl AppState {
    pub fn store(&self) -> CmdResult<MutexGuard<'_, Store>> {
        Ok(self.store.lock()?)
    }

    pub fn watch_folder(&self) -> PathBuf {
        self.watch_folder.lock().map(|g| g.clone()).unwrap_or_default()
    }
}
