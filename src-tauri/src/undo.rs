//! The last delete batch, kept so it can be undone once.

use snapnote_core::Screenshot;

pub struct UndoItem {
    pub shot: Screenshot,
    /// The file went to the Recycle Bin (false: it was already missing).
    pub trashed: bool,
}

pub struct UndoBatch {
    pub token: u64,
    pub items: Vec<UndoItem>,
}

/// Restores the newest Recycle Bin entry that came from `path`. Ok(false) when there is none.
#[cfg(windows)]
pub fn restore_from_bin(path: &str) -> Result<bool, String> {
    use snapnote_core::store::paths;
    let want = paths::norm(path);
    let items = trash::os_limited::list().map_err(|e| e.to_string())?;
    let best = items
        .into_iter()
        .filter(|i| paths::norm(&i.original_path().to_string_lossy()) == want)
        .max_by_key(|i| i.time_deleted);
    match best {
        None => Ok(false),
        Some(item) => {
            trash::os_limited::restore_all([item]).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

#[cfg(not(windows))]
pub fn restore_from_bin(_path: &str) -> Result<bool, String> {
    Ok(false)
}
