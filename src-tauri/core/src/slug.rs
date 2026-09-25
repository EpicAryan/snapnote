/// Characters Windows refuses in filenames, plus control characters (handled separately).
const INVALID: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
const MAX_LEN: usize = 60;

/// Turn a free-text label into a filename-safe slug. Empty output means "do not rename".
pub fn slugify(label: &str) -> String {
    let mut out = String::new();
    let mut pending_dash = false;
    for ch in label.trim().chars() {
        if ch.is_whitespace() || ch == '-' {
            pending_dash = true;
            continue;
        }
        if ch.is_control() || INVALID.contains(&ch) {
            continue;
        }
        if pending_dash && !out.is_empty() {
            out.push('-');
        }
        pending_dash = false;
        for lc in ch.to_lowercase() {
            out.push(lc);
        }
    }
    // Cap, then strip leading/trailing dash, dot, space (Windows drops trailing dots/spaces).
    let capped: String = out.chars().take(MAX_LEN).collect();
    capped.trim_matches(|c| c == '-' || c == '.' || c == ' ').to_string()
}

pub fn target_filename(date_yyyy_mm_dd: &str, slug: &str, ext: &str) -> String {
    format!("{date_yyyy_mm_dd} {slug}.{ext}")
}

/// `captured_at` is ISO-8601; the date is its first ten characters.
pub fn date_part(captured_at: &str) -> &str {
    captured_at.get(..10).unwrap_or(captured_at)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_table() {
        let cases = [
            ("Invoice Timeout", "invoice-timeout"),
            ("  spaced   out  ", "spaced-out"),
            ("a/b\\c:d*e?f\"g<h>i|j", "abcdefghij"),
            ("--dashes--", "dashes"),
            ("dots.at.end...", "dots.at.end"),
            ("Ünïcode ok", "ünïcode-ok"),
            ("tab\tand\nnewline", "tab-and-newline"),
            ("", ""),
            ("***", ""),
        ];
        for (input, want) in cases {
            assert_eq!(slugify(input), want, "input {input:?}");
        }
    }

    #[test]
    fn slugify_caps_at_60_chars_without_trailing_dash() {
        let long = "word ".repeat(30);
        let s = slugify(&long);
        assert!(s.chars().count() <= 60, "len {}", s.chars().count());
        assert!(!s.ends_with('-'));
    }

    #[test]
    fn target_filename_format() {
        assert_eq!(target_filename("2026-09-26", "invoice-timeout", "png"), "2026-09-26 invoice-timeout.png");
    }

    #[test]
    fn date_part_takes_first_ten_chars() {
        assert_eq!(date_part("2026-09-26T01:57:47"), "2026-09-26");
        assert_eq!(date_part("bad"), "bad");
    }
}
