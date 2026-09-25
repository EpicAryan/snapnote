//! snapnote-core: everything that does not need Tauri.

#[cfg(test)]
mod tests {
    #[test]
    fn sqlite_is_bundled_with_fts5() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE VIRTUAL TABLE t USING fts5(x);").unwrap();
    }
}
