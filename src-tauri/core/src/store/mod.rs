pub mod destinations;
pub mod paths;
pub mod screenshots;
pub mod search;
pub mod settings;

use crate::{CoreError, Result};
use rusqlite::Connection;
use std::path::Path;

const MIGRATIONS: &[(i32, &str)] = &[
    (1, include_str!("../../migrations/0001_init.sql")),
    (2, include_str!("../../migrations/0002_tags.sql")),
];

pub struct Store {
    pub(crate) conn: Connection,
}

impl Store {
    pub fn open(db_path: &Path, watch_folder: &str) -> Result<Store> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(db_path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Self::init(conn, watch_folder)
    }

    pub fn open_in_memory(watch_folder: &str) -> Result<Store> {
        Self::init(Connection::open_in_memory()?, watch_folder)
    }

    fn init(conn: Connection, watch_folder: &str) -> Result<Store> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let store = Store { conn };
        store.migrate()?;
        store.seed_default_destination(watch_folder)?;
        Ok(store)
    }

    fn migrate(&self) -> Result<()> {
        let current: i32 = self.conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        for (version, sql) in MIGRATIONS {
            if *version > current {
                self.conn.execute_batch(&format!("BEGIN; {sql} PRAGMA user_version = {version}; COMMIT;"))?;
            }
        }
        Ok(())
    }

    pub fn schema_version(&self) -> Result<i32> {
        Ok(self.conn.pragma_query_value(None, "user_version", |r| r.get(0))?)
    }

    fn seed_default_destination(&self, watch_folder: &str) -> Result<()> {
        let exists: i64 = self.conn.query_row("SELECT count(*) FROM destinations WHERE is_default = 1", [], |r| r.get(0))?;
        if exists == 0 {
            self.conn.execute(
                "INSERT INTO destinations(name, path, sort_order, is_default) VALUES ('Default', ?1, -1, 1)",
                [watch_folder],
            )?;
        }
        Ok(())
    }

    pub(crate) fn invalid<T>(msg: impl Into<String>) -> Result<T> {
        Err(CoreError::InvalidInput(msg.into()))
    }
}

#[cfg(test)]
mod migration_tests {
    use super::*;
    use crate::ListQuery;

    #[test]
    fn a_version_1_database_gains_tags_and_keeps_searching() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(&format!("BEGIN; {} PRAGMA user_version = 1; COMMIT;", MIGRATIONS[0].1)).unwrap();
        conn.execute("INSERT INTO destinations(name, path, sort_order, is_default) VALUES ('Default', 'C:\\Shots', -1, 1)", []).unwrap();
        conn.execute(
            "INSERT INTO screenshots(path, original_name, captured_at, size_bytes, hash, label, notes, destination_id) VALUES ('C:\\Shots\\a.png', 'a.png', '2026-09-26T01:00:00', 1, 'h', 'Old label', 'old notes', 1)",
            [],
        )
        .unwrap();

        let store = Store::init(conn, "C:\\Shots").unwrap();
        assert_eq!(store.schema_version().unwrap(), 2);
        let shot = store.get_by_path("C:\\Shots\\a.png").unwrap().unwrap();
        assert!(shot.tags.is_empty());
        let q = |t: &str| ListQuery { q: t.into(), ..Default::default() };
        assert_eq!(store.list_screenshots(&q("old")).unwrap().len(), 1, "FTS was rebuilt with the existing rows");
        store.update_metadata(shot.id, "Old label", "old notes", &["fresh".into()], 1).unwrap();
        assert_eq!(store.list_screenshots(&q("fresh")).unwrap().len(), 1, "tags are searchable after the migration");
    }
}
