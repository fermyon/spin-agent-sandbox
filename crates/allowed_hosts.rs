use url::Url;

#[derive(Debug)]
#[allow(dead_code)]
pub struct HostPattern {
    pub scheme: String,
    pub host: String,
    pub subdomains_only: bool,
    pub port: Option<String>,
}

pub fn parse_pattern(value: &str) -> Option<HostPattern> {
    let value = value.trim();
    let (scheme, authority) = value.split_once("://")?;
    if scheme.is_empty() || (scheme != "*" && !scheme.chars().all(char::is_alphabetic)) {
        return None;
    }
    let authority = authority.strip_suffix('/').unwrap_or(authority);
    if authority.is_empty() || authority.contains(['/', '?', '#', '@', '%', '\\']) || authority.chars().any(char::is_whitespace) {
        return None;
    }
    let (host, port) = if authority.starts_with('[') {
        let end = authority.find(']')?;
        let tail = &authority[end + 1..];
        (&authority[..=end], if tail.is_empty() { None } else { Some(tail.strip_prefix(':')?) })
    } else if let Some((host, port)) = authority.rsplit_once(':') {
        (host, Some(port))
    } else {
        (authority, None)
    };
    if !host.starts_with('[') && host.contains(':') {
        return None;
    }
    let port = port.filter(|port| !port.is_empty());
    if let Some(port) = port {
        if port != "*" && (!port.bytes().all(|byte| byte.is_ascii_digit()) || port.parse::<u16>().is_err()) {
            return None;
        }
    } else if !matches!(scheme, "http" | "https" | "postgres" | "mysql" | "redis" | "mqtt") {
        return None;
    }
    let (subdomains_only, host) = match host.strip_prefix("*.") {
        Some(host) => (true, host),
        None => (false, host),
    };
    if host == "*" && !subdomains_only {
        return Some(HostPattern { scheme: scheme.to_string(), host: host.to_string(), subdomains_only, port: port.map(str::to_string) });
    }
    if host.contains('*') || (subdomains_only && host.starts_with('[')) {
        return None;
    }
    let url = Url::parse(&format!("http://{host}")).ok()?;
    if url.username() != "" || url.password().is_some() || url.port().is_some() || url.path() != "/" {
        return None;
    }
    if subdomains_only && !matches!(url.host(), Some(url::Host::Domain(_))) {
        return None;
    }
    let host = url.host_str()?.to_string();
    Some(HostPattern { scheme: scheme.to_string(), host, subdomains_only, port: port.map(str::to_string) })
}

#[cfg(test)]
mod tests {
    use super::parse_pattern;

    #[test]
    fn validates_patterns() {
        for value in ["https://example.com", "https://example.com:", "https://example.com/", "*://*:*", "*://*.example.com:*", "http://[2600::1]:8080", "https://93.184.216.34"] {
            assert!(parse_pattern(value).is_some(), "{value}");
        }
        for value in ["*", "example.com", "", "https://", "*://example.com", "https://example.com/path", "https://example.com?x", "https://user@example.com", "http://example.com:80:90", "https://example.com:1-10", "https://example.com:65536", "https://example.com/24", "https://*.127.0.0.1", "https://a*b.com", "https://[::1]junk"] {
            assert!(parse_pattern(value).is_none(), "{value}");
        }
    }
}