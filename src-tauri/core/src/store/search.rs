use super::Store;
use crate::{ListQuery, Result, ScreenshotCard, Sort, Status};
use rusqlite::{params_from_iter, types::Value};

/// Every run of alphanumerics becomes a quoted prefix term, so `invoice-timeout` matches the
/// two tokens unicode61 stores for that label, and user input can never be parsed as FTS5
/// syntax. Terms are implicitly AND-ed by FTS5.
pub fn fts_query(q: &str) -> Option<String> {
    let terms: Vec<String> = q
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.chars().flat_map(char::to_lowercase).collect::<String>())
        .map(|t| format!("\"{t}\"*"))
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

impl Store {
    pub fn list_screenshots(&self, q: &ListQuery) -> Result<Vec<ScreenshotCard>> {
        let mut sql = String::from(
            "SELECT s.id, s.path, s.original_name, s.captured_at, s.label, s.notes, s.destination_id, d.name, s.status, s.pending_move_to
             FROM screenshots s JOIN destinations d ON d.id = s.destination_id WHERE 1 = 1",
        );
        let mut args: Vec<Value> = Vec::new();
        if let Some(fts) = fts_query(&q.q) {
            sql.push_str(" AND s.id IN (SELECT rowid FROM screenshots_fts WHERE screenshots_fts MATCH ?)");
            args.push(Value::Text(fts));
        }
        if let Some(dest) = q.destination_id {
            sql.push_str(" AND s.destination_id = ?");
            args.push(Value::Integer(dest));
        }
        if q.unlabeled_only {
            sql.push_str(" AND s.label = ''");
        }
        let dir = match q.sort {
            Sort::Newest => "DESC",
            Sort::Oldest => "ASC",
        };
        sql.push_str(&format!(" ORDER BY s.captured_at {dir}, s.id {dir} LIMIT ? OFFSET ?"));
        args.push(Value::Integer(q.limit.clamp(1, 1000)));
        args.push(Value::Integer(q.offset.max(0)));

        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(params_from_iter(args), |r| {
            Ok(ScreenshotCard {
                id: r.get(0)?,
                path: r.get(1)?,
                original_name: r.get(2)?,
                captured_at: r.get(3)?,
                label: r.get(4)?,
                notes: r.get(5)?,
                destination_id: r.get(6)?,
                destination_name: r.get(7)?,
                status: Status::parse(&r.get::<_, String>(8)?),
                pending_move_to: r.get(9)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::fts_query;
    use crate::store::screenshots::tests::{new_shot, WATCH};
    use crate::store::Store;
    use crate::{ListQuery, Sort};

    #[test]
    fn fts_query_builds_quoted_prefix_terms() {
        assert_eq!(fts_query("inv time"), Some("\"inv\"* \"time\"*".to_string()));
        assert_eq!(fts_query("  "), None);
        assert_eq!(fts_query("a:b OR \"x\""), Some("\"a\"* \"b\"* \"or\"* \"x\"*".to_string()), "punctuation splits terms and FTS keywords are neutralised");
        assert_eq!(fts_query("invoice-timeout"), Some("\"invoice\"* \"timeout\"*".to_string()), "hyphenated input matches how unicode61 tokenises labels");
        assert_eq!(fts_query("Ünï"), Some("\"ünï\"*".to_string()));
    }

    fn seeded() -> Store {
        let s = Store::open_in_memory(WATCH).unwrap();
        let embee = s.create_destination("Embee", "D:\\Embee").unwrap();
        let a = s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();
        let b = s.insert_screenshot(&new_shot(&s, "b.png", "2026-09-25T01:00:00")).unwrap();
        let _c = s.insert_screenshot(&new_shot(&s, "c.png", "2026-09-24T01:00:00")).unwrap();
        s.update_metadata(a.id, "Invoice timeout", "DB timeout while syncing", embee.id).unwrap();
        s.update_metadata(b.id, "Login page bug", "", s.default_destination().unwrap().id).unwrap();
        s
    }

    fn names(cards: &[crate::ScreenshotCard]) -> Vec<&str> {
        cards.iter().map(|c| c.original_name.as_str()).collect()
    }

    #[test]
    fn hyphenated_query_finds_hyphenated_label() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let a = s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();
        s.update_metadata(a.id, "api-timeout", "", s.default_destination().unwrap().id).unwrap();
        let q = |t: &str| ListQuery { q: t.into(), ..Default::default() };
        assert_eq!(names(&s.list_screenshots(&q("api-timeout")).unwrap()), ["a.png"]);
        assert_eq!(names(&s.list_screenshots(&q("api")).unwrap()), ["a.png"]);
    }

    #[test]
    fn empty_query_lists_everything_newest_first() {
        let s = seeded();
        let cards = s.list_screenshots(&ListQuery::default()).unwrap();
        assert_eq!(names(&cards), ["a.png", "b.png", "c.png"]);
        assert_eq!(cards[0].destination_name, "Embee");
        assert_eq!(cards[0].notes, "DB timeout while syncing", "cards carry notes so a notes match is visible in the grid");
    }

    #[test]
    fn oldest_sort_and_paging() {
        let s = seeded();
        let q = ListQuery { sort: Sort::Oldest, limit: 2, offset: 1, ..Default::default() };
        assert_eq!(names(&s.list_screenshots(&q).unwrap()), ["b.png", "a.png"]);
    }

    #[test]
    fn prefix_search_matches_label_and_notes() {
        let s = seeded();
        let q = |t: &str| ListQuery { q: t.into(), ..Default::default() };
        assert_eq!(names(&s.list_screenshots(&q("inv")).unwrap()), ["a.png"]);
        assert_eq!(names(&s.list_screenshots(&q("sync")).unwrap()), ["a.png"]);
        assert_eq!(names(&s.list_screenshots(&q("timeout login")).unwrap()), Vec::<&str>::new(), "terms are AND-ed");
        assert_eq!(names(&s.list_screenshots(&q("zzz")).unwrap()), Vec::<&str>::new());
    }

    #[test]
    fn filters_compose() {
        let s = seeded();
        let embee = s.find_destination_by_path("D:\\Embee").unwrap().unwrap();
        let by_dest = ListQuery { destination_id: Some(embee.id), ..Default::default() };
        assert_eq!(names(&s.list_screenshots(&by_dest).unwrap()), ["a.png"]);
        let unlabeled = ListQuery { unlabeled_only: true, ..Default::default() };
        assert_eq!(names(&s.list_screenshots(&unlabeled).unwrap()), ["c.png"]);
        let both = ListQuery { q: "inv".into(), destination_id: Some(embee.id), unlabeled_only: true, ..Default::default() };
        assert!(s.list_screenshots(&both).unwrap().is_empty());
    }

    #[test]
    fn search_is_updated_after_edit_and_delete() {
        let s = seeded();
        let a = s.get_by_path(&format!("{WATCH}\\a.png")).unwrap().unwrap();
        s.update_metadata(a.id, "renamed thing", "", a.destination_id).unwrap();
        let q = |t: &str| ListQuery { q: t.into(), ..Default::default() };
        assert!(s.list_screenshots(&q("invoice")).unwrap().is_empty());
        assert_eq!(names(&s.list_screenshots(&q("renamed")).unwrap()), ["a.png"]);
        s.delete_screenshot(a.id).unwrap();
        assert!(s.list_screenshots(&q("renamed")).unwrap().is_empty());
    }
}
