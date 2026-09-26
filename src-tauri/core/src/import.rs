use crate::store::{paths, Store};
use crate::{ingest, ImportReport, Result};
use std::path::Path;

fn is_png(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false)
}

/// Track every untracked PNG directly inside `folder`. Reads directory entries and metadata
/// only, never file contents, so OneDrive placeholders are not downloaded.
pub fn import_folder(store: &Store, folder: &Path, progress: &mut dyn FnMut(usize, usize)) -> Result<ImportReport> {
    let mut candidates: Vec<_> = std::fs::read_dir(folder)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_png(p))
        .collect();
    candidates.sort();
    let tracked = store.tracked_paths_in(&folder.to_string_lossy())?;
    let default_id = store.default_destination()?.id;
    let total = candidates.len();
    let mut report = ImportReport { added: 0, skipped: 0 };
    for (i, p) in candidates.iter().enumerate() {
        if tracked.contains(&paths::norm(&p.to_string_lossy())) {
            report.skipped += 1;
        } else {
            match ingest::describe_file(p, default_id, false).and_then(|n| store.insert_screenshot(&n)) {
                Ok(_) => report.added += 1,
                Err(_) => report.skipped += 1,
            }
        }
        progress(i + 1, total);
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use std::fs;

    #[test]
    fn imports_only_untracked_pngs_non_recursively_and_reports_progress() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open_in_memory(&dir.path().to_string_lossy()).unwrap();
        fs::write(dir.path().join("Screenshot 2026-09-26 010000.png"), b"a").unwrap();
        fs::write(dir.path().join("b.PNG"), b"b").unwrap();
        fs::write(dir.path().join("notes.txt"), b"c").unwrap();
        fs::create_dir_all(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub").join("deep.png"), b"d").unwrap();
        crate::ingest::ingest_new_file(&s, &dir.path().join("b.PNG")).unwrap();

        let mut ticks = Vec::new();
        let report = import_folder(&s, dir.path(), &mut |done, total| ticks.push((done, total))).unwrap();
        assert_eq!(report, crate::ImportReport { added: 1, skipped: 1 });
        assert_eq!(ticks.last(), Some(&(2, 2)));
        assert_eq!(s.all_paths().unwrap().len(), 2);
        let imported = s.get_by_path(&dir.path().join("Screenshot 2026-09-26 010000.png").to_string_lossy()).unwrap().unwrap();
        assert_eq!(imported.hash, "", "import must not read file contents");
        assert_eq!(imported.captured_at, "2026-09-26T01:00:00");
    }

    #[test]
    fn second_import_adds_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open_in_memory(&dir.path().to_string_lossy()).unwrap();
        fs::write(dir.path().join("a.png"), b"a").unwrap();
        import_folder(&s, dir.path(), &mut |_, _| {}).unwrap();
        let again = import_folder(&s, dir.path(), &mut |_, _| {}).unwrap();
        assert_eq!(again, crate::ImportReport { added: 0, skipped: 1 });
    }

    #[test]
    fn missing_folder_is_io_error() {
        let s = Store::open_in_memory("C:\\Shots").unwrap();
        assert!(import_folder(&s, std::path::Path::new("C:\\definitely\\not\\here"), &mut |_, _| {}).is_err());
    }
}
