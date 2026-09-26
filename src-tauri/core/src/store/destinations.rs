use super::paths;
use super::Store;
use crate::{CoreError, Destination, Result};
use rusqlite::{params, OptionalExtension, Row};

fn row_to_destination(r: &Row) -> rusqlite::Result<Destination> {
    Ok(Destination {
        id: r.get(0)?,
        name: r.get(1)?,
        path: r.get(2)?,
        sort_order: r.get(3)?,
        is_default: r.get::<_, i64>(4)? == 1,
    })
}

const COLS: &str = "id, name, path, sort_order, is_default";

impl Store {
    pub fn list_destinations(&self) -> Result<Vec<Destination>> {
        let mut st = self.conn.prepare(&format!("SELECT {COLS} FROM destinations ORDER BY is_default DESC, sort_order ASC, id ASC"))?;
        let rows = st.query_map([], row_to_destination)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn default_destination(&self) -> Result<Destination> {
        Ok(self.conn.query_row(&format!("SELECT {COLS} FROM destinations WHERE is_default = 1"), [], row_to_destination)?)
    }

    pub fn get_destination(&self, id: i64) -> Result<Destination> {
        self.conn
            .query_row(&format!("SELECT {COLS} FROM destinations WHERE id = ?1"), [id], row_to_destination)
            .optional()?
            .ok_or(CoreError::NotFound)
    }

    pub fn find_destination_by_path(&self, path: &str) -> Result<Option<Destination>> {
        let want = paths::norm(path);
        Ok(self.list_destinations()?.into_iter().find(|d| paths::norm(&d.path) == want))
    }

    pub fn set_default_destination_path(&self, path: &str) -> Result<()> {
        self.conn.execute("UPDATE destinations SET path = ?1 WHERE is_default = 1", [path])?;
        Ok(())
    }

    fn validate_destination(&self, name: &str, path: &str, exclude_id: Option<i64>) -> Result<()> {
        let name = name.trim();
        let path = path.trim();
        if name.is_empty() || path.is_empty() {
            return Self::invalid("name and path are required");
        }
        let watch = self.default_destination()?.path;
        if paths::is_inside(path, &watch) {
            return Self::invalid("destination cannot be the Screenshots folder or a folder inside it");
        }
        let clash: Option<i64> = self
            .conn
            .query_row("SELECT id FROM destinations WHERE lower(name) = lower(?1)", [name], |r| r.get(0))
            .optional()?;
        if let Some(id) = clash {
            if Some(id) != exclude_id {
                return Self::invalid(format!("a destination named '{name}' already exists"));
            }
        }
        Ok(())
    }

    pub fn create_destination(&self, name: &str, path: &str) -> Result<Destination> {
        self.validate_destination(name, path, None)?;
        let next: i64 = self.conn.query_row("SELECT coalesce(max(sort_order), -1) + 1 FROM destinations WHERE is_default = 0", [], |r| r.get(0))?;
        self.conn.execute(
            "INSERT INTO destinations(name, path, sort_order, is_default) VALUES (?1, ?2, ?3, 0)",
            params![name.trim(), path.trim(), next],
        )?;
        self.get_destination(self.conn.last_insert_rowid())
    }

    pub fn update_destination(&self, id: i64, name: &str, path: &str) -> Result<()> {
        let d = self.get_destination(id)?;
        if d.is_default {
            return Self::invalid("the Default destination follows the watch folder and cannot be edited here");
        }
        self.validate_destination(name, path, Some(id))?;
        self.conn.execute("UPDATE destinations SET name = ?1, path = ?2 WHERE id = ?3", params![name.trim(), path.trim(), id])?;
        Ok(())
    }

    pub fn delete_destination(&self, id: i64, reassign_to: i64) -> Result<()> {
        let d = self.get_destination(id)?;
        if d.is_default {
            return Self::invalid("the Default destination cannot be deleted");
        }
        if id == reassign_to {
            return Self::invalid("cannot reassign to the destination being deleted");
        }
        self.get_destination(reassign_to)?;
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("UPDATE screenshots SET destination_id = ?1 WHERE destination_id = ?2", params![reassign_to, id])?;
        tx.execute("UPDATE screenshots SET pending_move_to = NULL WHERE pending_move_to = ?1", [id])?;
        tx.execute("DELETE FROM destinations WHERE id = ?1", [id])?;
        tx.commit()?;
        Ok(())
    }

    pub fn reorder_destinations(&self, ids: &[i64]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for (i, id) in ids.iter().enumerate() {
            tx.execute("UPDATE destinations SET sort_order = ?1 WHERE id = ?2 AND is_default = 0", params![i as i64, id])?;
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::store::Store;
    use crate::CoreError;

    const WATCH: &str = "C:\\Users\\me\\OneDrive\\Pictures\\Screenshots";

    #[test]
    fn open_seeds_default_destination_pointing_at_watch_folder() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let d = s.default_destination().unwrap();
        assert!(d.is_default);
        assert_eq!(d.name, "Default");
        assert_eq!(d.path, WATCH);
        assert_eq!(s.list_destinations().unwrap().len(), 1);
    }

    #[test]
    fn open_is_idempotent_and_migrations_run_once() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("t.db");
        Store::open(&db, WATCH).unwrap();
        let s = Store::open(&db, WATCH).unwrap();
        assert_eq!(s.schema_version().unwrap(), 1);
        assert_eq!(s.list_destinations().unwrap().len(), 1);
    }

    #[test]
    fn create_update_reorder_delete() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let a = s.create_destination("Embee", "D:\\Work\\Embee\\shots").unwrap();
        let b = s.create_destination("ClientX", "D:\\Work\\ClientX").unwrap();
        assert_eq!(s.list_destinations().unwrap().iter().map(|d| d.name.as_str()).collect::<Vec<_>>(), ["Default", "Embee", "ClientX"]);

        s.update_destination(a.id, "Embee Ltd", "D:\\Work\\Embee\\shots").unwrap();
        assert_eq!(s.get_destination(a.id).unwrap().name, "Embee Ltd");

        s.reorder_destinations(&[b.id, a.id]).unwrap();
        assert_eq!(s.list_destinations().unwrap().iter().map(|d| d.id).collect::<Vec<_>>(), [s.default_destination().unwrap().id, b.id, a.id]);

        s.delete_destination(b.id, a.id).unwrap();
        assert_eq!(s.list_destinations().unwrap().len(), 2);
    }

    #[test]
    fn default_cannot_be_deleted() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let d = s.default_destination().unwrap();
        let other = s.create_destination("X", "D:\\X").unwrap();
        assert!(matches!(s.delete_destination(d.id, other.id), Err(CoreError::InvalidInput(_))));
    }

    #[test]
    fn destination_inside_watch_folder_is_rejected() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let inside = format!("{WATCH}\\sub");
        assert!(matches!(s.create_destination("Bad", &inside), Err(CoreError::InvalidInput(_))));
        assert!(matches!(s.create_destination("Bad2", WATCH), Err(CoreError::InvalidInput(_))));
        // sibling with a shared prefix is fine
        let sib = format!("{WATCH}2");
        assert!(s.create_destination("Ok", &sib).is_ok());
    }

    #[test]
    fn duplicate_name_is_invalid_input() {
        let s = Store::open_in_memory(WATCH).unwrap();
        s.create_destination("Embee", "D:\\a").unwrap();
        assert!(matches!(s.create_destination("Embee", "D:\\b"), Err(CoreError::InvalidInput(_))));
        assert!(matches!(s.create_destination("embee", "D:\\b"), Err(CoreError::InvalidInput(_))), "names are case-insensitive");
    }

    #[test]
    fn find_by_path_is_case_insensitive_on_windows_style_paths() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let d = s.create_destination("Embee", "D:\\Work\\Embee").unwrap();
        assert_eq!(s.find_destination_by_path("d:\\work\\embee\\").unwrap().map(|x| x.id), Some(d.id));
        assert_eq!(s.find_destination_by_path("D:\\Other").unwrap(), None);
    }

    #[test]
    fn set_default_destination_path_moves_the_default_row() {
        let s = Store::open_in_memory(WATCH).unwrap();
        s.set_default_destination_path("E:\\Shots").unwrap();
        assert_eq!(s.default_destination().unwrap().path, "E:\\Shots");
    }
}
