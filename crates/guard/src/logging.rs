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
    println!("guard: {name} {msg}");
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

pub fn debug(msg: &str) {
    emit(Level::Debug, "DEBUG", msg);
}
