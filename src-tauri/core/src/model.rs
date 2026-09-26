use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Destination {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub sort_order: i64,
    pub is_default: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Present,
    Missing,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Present => "present",
            Status::Missing => "missing",
        }
    }

    pub fn parse(s: &str) -> Status {
        if s == "missing" {
            Status::Missing
        } else {
            Status::Present
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: i64,
    pub path: String,
    pub original_name: String,
    pub captured_at: String,
    pub size_bytes: i64,
    pub hash: String,
    pub label: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub destination_id: i64,
    pub status: Status,
    pub pending_move_to: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// What the library grid needs per card. Deliberately smaller than `Screenshot`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScreenshotCard {
    pub id: i64,
    pub path: String,
    pub original_name: String,
    pub captured_at: String,
    pub label: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub destination_id: i64,
    pub destination_name: String,
    pub status: Status,
    pub pending_move_to: Option<i64>,
}

/// Input for inserting a row. Built by `ingest::describe_file`.
#[derive(Debug, Clone, PartialEq)]
pub struct NewScreenshot {
    pub path: String,
    pub original_name: String,
    pub captured_at: String,
    pub size_bytes: i64,
    pub hash: String,
    pub destination_id: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Sort {
    #[default]
    Newest,
    Oldest,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ListQuery {
    pub q: String,
    pub destination_id: Option<i64>,
    pub unlabeled_only: bool,
    /// Exact tag to require (already normalised).
    pub tag: Option<String>,
    pub sort: Sort,
    pub limit: i64,
    pub offset: i64,
}

impl Default for ListQuery {
    fn default() -> Self {
        ListQuery {
            q: String::new(),
            destination_id: None,
            unlabeled_only: false,
            tag: None,
            sort: Sort::Newest,
            limit: 200,
            offset: 0,
        }
    }
}

/// Where the user wants the file. `Browse` carries a folder picked with the OS dialog.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DestinationChoice {
    Existing { id: i64 },
    Browse { path: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SaveResult {
    pub moved: bool,
    pub renamed: bool,
    pub path: String,
    pub destination: Destination,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    pub watch_folder_override: String,
    pub label_hotkey: String,
    pub library_hotkey: String,
    pub toast_seconds: u32,
    pub rename_on_label: bool,
    pub autostart: bool,
    pub library_window_bounds: String,
    pub first_run_done: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            watch_folder_override: String::new(),
            label_hotkey: "Ctrl+Shift+L".to_string(),
            library_hotkey: String::new(),
            toast_seconds: 8,
            rename_on_label: true,
            autostart: true,
            library_window_bounds: String::new(),
            first_run_done: false,
        }
    }
}

pub const SETTING_KEYS: &[&str] = &[
    "watch_folder_override",
    "label_hotkey",
    "library_hotkey",
    "toast_seconds",
    "rename_on_label",
    "autostart",
    "library_window_bounds",
    "first_run_done",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImportReport {
    pub added: usize,
    pub skipped: usize,
}

/// A label used recently, with the destination it was last saved to: one click re-applies both.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentLabel {
    pub label: String,
    pub destination_id: i64,
    pub destination_name: String,
    pub uses: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DestinationCount {
    pub destination_id: i64,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

/// Numbers for the library sidebar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct LibraryCounts {
    pub total: i64,
    pub unlabeled: i64,
    pub missing: i64,
    pub by_destination: Vec<DestinationCount>,
    pub tags: Vec<TagCount>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn destination_choice_serializes_with_kind_tag() {
        let j = serde_json::to_string(&DestinationChoice::Browse { path: "D:\\x".into() }).unwrap();
        assert_eq!(j, r#"{"kind":"browse","path":"D:\\x"}"#);
        let back: DestinationChoice = serde_json::from_str(r#"{"kind":"existing","id":3}"#).unwrap();
        assert_eq!(back, DestinationChoice::Existing { id: 3 });
    }

    #[test]
    fn list_query_defaults_fill_missing_fields() {
        let q: ListQuery = serde_json::from_str(r#"{"q":"inv"}"#).unwrap();
        assert_eq!(q.q, "inv");
        assert_eq!(q.limit, 200);
        assert_eq!(q.sort, Sort::Newest);
    }

    #[test]
    fn status_round_trips_lowercase() {
        assert_eq!(serde_json::to_string(&Status::Missing).unwrap(), r#""missing""#);
        assert_eq!(Status::parse("missing"), Status::Missing);
        assert_eq!(Status::parse("anything-else"), Status::Present);
    }
}
