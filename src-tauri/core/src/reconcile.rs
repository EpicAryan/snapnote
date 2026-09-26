use crate::store::Store;
use crate::{Result, Status};
use std::path::Path;

/// Decide which rows need their status flipped, from a snapshot of rows and an existence
/// check. Pure: callers can run it without holding the store lock.
pub fn plan(rows: &[(i64, String, Status)], exists: impl Fn(&Path) -> bool) -> Vec<(i64, Status)> {
    rows.iter()
        .filter_map(|(id, path, status)| match (exists(Path::new(path)), status) {
            (false, Status::Present) => Some((*id, Status::Missing)),
            (true, Status::Missing) => Some((*id, Status::Present)),
            _ => None,
        })
        .collect()
}

/// Apply planned flips. Returns how many rows became missing.
pub fn apply(store: &Store, changes: &[(i64, Status)]) -> Result<usize> {
    let mut flipped = 0;
    for (id, status) in changes {
        store.set_status(*id, *status)?;
        if *status == Status::Missing {
            flipped += 1;
        }
    }
    Ok(flipped)
}

/// Snapshot, plan and apply in one go (holds the store for the whole walk; the app splits it).
pub fn mark_missing(store: &Store) -> Result<usize> {
    let rows = store.all_rows_status()?;
    let changes = plan(&rows, |p| p.exists());
    apply(store, &changes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use crate::Status;
    use std::fs;

    #[test]
    fn plan_flips_only_rows_whose_existence_disagrees_with_their_status() {
        let rows = vec![
            (1, "a".to_string(), Status::Present),
            (2, "b".to_string(), Status::Present),
            (3, "c".to_string(), Status::Missing),
            (4, "d".to_string(), Status::Missing),
        ];
        let changes = plan(&rows, |p| matches!(p.to_str(), Some("a") | Some("d")));
        assert_eq!(changes, vec![(2, Status::Missing), (4, Status::Present)]);
    }

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
