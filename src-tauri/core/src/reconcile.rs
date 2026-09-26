use crate::store::Store;
use crate::{Result, Status};
use std::path::Path;

/// Flip rows whose file vanished to `missing`, restore `present` for files that came back.
/// Returns how many rows were flipped to missing.
pub fn mark_missing(store: &Store) -> Result<usize> {
    let mut flipped = 0;
    for (id, path) in store.all_paths()? {
        let exists = Path::new(&path).exists();
        let current = store.get_screenshot(id)?.status;
        match (exists, current) {
            (false, Status::Present) => {
                store.set_status(id, Status::Missing)?;
                flipped += 1;
            }
            (true, Status::Missing) => store.set_status(id, Status::Present)?,
            _ => {}
        }
    }
    Ok(flipped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use crate::Status;
    use std::fs;

    #[test]
    fn flips_missing_and_restores_present() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open_in_memory(&dir.path().to_string_lossy()).unwrap();
        let keep = dir.path().join("keep.png");
        let gone = dir.path().join("gone.png");
        fs::write(&keep, b"k").unwrap();
        fs::write(&gone, b"g").unwrap();
        let k = crate::ingest::ingest_new_file(&s, &keep).unwrap();
        let g = crate::ingest::ingest_new_file(&s, &gone).unwrap();
        fs::remove_file(&gone).unwrap();
        s.set_status(k.id, Status::Missing).unwrap(); // stale flag that should be corrected

        assert_eq!(mark_missing(&s).unwrap(), 1);
        assert_eq!(s.get_screenshot(g.id).unwrap().status, Status::Missing);
        assert_eq!(s.get_screenshot(k.id).unwrap().status, Status::Present);
    }
}
