use snapnote_core::Settings;
use std::path::PathBuf;

/// Override wins; then the Windows "Screenshots" known folder; then `%OneDrive%\Pictures\Screenshots`
/// if it exists; then `%USERPROFILE%\Pictures\Screenshots`.
pub fn resolve(override_: &str, detected: Option<PathBuf>, env: &dyn Fn(&str) -> Option<String>) -> PathBuf {
    let o = override_.trim();
    if !o.is_empty() {
        return PathBuf::from(o);
    }
    if let Some(d) = detected.filter(|d| !d.as_os_str().is_empty()) {
        return d;
    }
    if let Some(od) = env("OneDrive") {
        let p = PathBuf::from(od).join("Pictures").join("Screenshots");
        if p.is_dir() {
            return p;
        }
    }
    let home = env("USERPROFILE").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    home.join("Pictures").join("Screenshots")
}

#[cfg(windows)]
pub fn detect() -> Option<PathBuf> {
    known_folders::get_known_folder_path(known_folders::KnownFolder::Screenshots)
}

#[cfg(not(windows))]
pub fn detect() -> Option<PathBuf> {
    None
}

fn os_env(k: &str) -> Option<String> {
    std::env::var(k).ok()
}

pub fn detected_default() -> PathBuf {
    resolve("", detect(), &os_env)
}

pub fn resolve_from_settings(settings: &Settings) -> PathBuf {
    resolve(&settings.watch_folder_override, detect(), &os_env)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env<'a>(map: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        let m: HashMap<&str, &str> = map.iter().cloned().collect();
        move |k| m.get(k).map(|v| v.to_string())
    }

    #[test]
    fn override_wins() {
        let r = resolve("  E:\\Shots  ", Some(PathBuf::from("C:\\detected")), &env(&[]));
        assert_eq!(r, PathBuf::from("E:\\Shots"));
    }

    #[test]
    fn detected_known_folder_is_used_when_no_override() {
        let r = resolve("", Some(PathBuf::from("C:\\detected")), &env(&[("OneDrive", "C:\\OD")]));
        assert_eq!(r, PathBuf::from("C:\\detected"));
    }

    #[test]
    fn onedrive_fallback_only_when_that_folder_exists() {
        let dir = tempfile::tempdir().unwrap();
        let od = dir.path().join("OneDrive");
        std::fs::create_dir_all(od.join("Pictures").join("Screenshots")).unwrap();
        let od_s = od.to_string_lossy().into_owned();
        let r = resolve("", None, &env(&[("OneDrive", &od_s), ("USERPROFILE", "C:\\Users\\x")]));
        assert_eq!(r, od.join("Pictures").join("Screenshots"));
    }

    #[test]
    fn userprofile_fallback_last() {
        let r = resolve("", None, &env(&[("OneDrive", "C:\\definitely\\missing"), ("USERPROFILE", "C:\\Users\\x")]));
        assert_eq!(r, PathBuf::from("C:\\Users\\x").join("Pictures").join("Screenshots"));
    }
}
