use crate::store::Store;
use crate::{captured_at, files, CoreError, NewScreenshot, Result, Screenshot};
use std::path::Path;

/// Describe a file for insertion. With `compute_hash = false` the file's contents are never
/// read and `hash` is empty, so bulk import cannot hydrate OneDrive placeholders.
pub fn describe_file(path: &Path, destination_id: i64, compute_hash: bool) -> Result<NewScreenshot> {
    let meta = std::fs::metadata(path).map_err(|_| CoreError::FileMissing(path.to_string_lossy().into_owned()))?;
    Ok(NewScreenshot {
        path: path.to_string_lossy().into_owned(),
        original_name: path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
        captured_at: captured_at::for_path(path),
        size_bytes: meta.len() as i64,
        hash: if compute_hash { files::hash_file(path)? } else { String::new() },
        destination_id,
    })
}

pub fn ingest_new_file(store: &Store, path: &Path) -> Result<Screenshot> {
    let dest = store.default_destination()?;
    let new = describe_file(path, dest.id, true)?;
    store.insert_screenshot(&new)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use std::fs;

    #[test]
    fn describe_file_fills_every_field() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Screenshot 2026-09-26 015747.png");
        fs::write(&p, b"png-bytes").unwrap();
        let n = describe_file(&p, 7, true).unwrap();
        assert_eq!(n.original_name, "Screenshot 2026-09-26 015747.png");
        assert_eq!(n.captured_at, "2026-09-26T01:57:47");
        assert_eq!(n.size_bytes, 9);
        assert_eq!(n.hash.len(), 64);
        assert_eq!(n.destination_id, 7);
        assert_eq!(n.path, p.to_string_lossy());
    }

    #[test]
    fn describe_file_can_skip_hashing_for_bulk_import() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.png");
        fs::write(&p, b"x").unwrap();
        assert_eq!(describe_file(&p, 1, false).unwrap().hash, "");
    }

    #[test]
    fn ingest_inserts_under_default_destination_and_rejects_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.png");
        fs::write(&p, b"x").unwrap();
        let s = Store::open_in_memory(&dir.path().to_string_lossy()).unwrap();
        let shot = ingest_new_file(&s, &p).unwrap();
        assert_eq!(shot.destination_id, s.default_destination().unwrap().id);
        assert!(ingest_new_file(&s, &p).is_err());
    }

    #[test]
    fn ingest_of_missing_file_is_file_missing() {
        let s = Store::open_in_memory("C:\\Shots").unwrap();
        let err = ingest_new_file(&s, std::path::Path::new("C:\\Shots\\nope.png")).unwrap_err();
        assert!(matches!(err, crate::CoreError::FileMissing(_)));
    }
}
