use super::Store;
use crate::{Result, Settings, SETTING_KEYS};
use rusqlite::params;
use std::collections::HashMap;

impl Store {
    pub fn get_settings(&self) -> Result<Settings> {
        let mut st = self.conn.prepare("SELECT key, value FROM settings")?;
        let map: HashMap<String, String> = st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        let d = Settings::default();
        let get = |k: &str| map.get(k).cloned();
        Ok(Settings {
            watch_folder_override: get("watch_folder_override").unwrap_or(d.watch_folder_override),
            label_hotkey: get("label_hotkey").unwrap_or(d.label_hotkey),
            library_hotkey: get("library_hotkey").unwrap_or(d.library_hotkey),
            toast_seconds: get("toast_seconds").and_then(|v| v.parse().ok()).unwrap_or(d.toast_seconds),
            rename_on_label: get("rename_on_label").map(|v| v == "true").unwrap_or(d.rename_on_label),
            autostart: get("autostart").map(|v| v == "true").unwrap_or(d.autostart),
            library_window_bounds: get("library_window_bounds").unwrap_or(d.library_window_bounds),
            first_run_done: get("first_run_done").map(|v| v == "true").unwrap_or(d.first_run_done),
        })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        if !SETTING_KEYS.contains(&key) {
            return Self::invalid(format!("unknown setting '{key}'"));
        }
        match key {
            "toast_seconds" => match value.parse::<u32>() {
                Ok(n) if (1..=120).contains(&n) => {}
                _ => return Self::invalid("toast_seconds must be a whole number from 1 to 120"),
            },
            "rename_on_label" | "autostart" | "first_run_done" if value != "true" && value != "false" => {
                return Self::invalid(format!("{key} must be 'true' or 'false'"));
            }
            _ => {}
        }
        self.conn.execute(
            "INSERT INTO settings(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::store::Store;
    use crate::{CoreError, Settings};

    #[test]
    fn defaults_when_empty() {
        let s = Store::open_in_memory("C:\\Shots").unwrap();
        assert_eq!(s.get_settings().unwrap(), Settings::default());
        assert_eq!(s.get_settings().unwrap().label_hotkey, "Ctrl+Shift+L");
    }

    #[test]
    fn set_and_read_back_with_type_coercion() {
        let s = Store::open_in_memory("C:\\Shots").unwrap();
        s.set_setting("toast_seconds", "12").unwrap();
        s.set_setting("rename_on_label", "false").unwrap();
        s.set_setting("label_hotkey", "Ctrl+Alt+L").unwrap();
        let got = s.get_settings().unwrap();
        assert_eq!(got.toast_seconds, 12);
        assert!(!got.rename_on_label);
        assert_eq!(got.label_hotkey, "Ctrl+Alt+L");
    }

    #[test]
    fn unknown_key_and_bad_values_are_invalid_input() {
        let s = Store::open_in_memory("C:\\Shots").unwrap();
        assert!(matches!(s.set_setting("nope", "1"), Err(CoreError::InvalidInput(_))));
        assert!(matches!(s.set_setting("toast_seconds", "abc"), Err(CoreError::InvalidInput(_))));
        assert!(matches!(s.set_setting("toast_seconds", "0"), Err(CoreError::InvalidInput(_))));
        assert!(matches!(s.set_setting("toast_seconds", "121"), Err(CoreError::InvalidInput(_))));
        assert!(matches!(s.set_setting("rename_on_label", "yes"), Err(CoreError::InvalidInput(_))));
    }
}
