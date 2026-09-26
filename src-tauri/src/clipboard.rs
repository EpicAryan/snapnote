//! Clipboard access the clipboard-manager plugin does not cover: the file list Explorer puts on
//! the clipboard, and writing several formats in one session.

use std::path::{Path, PathBuf};

/// Paths from a `CF_HDROP` clipboard (what Explorer's Copy produces). Empty when there are none.
#[cfg(windows)]
pub fn file_list() -> Vec<PathBuf> {
    use clipboard_win::formats;
    if !clipboard_win::is_format_avail(formats::CF_HDROP) {
        return Vec::new();
    }
    clipboard_win::get_clipboard::<Vec<PathBuf>, _>(formats::FileList).unwrap_or_default()
}

#[cfg(not(windows))]
pub fn file_list() -> Vec<PathBuf> {
    Vec::new()
}

/// One clipboard session holding three formats: the file list (so Explorer pastes the file),
/// the PNG bytes (browsers and chat apps) and a plain bitmap (Paint, Office).
#[cfg(windows)]
pub fn write_image_file(path: &Path, png: &[u8], bmp: &[u8]) -> Result<(), String> {
    use clipboard_win::{raw, Clipboard};
    let _clip = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
    raw::empty().map_err(|e| e.to_string())?;
    raw::set_file_list(&[path.to_string_lossy().as_ref()]).map_err(|e| e.to_string())?;
    if let Some(id) = clipboard_win::register_format("PNG") {
        raw::set_without_clear(id.get(), png).map_err(|e| e.to_string())?;
    }
    raw::set_bitmap(bmp).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn write_image_file(_path: &Path, _png: &[u8], _bmp: &[u8]) -> Result<(), String> {
    Err("copying files to the clipboard is only supported on Windows".into())
}

/// Several files at once (Explorer paste). No image formats: there is no single image to offer.
#[cfg(windows)]
pub fn write_file_list(paths: &[PathBuf]) -> Result<(), String> {
    use clipboard_win::{raw, Clipboard};
    let strings: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let _clip = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
    raw::empty().map_err(|e| e.to_string())?;
    raw::set_file_list(&strings).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn write_file_list(_paths: &[PathBuf]) -> Result<(), String> {
    Err("copying files to the clipboard is only supported on Windows".into())
}
