use crate::{files, CoreError, Result};
use chrono::NaiveDateTime;
use std::path::{Path, PathBuf};

/// Save an RGBA bitmap as a PNG in `folder` using the Snipping Tool naming scheme, so the
/// watcher and the timestamp parser treat it like any other screenshot. Written to a `.part`
/// file and renamed, so the watcher never sees a half-written PNG.
pub fn save_capture(folder: &Path, rgba: &[u8], width: u32, height: u32, at: NaiveDateTime) -> Result<PathBuf> {
    let img = image::RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or_else(|| CoreError::InvalidInput("clipboard image data does not match its dimensions".into()))?;
    let stem = at.format("Screenshot %Y-%m-%d %H%M%S").to_string();
    let target = files::unique_target(folder, &stem, "png");
    let tmp = target.with_extension("part");
    if let Err(e) = img.save_with_format(&tmp, image::ImageFormat::Png) {
        let _ = std::fs::remove_file(&tmp);
        return Err(CoreError::Image(e.to_string()));
    }
    std::fs::rename(&tmp, &target)?;
    Ok(target)
}

pub fn save_capture_now(folder: &Path, rgba: &[u8], width: u32, height: u32) -> Result<PathBuf> {
    save_capture(folder, rgba, width, height, chrono::Local::now().naive_local())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use std::fs;

    fn at() -> chrono::NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 9, 26).unwrap().and_hms_opt(10, 15, 0).unwrap()
    }

    #[test]
    fn saves_a_png_named_like_a_screenshot_with_no_temp_file_left() {
        let dir = tempfile::tempdir().unwrap();
        let rgba = vec![255u8; 2 * 2 * 4];
        let p = save_capture(dir.path(), &rgba, 2, 2, at()).unwrap();
        assert_eq!(p, dir.path().join("Screenshot 2026-09-26 101500.png"));
        let img = image::open(&p).unwrap();
        assert_eq!((img.width(), img.height()), (2, 2));
        assert_eq!(crate::captured_at::from_filename(p.file_name().unwrap().to_str().unwrap()).as_deref(), Some("2026-09-26T10:15:00"));
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "no .part left behind");
    }

    #[test]
    fn a_second_capture_in_the_same_second_gets_a_suffix() {
        let dir = tempfile::tempdir().unwrap();
        let rgba = vec![0u8; 4];
        save_capture(dir.path(), &rgba, 1, 1, at()).unwrap();
        let p = save_capture(dir.path(), &rgba, 1, 1, at()).unwrap();
        assert_eq!(p, dir.path().join("Screenshot 2026-09-26 101500-2.png"));
    }

    #[test]
    fn mismatched_dimensions_are_invalid_input() {
        let dir = tempfile::tempdir().unwrap();
        let err = save_capture(dir.path(), &[0u8; 5], 2, 2, at()).unwrap_err();
        assert!(matches!(err, crate::CoreError::InvalidInput(_)));
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }
}
