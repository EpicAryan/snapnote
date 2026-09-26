use crate::{CoreError, Result};
use image::ImageFormat;
use std::path::{Path, PathBuf};

pub const THUMB_WIDTH: u32 = 320;

pub fn thumbnail_path(cache_dir: &Path, id: i64) -> PathBuf {
    cache_dir.join(format!("{id}.webp"))
}

/// Generate (once) a lossless WebP no wider than `width`, written atomically via a `.part` file.
/// Small images are not upscaled. Returns the cached path.
pub fn ensure_thumbnail(cache_dir: &Path, id: i64, source: &Path, width: u32) -> Result<PathBuf> {
    let out = thumbnail_path(cache_dir, id);
    if out.exists() {
        return Ok(out);
    }
    if !source.is_file() {
        return Err(CoreError::FileMissing(source.to_string_lossy().into_owned()));
    }
    std::fs::create_dir_all(cache_dir)?;
    let img = image::open(source).map_err(|e| CoreError::Image(e.to_string()))?;
    let target_w = width.min(img.width()).max(1);
    // Bound height too so very tall captures stay a sane size (max 4:1 portrait box).
    let thumb = img.thumbnail(target_w, target_w.saturating_mul(4));
    let tmp = cache_dir.join(format!("{id}.part"));
    if let Err(e) = thumb.save_with_format(&tmp, ImageFormat::WebP) {
        let _ = std::fs::remove_file(&tmp);
        return Err(CoreError::Image(e.to_string()));
    }
    std::fs::rename(&tmp, &out)?;
    Ok(out)
}

pub fn remove_thumbnail(cache_dir: &Path, id: i64) -> std::io::Result<()> {
    match std::fs::remove_file(thumbnail_path(cache_dir, id)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// Delete every file in the cache folder. Returns how many were removed.
pub fn clear_cache(cache_dir: &Path) -> std::io::Result<usize> {
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(cache_dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_file() && std::fs::remove_file(&p).is_ok() {
                n += 1;
            }
        }
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn png(dir: &Path, name: &str, w: u32, h: u32) -> PathBuf {
        let p = dir.join(name);
        image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x % 256) as u8, (y % 256) as u8, 128])).save(&p).unwrap();
        p
    }

    #[test]
    fn generates_a_320_wide_webp_and_reuses_it() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("thumbs");
        let src = png(dir.path(), "a.png", 1280, 720);
        let out = ensure_thumbnail(&cache, 7, &src, 320).unwrap();
        assert_eq!(out, cache.join("7.webp"));
        let img = image::open(&out).unwrap();
        assert_eq!((img.width(), img.height()), (320, 180));
        let first = fs::metadata(&out).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        ensure_thumbnail(&cache, 7, &src, 320).unwrap();
        assert_eq!(fs::metadata(&out).unwrap().modified().unwrap(), first, "must not regenerate");
    }

    #[test]
    fn small_images_are_not_upscaled() {
        let dir = tempfile::tempdir().unwrap();
        let src = png(dir.path(), "s.png", 100, 50);
        let out = ensure_thumbnail(&dir.path().join("t"), 1, &src, 320).unwrap();
        let img = image::open(out).unwrap();
        assert_eq!((img.width(), img.height()), (100, 50));
    }

    #[test]
    fn missing_source_is_file_missing_and_corrupt_source_is_image_error_without_leftovers() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("t");
        assert!(matches!(ensure_thumbnail(&cache, 1, &dir.path().join("nope.png"), 320), Err(CoreError::FileMissing(_))));
        let bad = dir.path().join("bad.png");
        fs::write(&bad, b"not a png").unwrap();
        assert!(matches!(ensure_thumbnail(&cache, 2, &bad, 320), Err(CoreError::Image(_))));
        assert!(!cache.join("2.part").exists());
        assert!(!cache.join("2.webp").exists());
    }

    #[test]
    fn remove_and_clear() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("t");
        let src = png(dir.path(), "a.png", 64, 64);
        ensure_thumbnail(&cache, 1, &src, 320).unwrap();
        ensure_thumbnail(&cache, 2, &src, 320).unwrap();
        remove_thumbnail(&cache, 1).unwrap();
        remove_thumbnail(&cache, 1).unwrap(); // idempotent
        assert_eq!(clear_cache(&cache).unwrap(), 1);
        assert!(!cache.join("2.webp").exists());
    }
}
