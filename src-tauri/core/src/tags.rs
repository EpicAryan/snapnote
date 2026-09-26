//! Tags: short lowercase words stored space-separated so FTS indexes them as plain terms.

pub const MAX_TAG_LEN: usize = 40;
pub const MAX_TAGS: usize = 50;

fn normalize_one(raw: &str) -> String {
    let mut out = String::new();
    let mut pending_dash = false;
    for c in raw.trim().chars().flat_map(char::to_lowercase) {
        if c.is_alphanumeric() || c == '_' || c == '.' {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            pending_dash = false;
            out.push(c);
        } else if c.is_whitespace() || c == '-' {
            pending_dash = true;
        }
        // anything else (punctuation, quotes) is dropped
    }
    out.trim_matches(|c| c == '-' || c == '.').chars().take(MAX_TAG_LEN).collect()
}

/// Lowercase, hyphenated, deduplicated (first occurrence wins), capped.
pub fn normalize_tags(raw: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for r in raw {
        let t = normalize_one(r);
        if !t.is_empty() && !out.contains(&t) {
            out.push(t);
            if out.len() == MAX_TAGS {
                break;
            }
        }
    }
    out
}

/// Free text such as `invoice, client x` → one tag per comma- or space-separated word.
pub fn parse_tags(text: &str) -> Vec<String> {
    normalize_tags(&text.split(|c: char| c == ',' || c.is_whitespace()).map(str::to_string).collect::<Vec<_>>())
}

pub fn join_tags(tags: &[String]) -> String {
    tags.join(" ")
}

pub fn split_stored(stored: &str) -> Vec<String> {
    stored.split_whitespace().map(str::to_string).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_lowercases_hyphenates_dedupes_and_drops_junk() {
        let got = normalize_tags(&["  Client X ".into(), "client-x".into(), "Invoice!".into(), "".into(), "  ".into(), "a_b.c".into()]);
        assert_eq!(got, vec!["client-x", "invoice", "a_b.c"]);
    }

    #[test]
    fn parse_splits_on_commas_and_whitespace() {
        assert_eq!(parse_tags("invoice, Client X  ,urgent"), vec!["invoice", "client", "x", "urgent"]);
        assert_eq!(parse_tags(""), Vec::<String>::new());
    }

    #[test]
    fn stored_form_round_trips() {
        let tags = vec!["invoice".to_string(), "client-x".to_string()];
        assert_eq!(join_tags(&tags), "invoice client-x");
        assert_eq!(split_stored("invoice client-x"), tags);
        assert_eq!(split_stored(""), Vec::<String>::new());
    }

    #[test]
    fn tags_are_capped_in_length_and_number() {
        let long = "x".repeat(100);
        assert_eq!(normalize_tags(&[long])[0].len(), MAX_TAG_LEN);
        let many: Vec<String> = (0..80).map(|i| format!("t{i}")).collect();
        assert_eq!(normalize_tags(&many).len(), MAX_TAGS);
    }
}
