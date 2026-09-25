/// Normalise a Windows path for comparison: backslashes, lowercase, no trailing separator.
pub fn norm(p: &str) -> String {
    let s = p.replace('/', "\\").to_lowercase();
    s.trim_end_matches('\\').to_string()
}

/// True if `child` equals `parent` or lies beneath it.
pub fn is_inside(child: &str, parent: &str) -> bool {
    let c = norm(child);
    let p = norm(parent);
    c == p || c.starts_with(&format!("{p}\\"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inside_rules() {
        assert!(is_inside("C:\\a\\b", "C:\\a"));
        assert!(is_inside("c:/A/", "C:\\a"));
        assert!(!is_inside("C:\\ab", "C:\\a"));
        assert!(!is_inside("C:\\a", "C:\\a\\b"));
    }
}
