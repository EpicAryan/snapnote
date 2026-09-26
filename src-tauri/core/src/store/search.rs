use super::Store;
use crate::{tags, DestinationCount, LibraryCounts, ListQuery, RecentLabel, Result, ScreenshotCard, Sort, Status, TagCount};
use std::collections::HashMap;
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
            "SELECT s.id, s.path, s.original_name, s.captured_at, s.label, s.notes, s.destination_id, d.name, s.status, s.pending_move_to, s.tags
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
        if let Some(tag) = q.tag.as_deref().filter(|t| !t.trim().is_empty()) {
            sql.push_str(" AND (' ' || s.tags || ' ') LIKE ?");
            args.push(Value::Text(format!("% {} %", tags::normalize_tags(&[tag.to_string()]).first().cloned().unwrap_or_default())));
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
                tags: tags::split_stored(&r.get::<_, String>(10)?),
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Labels used most recently, each with the destination it was last saved to. Spellings
    /// that differ only in case are folded together; the most recent one is kept.
    pub fn recent_labels(&self, limit: usize) -> Result<Vec<RecentLabel>> {
        let mut st = self.conn.prepare(
            "SELECT s.label, s.destination_id, d.name, MAX(s.updated_at) AS last, COUNT(*) AS uses
             FROM screenshots s JOIN destinations d ON d.id = s.destination_id
             WHERE s.label != '' GROUP BY lower(s.label), s.destination_id ORDER BY last DESC, s.label ASC",
        )?;
        let rows = st.query_map([], |r| {
            Ok(RecentLabel { label: r.get(0)?, destination_id: r.get(1)?, destination_name: r.get(2)?, uses: r.get(4)? })
        })?;
        let mut out: Vec<RecentLabel> = Vec::new();
        for row in rows {
            let row = row?;
            let key = row.label.to_lowercase();
            if let Some(existing) = out.iter_mut().find(|r| r.label.to_lowercase() == key) {
                existing.uses += row.uses;
                continue;
            }
            out.push(row);
        }
        out.truncate(limit);
        Ok(out)
    }

    pub fn library_counts(&self) -> Result<LibraryCounts> {
        let (total, unlabeled, missing): (i64, i64, i64) = self.conn.query_row(
            "SELECT COUNT(*), SUM(label = ''), SUM(status = 'missing') FROM screenshots",
            [],
            |r| Ok((r.get(0)?, r.get::<_, Option<i64>>(1)?.unwrap_or(0), r.get::<_, Option<i64>>(2)?.unwrap_or(0))),
        )?;
        let mut st = self.conn.prepare("SELECT destination_id, COUNT(*) FROM screenshots GROUP BY destination_id ORDER BY destination_id")?;
        let by_destination = st
            .query_map([], |r| Ok(DestinationCount { destination_id: r.get(0)?, count: r.get(1)? }))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut st = self.conn.prepare("SELECT tags FROM screenshots WHERE tags != ''")?;
        let mut counts: HashMap<String, i64> = HashMap::new();
        for stored in st.query_map([], |r| r.get::<_, String>(0))? {
            for t in tags::split_stored(&stored?) {
                *counts.entry(t).or_insert(0) += 1;
            }
        }
        let mut tag_counts: Vec<TagCount> = counts.into_iter().map(|(tag, count)| TagCount { tag, count }).collect();
        tag_counts.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
        tag_counts.truncate(100);
        Ok(LibraryCounts { total, unlabeled, missing, by_destination, tags: tag_counts })
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
        s.update_metadata(a.id, "Invoice timeout", "DB timeout while syncing", &[], embee.id).unwrap();
        s.update_metadata(b.id, "Login page bug", "", &[], s.default_destination().unwrap().id).unwrap();
        s
    }

    fn names(cards: &[crate::ScreenshotCard]) -> Vec<&str> {
        cards.iter().map(|c| c.original_name.as_str()).collect()
    }

    #[test]
    fn hyphenated_query_finds_hyphenated_label() {
        let s = Store::open_in_memory(WATCH).unwrap();
        let a = s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();
        s.update_metadata(a.id, "api-timeout", "", &[], s.default_destination().unwrap().id).unwrap();
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
        s.update_metadata(a.id, "renamed thing", "", &[], a.destination_id).unwrap();
        let q = |t: &str| ListQuery { q: t.into(), ..Default::default() };
        assert!(s.list_screenshots(&q("invoice")).unwrap().is_empty());
        assert_eq!(names(&s.list_screenshots(&q("renamed")).unwrap()), ["a.png"]);
        s.delete_screenshot(a.id).unwrap();
        assert!(s.list_screenshots(&q("renamed")).unwrap().is_empty());
    }
}

#[cfg(test)]
mod tag_recent_and_count_tests {
    use crate::store::screenshots::tests::{new_shot, WATCH};
    use crate::store::Store;
    use crate::{ListQuery, Status};

    fn names(cards: &[crate::ScreenshotCard]) -> Vec<&str> {
        cards.iter().map(|c| c.original_name.as_str()).collect()
    }

    fn seeded() -> (Store, i64, i64) {
        let s = Store::open_in_memory(WATCH).unwrap();
        let d = s.default_destination().unwrap().id;
        let embee = s.create_destination("Embee", "D:\\Embee").unwrap().id;
        let a = s.insert_screenshot(&new_shot(&s, "a.png", "2026-09-26T01:00:00")).unwrap();
        let b = s.insert_screenshot(&new_shot(&s, "b.png", "2026-09-25T01:00:00")).unwrap();
        let c = s.insert_screenshot(&new_shot(&s, "c.png", "2026-09-24T01:00:00")).unwrap();
        let _d = s.insert_screenshot(&new_shot(&s, "d.png", "2026-09-23T01:00:00")).unwrap();
        s.update_metadata(a.id, "Invoice", "", &["client-x".into(), "urgent".into()], embee).unwrap();
        s.update_metadata(b.id, "Login bug", "", &["urgent".into()], d).unwrap();
        s.update_metadata(c.id, "invoice", "", &[], d).unwrap();
        // updated_at has second resolution; make c's save unambiguously the most recent.
        s.conn.execute("UPDATE screenshots SET updated_at = datetime('now', '+2 seconds') WHERE id = ?1", [c.id]).unwrap();
        s.set_status(c.id, Status::Missing).unwrap();
        (s, d, embee)
    }

    #[test]
    fn tag_filter_composes_and_search_finds_tags() {
        let (s, _d, embee) = seeded();
        let by_tag = ListQuery { tag: Some("urgent".into()), ..Default::default() };
        assert_eq!(names(&s.list_screenshots(&by_tag).unwrap()), ["a.png", "b.png"]);
        assert_eq!(s.list_screenshots(&by_tag).unwrap()[0].tags, vec!["client-x", "urgent"], "cards carry tags");
        let both = ListQuery { tag: Some("urgent".into()), destination_id: Some(embee), ..Default::default() };
        assert_eq!(names(&s.list_screenshots(&both).unwrap()), ["a.png"]);
        let partial = ListQuery { tag: Some("urg".into()), ..Default::default() };
        assert!(s.list_screenshots(&partial).unwrap().is_empty(), "tag filter is exact");
        let search = ListQuery { q: "client".into(), ..Default::default() };
        assert_eq!(names(&s.list_screenshots(&search).unwrap()), ["a.png"], "search covers tags");
    }

    #[test]
    fn recent_labels_dedupe_case_insensitively_and_keep_the_last_destination() {
        let (s, d, embee) = seeded();
        let recent = s.recent_labels(5).unwrap();
        let labels: Vec<(&str, i64)> = recent.iter().map(|r| (r.label.as_str(), r.destination_id)).collect();
        // c ("invoice", default) was saved last, so the invoice entry points at Default; a's
        // "Invoice" spelling is folded into it. Order is most recently used first.
        assert_eq!(labels, [("invoice", d), ("Login bug", d)]);
        assert_eq!(recent[0].destination_name, "Default");
        assert_eq!(recent[0].uses, 2);
        let _ = embee;
        assert_eq!(s.recent_labels(1).unwrap().len(), 1);
    }

    #[test]
    fn library_counts_cover_totals_destinations_and_tags() {
        let (s, d, embee) = seeded();
        let c = s.library_counts().unwrap();
        assert_eq!((c.total, c.unlabeled, c.missing), (4, 1, 1));
        let by_dest: Vec<(i64, i64)> = c.by_destination.iter().map(|x| (x.destination_id, x.count)).collect();
        assert_eq!(by_dest, [(d, 3), (embee, 1)]);
        let tags: Vec<(&str, i64)> = c.tags.iter().map(|t| (t.tag.as_str(), t.count)).collect();
        assert_eq!(tags, [("urgent", 2), ("client-x", 1)], "by count, then name");
    }
}
