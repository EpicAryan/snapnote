/// The library opens by itself on the very first run, so a new user sees more than a tray
/// icon, and always in debug builds, where `tauri dev` has no other way to reach it.
pub fn should_show_library(first_run_done: bool, debug_build: bool) -> bool {
    debug_build || !first_run_done
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn library_opens_on_first_run_and_always_in_debug_builds() {
        assert!(should_show_library(false, false), "first run in a release build");
        assert!(!should_show_library(true, false), "normal release start stays in the tray");
        assert!(should_show_library(true, true), "debug builds always show it");
        assert!(should_show_library(false, true));
    }
}
