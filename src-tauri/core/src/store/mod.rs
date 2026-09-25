pub mod destinations;
pub mod paths;

use crate::{CoreError, Result};
use rusqlite::Connection;
use std::path::Path;

const MIGRATIONS: &[(i32, &str)] = &[(1, include_str!("../../migrations/0001_init.sql"))];

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
