#[derive(Copy, Clone, PartialEq, PartialOrd)]
enum Level {
    Error = 0,
    Warn = 1,
    Info = 2,
    Debug = 3,
}

fn threshold() -> Level {
    match spin_sdk::variables::get("log_level")
        .unwrap_or_else(|_| "info".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "error" => Level::Error,
        "warn" => Level::Warn,
        "debug" => Level::Debug,
        _ => Level::Info,
    }
}

fn emit(level: Level, name: &str, msg: &str) {
    if level > threshold() {
        return;
    }
    println!("guard: {name} {}", escape(msg));
}

/// Escapes backslashes and control characters so that text from user code
/// (error messages, stack traces) cannot forge or split a log line.
fn escape(msg: &str) -> String {
    let mut out = String::with_capacity(msg.len());
    for c in msg.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() || matches!(c, '\u{2028}' | '\u{2029}') => {
                out.push_str(&format!("\\u{{{:x}}}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}

pub fn info(msg: &str) {
    emit(Level::Info, "INFO", msg);
}

pub fn warn(msg: &str) {
    emit(Level::Warn, "WARN", msg);
}

pub fn error(msg: &str) {
    emit(Level::Error, "ERROR", msg);
}

#[cfg(test)]
mod tests {
    use super::escape;

    #[test]
    fn leaves_plain_text_unchanged() {
        assert_eq!(
            escape("compile_error: unexpected token 'x'"),
            "compile_error: unexpected token 'x'"
        );
    }

    #[test]
    fn escapes_line_breaks_so_a_message_cannot_forge_a_log_line() {
        assert_eq!(
            escape("boom\nguard: INFO sandbox=other ok\r"),
            "boom\\nguard: INFO sandbox=other ok\\r"
        );
    }

    #[test]
    fn leaves_non_ascii_text_unchanged() {
        assert_eq!(escape("é 日本語 🙂"), "é 日本語 🙂");
    }

    #[test]
    fn escapes_del_and_c1_controls() {
        assert_eq!(escape("\u{7f}\u{85}"), "\\u{7f}\\u{85}");
    }

    #[test]
    fn escaped_output_is_a_single_line() {
        let out = escape("a\nb\rc\u{2028}d\u{2029}e\0f");
        assert!(!out.contains(['\n', '\r', '\u{2028}', '\u{2029}', '\0']));
    }

    #[test]
    fn escapes_control_characters_and_backslashes() {
        assert_eq!(
            escape("a\x1b[31m\0b\u{2028}c\\n"),
            "a\\u{1b}[31m\\u{0}b\\u{2028}c\\\\n"
        );
    }
}
