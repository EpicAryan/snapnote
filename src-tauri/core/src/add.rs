//! Adding images that did not arrive through the watcher: pasted or dropped from Explorer.

use crate::store::{paths, Store};
use crate::{files, ingest, CoreError, Result, Screenshot};
use std::path::{Path, PathBuf};

pub const IMAGE_EXTENSIONS: [&str; 8] = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AddPlan {
    /// Already in the library.
    Tracked(i64),
    /// Directly inside a destination folder (the Screenshots folder included): track it where it is.
    InPlace { destination_id: i64 },
    /// Anywhere else: copy into the Screenshots folder, where the watcher picks it up.
    CopyIn,
    Skip(String),
}

pub fn is_image(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTENSIONS.iter().any(|x| x.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

fn is_png(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false)
}

pub fn plan_add(store: &Store, src: &Path) -> Result<AddPlan> {
    if src.is_dir() {
        return Ok(AddPlan::Skip("folders cannot be added".into()));
    }
    if !src.is_file() {
        return Ok(AddPlan::Skip("file not found".into()));
    }
    if !is_image(src) {
        return Ok(AddPlan::Skip("not an image".into()));
    }
    let key = paths::norm(&src.to_string_lossy());
    if let Some((id, _)) = store.all_paths()?.into_iter().find(|(_, p)| paths::norm(p) == key) {
        return Ok(AddPlan::Tracked(id));
    }
    if let Some(parent) = src.parent() {
        let parent = paths::norm(&parent.to_string_lossy());
        if let Some(d) = store.list_destinations()?.into_iter().find(|d| paths::norm(&d.path) == parent) {
            return Ok(AddPlan::InPlace { destination_id: d.id });
        }
    }
    Ok(AddPlan::CopyIn)
}

/// Copy `src` into `folder` as a PNG named after the source. Written to a `.part` file and
/// renamed, so the watcher only ever sees a finished PNG. Other image formats are converted,
/// and the source's modified time is carried over so `captured_at` stays the original time.
pub fn copy_in(src: &Path, folder: &Path) -> Result<PathBuf> {
    let stem = src.file_stem().and_then(|s| s.to_str()).filter(|s| !s.is_empty()).unwrap_or("image");
    let target = files::unique_target(folder, stem, "png");
    let tmp = target.with_extension("part");
    let written = write_png_copy(src, &tmp).and_then(|_| Ok(std::fs::rename(&tmp, &target)?));
    if written.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    written.map(|_| target)
}

fn write_png_copy(src: &Path, tmp: &Path) -> Result<()> {
    if is_png(src) {
        std::fs::copy(src, tmp)?;
    } else {
        let img = image::open(src).map_err(|e| CoreError::Image(e.to_string()))?;
        img.save_with_format(tmp, image::ImageFormat::Png).map_err(|e| CoreError::Image(e.to_string()))?;
    }
    if let Ok(modified) = std::fs::metadata(src).and_then(|m| m.modified()) {
        let _ = std::fs::File::options().write(true).open(tmp).and_then(|f| f.set_modified(modified));
    }
    Ok(())
}

pub fn track_in_place(store: &Store, src: &Path, destination_id: i64) -> Result<Screenshot> {
    let new = ingest::describe_file(src, destination_id, true)?;
    store.insert_screenshot(&new)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime};

    struct Fx {
        _dir: tempfile::TempDir,
        watch: PathBuf,
        other: PathBuf,
        work: PathBuf,
        store: Store,
    }

    fn fx() -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let watch = dir.path().join("Screenshots");
        let other = dir.path().join("Other");
        let work = dir.path().join("Work");
        for d in [&watch, &other, &work] {
            fs::create_dir_all(d).unwrap();
        }
        let store = Store::open_in_memory(&watch.to_string_lossy()).unwrap();
        store.create_destination("Work", &work.to_string_lossy()).unwrap();
        Fx { _dir: dir, watch, other, work, store }
    }

    fn write_png(path: &Path, w: u32, h: u32) {
        image::RgbaImage::from_pixel(w, h, image::Rgba([10, 20, 30, 255])).save(path).unwrap();
    }

    #[test]
    fn plans_by_where_the_file_lives() {
        let f = fx();
        let tracked = f.watch.join("tracked.png");
        write_png(&tracked, 2, 2);
        let shot = crate::ingest::ingest_new_file(&f.store, &tracked).unwrap();
        let old = f.watch.join("old.png");
        write_png(&old, 2, 2);
        let in_work = f.work.join("in-work.png");
        write_png(&in_work, 2, 2);
        let elsewhere = f.other.join("photo.jpg");
        image::RgbImage::new(2, 2).save_with_format(&elsewhere, image::ImageFormat::Jpeg).unwrap();
        fs::write(f.other.join("notes.txt"), b"x").unwrap();

        assert_eq!(plan_add(&f.store, &tracked).unwrap(), AddPlan::Tracked(shot.id));
        let default_id = f.store.default_destination().unwrap().id;
        assert_eq!(plan_add(&f.store, &old).unwrap(), AddPlan::InPlace { destination_id: default_id }, "untracked file in the Screenshots folder is tracked where it is");
        let work_id = f.store.find_destination_by_path(&f.work.to_string_lossy()).unwrap().unwrap().id;
        assert_eq!(plan_add(&f.store, &in_work).unwrap(), AddPlan::InPlace { destination_id: work_id }, "a file already inside a destination stays there");
        assert_eq!(plan_add(&f.store, &elsewhere).unwrap(), AddPlan::CopyIn);
        assert!(matches!(plan_add(&f.store, &f.other.join("notes.txt")).unwrap(), AddPlan::Skip(_)));
        assert!(matches!(plan_add(&f.store, &f.other).unwrap(), AddPlan::Skip(_)), "folders are skipped");
        assert!(matches!(plan_add(&f.store, &f.other.join("nope.png")).unwrap(), AddPlan::Skip(_)));
    }

    #[cfg(windows)]
    #[test]
    fn tracked_lookup_ignores_case() {
        let f = fx();
        let tracked = f.watch.join("Tracked.png");
        write_png(&tracked, 2, 2);
        let shot = crate::ingest::ingest_new_file(&f.store, &tracked).unwrap();
        let shouted = PathBuf::from(tracked.to_string_lossy().to_uppercase());
        assert_eq!(plan_add(&f.store, &shouted).unwrap(), AddPlan::Tracked(shot.id));
    }

    #[test]
    fn copy_in_keeps_png_bytes_and_name_and_leaves_no_temp_file() {
        let f = fx();
        let src = f.other.join("shot.png");
        write_png(&src, 3, 2);
        let target = copy_in(&src, &f.watch).unwrap();
        assert_eq!(target, f.watch.join("shot.png"));
        assert_eq!(fs::read(&src).unwrap(), fs::read(&target).unwrap());
        let leftovers: Vec<_> = fs::read_dir(&f.watch).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.ends_with(".part")).collect();
        assert!(leftovers.is_empty(), "temp file left behind: {leftovers:?}");
        assert_eq!(copy_in(&src, &f.watch).unwrap(), f.watch.join("shot-2.png"), "second copy gets a suffix");
    }

    #[test]
    fn copy_in_converts_other_formats_to_png_and_carries_the_modified_time() {
        let f = fx();
        let src = f.other.join("photo.jpg");
        image::RgbImage::from_pixel(4, 3, image::Rgb([200, 100, 50])).save_with_format(&src, image::ImageFormat::Jpeg).unwrap();
        let when = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        fs::File::options().write(true).open(&src).unwrap().set_modified(when).unwrap();

        let target = copy_in(&src, &f.watch).unwrap();
        assert_eq!(target, f.watch.join("photo.png"));
        let bytes = fs::read(&target).unwrap();
        assert_eq!(&bytes[..4], b"\x89PNG", "converted to a real PNG");
        let img = image::open(&target).unwrap();
        assert_eq!((img.width(), img.height()), (4, 3));
        let got = fs::metadata(&target).unwrap().modified().unwrap();
        let drift = got.duration_since(when).or_else(|_| when.duration_since(got)).unwrap();
        assert!(drift < Duration::from_secs(2), "modified time not carried over: {drift:?}");
    }

    #[test]
    fn copy_in_of_a_broken_image_fails_cleanly() {
        let f = fx();
        let src = f.other.join("broken.jpg");
        fs::write(&src, b"not a jpeg").unwrap();
        assert!(copy_in(&src, &f.watch).is_err());
        assert_eq!(fs::read_dir(&f.watch).unwrap().count(), 0, "nothing written to the Screenshots folder");
    }

    #[test]
    fn track_in_place_inserts_under_the_given_destination_with_a_hash() {
        let f = fx();
        let p = f.work.join("kept.png");
        write_png(&p, 2, 2);
        let work_id = f.store.find_destination_by_path(&f.work.to_string_lossy()).unwrap().unwrap().id;
        let shot = track_in_place(&f.store, &p, work_id).unwrap();
        assert_eq!(shot.destination_id, work_id);
        assert_eq!(shot.hash.len(), 64);
        assert_eq!(shot.path, p.to_string_lossy());
        assert!(track_in_place(&f.store, &p, work_id).is_err(), "second insert is a duplicate");
    }

    #[test]
    fn image_extensions_are_case_insensitive() {
        assert!(is_image(Path::new("a.PNG")));
        assert!(is_image(Path::new("a.jpeg")));
        assert!(is_image(Path::new("a.webp")));
        assert!(!is_image(Path::new("a.txt")));
        assert!(!is_image(Path::new("noext")));
    }
}
