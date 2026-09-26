use chrono::{DateTime, Local, NaiveDate, NaiveTime};
use std::path::Path;

/// Snipping Tool and Win+PrintScreen write `Screenshot YYYY-MM-DD HHMMSS.png`.
pub fn from_filename(name: &str) -> Option<String> {
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
    let rest = stem.strip_prefix("Screenshot ")?;
    let (date, time) = rest.split_once(' ')?;
    if date.len() != 10 || time.len() != 6 || !time.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    let t = NaiveTime::parse_from_str(time, "%H%M%S").ok()?;
    Some(format!("{}T{}", d.format("%Y-%m-%d"), t.format("%H:%M:%S")))
}

fn file_time(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    let t = meta.created().or_else(|_| meta.modified()).ok()?;
    let dt: DateTime<Local> = t.into();
    Some(dt.format("%Y-%m-%dT%H:%M:%S").to_string())
}

pub fn for_path(path: &Path) -> String {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    from_filename(name)
        .or_else(|| file_time(path))
        .unwrap_or_else(|| Local::now().format("%Y-%m-%dT%H:%M:%S").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parses_snipping_tool_names() {
        assert_eq!(from_filename("Screenshot 2026-09-26 015747.png").as_deref(), Some("2026-09-26T01:57:47"));
        assert_eq!(from_filename("Screenshot 2025-12-31 235959.PNG").as_deref(), Some("2025-12-31T23:59:59"));
    }

    #[test]
    fn rejects_other_names() {
        assert_eq!(from_filename("Screenshot (12).png"), None);
        assert_eq!(from_filename("2026-09-26 invoice-timeout.png"), None);
        assert_eq!(from_filename("Screenshot 2026-13-40 999999.png"), None);
        assert_eq!(from_filename("Screenshot 2026-09-26 0157.png"), None);
    }

    #[test]
    fn falls_back_to_file_time_for_unparseable_names() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("random.png");
        fs::write(&p, b"x").unwrap();
        let s = for_path(&p);
        assert_eq!(s.len(), 19, "got {s}");
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[10..11], "T");
    }

    #[test]
    fn prefers_filename_over_file_time() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Screenshot 2020-01-02 030405.png");
        fs::write(&p, b"x").unwrap();
        assert_eq!(for_path(&p), "2020-01-02T03:04:05");
    }
}
