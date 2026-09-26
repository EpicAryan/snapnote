use crate::files::{self, Mover};
use crate::store::Store;
use crate::{slug, CoreError, Destination, DestinationChoice, Result, SaveResult, Screenshot, Status};
use std::path::{Path, PathBuf};

pub fn resolve_destination(store: &Store, choice: &DestinationChoice) -> Result<(Destination, bool)> {
    match choice {
        DestinationChoice::Existing { id } => Ok((store.get_destination(*id)?, false)),
        DestinationChoice::Browse { path } => {
            if let Some(d) = store.find_destination_by_path(path)? {
                return Ok((d, false));
            }
            let base = Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .filter(|n| !n.trim().is_empty())
                .unwrap_or("Folder")
                .to_string();
            let mut name = base.clone();
            let mut n = 2;
            loop {
                match store.create_destination(&name, path) {
                    Ok(d) => return Ok((d, true)),
                    Err(CoreError::InvalidInput(msg)) if msg.contains("already exists") => {
                        name = format!("{base}-{n}");
                        n += 1;
                    }
                    Err(e) => return Err(e),
                }
            }
        }
    }
}

/// Where the file should end up given the chosen destination and label. The Default
/// destination means "leave it where it is": only non-default destinations move files.
pub fn plan_target(shot: &Screenshot, dest: &Destination, label: &str, rename_on_label: bool) -> PathBuf {
    let current = Path::new(&shot.path);
    let dir: PathBuf = if dest.is_default {
        current.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from(&dest.path))
    } else {
        PathBuf::from(&dest.path)
    };
    let dir = dir.as_path();
    let ext = current.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let s = slug::slugify(label);
    let current_stem = current.file_stem().and_then(|x| x.to_str()).unwrap_or("screenshot").to_string();
    let stem: String = if rename_on_label && !s.is_empty() {
        slug::target_filename(slug::date_part(&shot.captured_at), &s, ext)
            .trim_end_matches(&format!(".{ext}"))
            .to_string()
    } else {
        current_stem.clone()
    };
    let current_dir = current.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    let same_dir = crate::store::paths::norm(&dir.to_string_lossy()) == crate::store::paths::norm(&current_dir);
    if same_dir && stem == current_stem {
        return current.to_path_buf();
    }
    files::unique_target(dir, &stem, ext)
}

fn apply_move(store: &Store, shot: &Screenshot, dest: &Destination, rename_on_label: bool, mover: &Mover) -> Result<SaveResult> {
    let current = PathBuf::from(&shot.path);
    if !current.exists() {
        store.set_status(shot.id, Status::Missing)?;
        return Ok(SaveResult {
            moved: false,
            renamed: false,
            path: shot.path.clone(),
            destination: dest.clone(),
            warning: Some("Saved, but the file no longer exists at its last known location".into()),
        });
    }
    let target = plan_target(shot, dest, &shot.label, rename_on_label);
    if target == current {
        store.update_path(shot.id, &shot.path, None)?;
        return Ok(SaveResult { moved: false, renamed: false, path: shot.path.clone(), destination: dest.clone(), warning: None });
    }
    let moved = target.parent() != current.parent();
    let renamed = target.file_name() != current.file_name();
    match mover(&current, &target) {
        Ok(()) => {
            store.update_path(shot.id, &target.to_string_lossy(), None)?;
            Ok(SaveResult { moved, renamed, path: target.to_string_lossy().into_owned(), destination: dest.clone(), warning: None })
        }
        Err(e) => {
            store.update_path(shot.id, &shot.path, Some(dest.id))?;
            Ok(SaveResult {
                moved: false,
                renamed: false,
                path: shot.path.clone(),
                destination: dest.clone(),
                warning: Some(format!("Saved, but the file couldn't be moved ({e}). Use Retry move from the library.")),
            })
        }
    }
}

pub fn save_metadata(
    store: &Store,
    id: i64,
    label: &str,
    notes: &str,
    choice: &DestinationChoice,
    rename_on_label: bool,
    mover: &Mover,
) -> Result<SaveResult> {
    store.get_screenshot(id)?; // NotFound early, before creating any Browse destination
    let (dest, _created) = resolve_destination(store, choice)?;
    store.update_metadata(id, label, notes, dest.id)?;
    let shot = store.get_screenshot(id)?;
    apply_move(store, &shot, &dest, rename_on_label, mover)
}

pub fn retry_move(store: &Store, id: i64, rename_on_label: bool, mover: &Mover) -> Result<SaveResult> {
    let shot = store.get_screenshot(id)?;
    let dest_id = shot.pending_move_to.unwrap_or(shot.destination_id);
    let dest = store.get_destination(dest_id)?;
    apply_move(store, &shot, &dest, rename_on_label, mover)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use crate::{CoreError, DestinationChoice};
    use std::fs;
    use std::path::Path;

    struct Fx {
        _dir: tempfile::TempDir,
        watch: std::path::PathBuf,
        store: Store,
        shot_id: i64,
    }

    fn fixture() -> Fx {
        let dir = tempfile::tempdir().unwrap();
        let watch = dir.path().join("Screenshots");
        fs::create_dir_all(&watch).unwrap();
        let store = Store::open_in_memory(&watch.to_string_lossy()).unwrap();
        let file = watch.join("Screenshot 2026-09-26 015747.png");
        fs::write(&file, b"img").unwrap();
        let shot = crate::ingest::ingest_new_file(&store, &file).unwrap();
        Fx { _dir: dir, watch, store, shot_id: shot.id }
    }

    fn ok_mover() -> Box<crate::files::Mover> {
        Box::new(|s, d| crate::files::move_file(s, d))
    }

    fn failing_mover() -> Box<crate::files::Mover> {
        Box::new(|_, _| Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "locked")))
    }

    #[test]
    fn label_only_renames_in_place() {
        let fx = fixture();
        let default = fx.store.default_destination().unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "Invoice Timeout", "n", &DestinationChoice::Existing { id: default.id }, true, &*ok_mover()).unwrap();
        assert!(r.renamed && !r.moved && r.warning.is_none());
        assert_eq!(Path::new(&r.path), fx.watch.join("2026-09-26 invoice-timeout.png"));
        assert!(fx.watch.join("2026-09-26 invoice-timeout.png").exists());
        let shot = fx.store.get_screenshot(fx.shot_id).unwrap();
        assert_eq!((shot.label.as_str(), shot.notes.as_str()), ("Invoice Timeout", "n"));
        assert_eq!(shot.path, r.path);
    }

    #[test]
    fn rename_disabled_keeps_filename() {
        let fx = fixture();
        let default = fx.store.default_destination().unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "Label", "", &DestinationChoice::Existing { id: default.id }, false, &*ok_mover()).unwrap();
        assert!(!r.renamed && !r.moved);
        assert!(fx.watch.join("Screenshot 2026-09-26 015747.png").exists());
    }

    #[test]
    fn empty_label_keeps_filename_but_saves_notes() {
        let fx = fixture();
        let default = fx.store.default_destination().unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "  ", "just notes", &DestinationChoice::Existing { id: default.id }, true, &*ok_mover()).unwrap();
        assert!(!r.renamed);
        assert_eq!(fx.store.get_screenshot(fx.shot_id).unwrap().notes, "just notes");
    }

    #[test]
    fn label_that_slugifies_to_nothing_is_saved_without_rename() {
        let fx = fixture();
        let default = fx.store.default_destination().unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "???", "", &DestinationChoice::Existing { id: default.id }, true, &*ok_mover()).unwrap();
        assert!(!r.renamed && r.warning.is_none());
        assert!(fx.watch.join("Screenshot 2026-09-26 015747.png").exists());
        assert_eq!(fx.store.get_screenshot(fx.shot_id).unwrap().label, "???");
    }

    #[test]
    fn default_destination_renames_in_place_even_after_watch_folder_changed() {
        let fx = fixture();
        fx.store.set_default_destination_path("Z:\\elsewhere").unwrap();
        let default = fx.store.default_destination().unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "stay", "", &DestinationChoice::Existing { id: default.id }, true, &*ok_mover()).unwrap();
        assert!(r.renamed && !r.moved);
        assert!(fx.watch.join("2026-09-26 stay.png").exists());
    }

    #[test]
    fn destination_moves_and_renames() {
        let fx = fixture();
        let target = fx._dir.path().join("Embee");
        fs::create_dir_all(&target).unwrap();
        let dest = fx.store.create_destination("Embee", &target.to_string_lossy()).unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "sync err", "", &DestinationChoice::Existing { id: dest.id }, true, &*ok_mover()).unwrap();
        assert!(r.moved && r.renamed);
        assert_eq!(r.destination.id, dest.id);
        assert!(target.join("2026-09-26 sync-err.png").exists());
        assert!(!fx.watch.join("Screenshot 2026-09-26 015747.png").exists());
    }

    #[test]
    fn collision_gets_suffix() {
        let fx = fixture();
        let default = fx.store.default_destination().unwrap();
        fs::write(fx.watch.join("2026-09-26 dup.png"), b"other").unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "dup", "", &DestinationChoice::Existing { id: default.id }, true, &*ok_mover()).unwrap();
        assert_eq!(Path::new(&r.path), fx.watch.join("2026-09-26 dup-2.png"));
    }

    #[test]
    fn browse_creates_destination_named_after_folder() {
        let fx = fixture();
        let target = fx._dir.path().join("ClientX");
        fs::create_dir_all(&target).unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "", "", &DestinationChoice::Browse { path: target.to_string_lossy().into_owned() }, true, &*ok_mover()).unwrap();
        assert!(r.moved);
        assert_eq!(r.destination.name, "ClientX");
        assert_eq!(fx.store.list_destinations().unwrap().len(), 2);
        // second browse to the same folder reuses it
        let (d2, created) = resolve_destination(&fx.store, &DestinationChoice::Browse { path: target.to_string_lossy().into_owned() }).unwrap();
        assert_eq!(d2.id, r.destination.id);
        assert!(!created);
    }

    #[test]
    fn browse_name_clash_gets_suffix() {
        let fx = fixture();
        fx.store.create_destination("ClientX", "D:\\elsewhere").unwrap();
        let target = fx._dir.path().join("ClientX");
        fs::create_dir_all(&target).unwrap();
        let (d, created) = resolve_destination(&fx.store, &DestinationChoice::Browse { path: target.to_string_lossy().into_owned() }).unwrap();
        assert!(created);
        assert_eq!(d.name, "ClientX-2");
    }

    #[test]
    fn failed_move_keeps_metadata_leaves_path_and_sets_pending() {
        let fx = fixture();
        let target = fx._dir.path().join("Embee");
        fs::create_dir_all(&target).unwrap();
        let dest = fx.store.create_destination("Embee", &target.to_string_lossy()).unwrap();
        let before = fx.store.get_screenshot(fx.shot_id).unwrap().path.clone();
        let r = save_metadata(&fx.store, fx.shot_id, "x", "y", &DestinationChoice::Existing { id: dest.id }, true, &*failing_mover()).unwrap();
        assert!(!r.moved && !r.renamed);
        assert!(r.warning.as_deref().unwrap().contains("couldn't be moved"));
        let shot = fx.store.get_screenshot(fx.shot_id).unwrap();
        assert_eq!(shot.path, before);
        assert_eq!(shot.label, "x");
        assert_eq!(shot.pending_move_to, Some(dest.id));
        assert!(Path::new(&before).exists());
    }

    #[test]
    fn retry_move_completes_a_pending_move() {
        let fx = fixture();
        let target = fx._dir.path().join("Embee");
        fs::create_dir_all(&target).unwrap();
        let dest = fx.store.create_destination("Embee", &target.to_string_lossy()).unwrap();
        save_metadata(&fx.store, fx.shot_id, "x", "", &DestinationChoice::Existing { id: dest.id }, true, &*failing_mover()).unwrap();
        let r = retry_move(&fx.store, fx.shot_id, true, &*ok_mover()).unwrap();
        assert!(r.moved && r.warning.is_none());
        assert_eq!(fx.store.get_screenshot(fx.shot_id).unwrap().pending_move_to, None);
        assert!(target.join("2026-09-26 x.png").exists());
    }

    #[test]
    fn saving_a_missing_file_saves_metadata_and_marks_missing() {
        let fx = fixture();
        let default = fx.store.default_destination().unwrap();
        fs::remove_file(fx.watch.join("Screenshot 2026-09-26 015747.png")).unwrap();
        let r = save_metadata(&fx.store, fx.shot_id, "gone", "", &DestinationChoice::Existing { id: default.id }, true, &*ok_mover()).unwrap();
        assert!(r.warning.as_deref().unwrap().contains("no longer exists"));
        let shot = fx.store.get_screenshot(fx.shot_id).unwrap();
        assert_eq!(shot.status, crate::Status::Missing);
        assert_eq!(shot.label, "gone");
    }

    #[test]
    fn unknown_id_is_not_found() {
        let fx = fixture();
        let default = fx.store.default_destination().unwrap();
        assert!(matches!(
            save_metadata(&fx.store, 9999, "", "", &DestinationChoice::Existing { id: default.id }, true, &*ok_mover()),
            Err(CoreError::NotFound)
        ));
    }
}
