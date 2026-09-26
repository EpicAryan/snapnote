use super::paths;
use super::Store;
use crate::{CoreError, NewScreenshot, Result, Screenshot, Status};
use rusqlite::{params, OptionalExtension, Row};
use std::collections::HashSet;

pub(crate) const SHOT_COLS: &str = "id, path, original_name, captured_at, size_bytes, hash, label, notes, destination_id, status, pending_move_to, created_at, updated_at";

pub(crate) fn row_to_screenshot(r: &Row) -> rusqlite::Result<Screenshot> {
    Ok(Screenshot {
        id: r.get(0)?,
        path: r.get(1)?,
        original_name: r.get(2)?,
        captured_at: r.get(3)?,
        size_bytes: r.get(4)?,
        hash: r.get(5)?,
        label: r.get(6)?,
        notes: r.get(7)?,
        destination_id: r.get(8)?,
        status: Status::parse(&r.get::<_, String>(9)?),
        pending_move_to: r.get(10)?,
        created_at: r.get(11)?,
        updated_at: r.get(12)?,
    })
}

impl Store {
    pub fn insert_screenshot(&self, new: &NewScreenshot) -> Result<Screenshot> {
        if self.get_by_path(&new.path)?.is_some() {
            return Self::invalid(format!("already tracked: {}", new.path));
        }
        self.conn.execute(
            "INSERT INTO screenshots(path, original_name, captured_at, size_bytes, hash, destination_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![new.path, new.original_name, new.captured_at, new.size_bytes, new.hash, new.destination_id],
        )?;
        self.get_screenshot(self.conn.last_insert_rowid())
    }

    pub fn get_screenshot(&self, id: i64) -> Result<Screenshot> {
        self.conn
            .query_row(&format!("SELECT {SHOT_COLS} FROM screenshots WHERE id = ?1"), [id], row_to_screenshot)
            .optional()?
            .ok_or(CoreError::NotFound)
    }

    pub fn get_by_path(&self, path: &str) -> Result<Option<Screenshot>> {
        Ok(self
            .conn
            .query_row(&format!("SELECT {SHOT_COLS} FROM screenshots WHERE path = ?1"), [path], row_to_screenshot)
            .optional()?)
    }

    pub fn newest_screenshot(&self) -> Result<Option<Screenshot>> {
        Ok(self
            .conn
            .query_row(&format!("SELECT {SHOT_COLS} FROM screenshots ORDER BY captured_at DESC, id DESC LIMIT 1"), [], row_to_screenshot)
            .optional()?)
    }

    pub fn update_metadata(&self, id: i64, label: &str, notes: &str, destination_id: i64) -> Result<()> {
        self.get_destination(destination_id)?;
        let n = self.conn.execute(
            "UPDATE screenshots SET label = ?1, notes = ?2, destination_id = ?3, updated_at = datetime('now') WHERE id = ?4",
            params![label.trim(), notes.trim(), destination_id, id],
        )?;
        if n == 0 {
            return Err(CoreError::NotFound);
        }
        Ok(())
    }

    pub fn update_path(&self, id: i64, path: &str, pending_move_to: Option<i64>) -> Result<()> {
        let n = self.conn.execute(
            "UPDATE screenshots SET path = ?1, pending_move_to = ?2, status = 'present', updated_at = datetime('now') WHERE id = ?3",
            params![path, pending_move_to, id],
        )?;
        if n == 0 {
            return Err(CoreError::NotFound);
        }
        Ok(())
    }

    pub fn set_status(&self, id: i64, status: Status) -> Result<()> {
        let n = self.conn.execute("UPDATE screenshots SET status = ?1 WHERE id = ?2", params![status.as_str(), id])?;
        if n == 0 {
            return Err(CoreError::NotFound);
        }
        Ok(())
    }

    pub fn update_hash(&self, id: i64, hash: &str) -> Result<()> {
        let n = self.conn.execute("UPDATE screenshots SET hash = ?1 WHERE id = ?2", params![hash, id])?;
        if n == 0 {
            return Err(CoreError::NotFound);
        }
        Ok(())
    }

    pub fn delete_screenshot(&self, id: i64) -> Result<()> {
        let n = self.conn.execute("DELETE FROM screenshots WHERE id = ?1", [id])?;
        if n == 0 {
            return Err(CoreError::NotFound);
        }
        Ok(())
    }

    pub fn all_paths(&self) -> Result<Vec<(i64, String)>> {
        let mut st = self.conn.prepare("SELECT id, path FROM screenshots")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// One query for startup reconciliation: (id, path, status) for every row.
    pub fn all_rows_status(&self) -> Result<Vec<(i64, String, Status)>> {
        let mut st = self.conn.prepare("SELECT id, path, status FROM screenshots")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, Status::parse(&r.get::<_, String>(2)?))))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn tracked_paths_in(&self, folder: &str) -> Result<HashSet<String>> {
        Ok(self
            .all_paths()?
            .into_iter()
            .map(|(_, p)| p)
            .filter(|p| paths::is_inside(p, folder))
            .map(|p| paths::norm(&p))
            .collect())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use crate::store::Store;
    use crate::{CoreError, NewScreenshot, Status};

    pub(crate) const WATCH: &str = "C:\\Shots";

    pub(crate) fn new_shot(store: &Store, name: &str, captured_at: &str) -> NewScreenshot {
        NewScreenshot {
            path: format!("{WATCH}\\{name}"),
            original_name: name.to_string(),
            captured_at: captured_at.to_string(),
            size_bytes: 123,
            hash: format!("hash-{name}"),
            destination_id: store.default_destination().unwrap().id,
        }
    }

    #[test]
    fn insert_and_get_round_trip() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let shot = s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();
        assert_eq!(shot.label, "");
        assert_eq!(shot.status, Status::Present);
        assert_eq!(shot.pending_move_to, None);
        assert_eq!(s.get_screenshot(shot.id).unwrap(), shot);
        assert_eq!(s.get_by_path(&format!("{WATCH}\\a.png")).unwrap().map(|x| x.id), Some(shot.id));
        assert!(matches!(s.get_screenshot(999), Err(CoreError::NotFound)));
    }

    #[test]
    fn duplicate_path_is_invalid_input() {
        let s = Store::open_in_memory(WATCH).unwrap();
        s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();
        assert!(matches!(s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")), Err(CoreError::InvalidInput(_))));
    }

    #[test]
    fn newest_is_by_captured_at_then_id() {
        let s = Store::open_in_memory(WATCH).unwrap();
        assert!(s.newest_screenshot().unwrap().is_none());
        s.insert_screenshot(&new_shot(&s, "old.png", "2026-09-25T01:00:00")).unwrap();
        let newest = s.insert_screenshot(&new_shot(&s, "new.png", "2026-09-26T01:00:00")).unwrap();
        s.insert_screenshot(&new_shot(&s, "older.png", "2026-09-24T01:00:00")).unwrap();
        assert_eq!(s.newest_screenshot().unwrap().unwrap().id, newest.id);
    }

    #[test]
    fn update_metadata_path_status_and_delete() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let dest = s.create_destination("Embee", "D:\\Embee").unwrap();
        let shot = s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();

        s.update_metadata(shot.id, "Invoice", "notes here", dest.id).unwrap();
        let got = s.get_screenshot(shot.id).unwrap();
        assert_eq!((got.label.as_str(), got.notes.as_str(), got.destination_id), ("Invoice", "notes here", dest.id));
        assert!(got.updated_at >= shot.updated_at);

        s.update_path(shot.id, "D:\\Embee\\2026-09-26 invoice.png", None).unwrap();
        assert_eq!(s.get_screenshot(shot.id).unwrap().path, "D:\\Embee\\2026-09-26 invoice.png");

        s.update_path(shot.id, "D:\\Embee\\2026-09-26 invoice.png", Some(dest.id)).unwrap();
        assert_eq!(s.get_screenshot(shot.id).unwrap().pending_move_to, Some(dest.id));

        s.set_status(shot.id, Status::Missing).unwrap();
        assert_eq!(s.get_screenshot(shot.id).unwrap().status, Status::Missing);

        s.update_hash(shot.id, "abc").unwrap();
        assert_eq!(s.get_screenshot(shot.id).unwrap().hash, "abc");

        s.delete_screenshot(shot.id).unwrap();
        assert!(matches!(s.get_screenshot(shot.id), Err(CoreError::NotFound)));
    }

    #[test]
    fn update_metadata_with_unknown_destination_fails() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let shot = s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();
        assert!(s.update_metadata(shot.id, "x", "", 4242).is_err());
    }

    #[test]
    fn all_paths_and_tracked_paths_in() {
        let s = Store::open_in_memory(WATCH).unwrap();
        s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();
        let mut other = new_shot(&s, "b.png", "2026-09-26T01:00:00");
        other.path = "D:\\Elsewhere\\b.png".into();
        s.insert_screenshot(&other).unwrap();
        assert_eq!(s.all_paths().unwrap().len(), 2);
        let inside = s.tracked_paths_in(WATCH).unwrap();
        assert_eq!(inside.len(), 1);
        assert!(inside.contains(&crate::store::paths::norm(&format!("{WATCH}\\a.png"))));
    }
}
