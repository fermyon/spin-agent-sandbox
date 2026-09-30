//! Per-request egress allow-list layered on Spin's host policy, with an SSRF backstop.

use ip_network::IpNetwork;
use std::net::IpAddr;
use url::Url;

/// Rejects loopback / link-local / private IP literals and local/internal names,
/// even if explicitly allow-listed. This component sees only an authority, not
/// DNS results, so Spin or the deployment network must also reject hostnames
/// that resolve to private addresses.
pub fn is_internal_host(host: &str) -> bool {
    let h = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if h.is_empty() || h == "localhost" || h.ends_with(".localhost") || h.ends_with(".internal") || h.ends_with(".local") {
        return true;
    }
    let literal = h.strip_prefix('[').and_then(|s| s.strip_suffix(']')).unwrap_or(h.as_str());
    let Ok(mut ip) = literal.parse::<IpAddr>() else {
        return false; // not an IP literal -> treat as a DNS name
    };
    // Classify an IPv4-mapped/compatible IPv6 address by its embedded IPv4, so a
    // mapped internal target (e.g. ::ffff:169.254.169.254) is blocked too.
    if let IpAddr::V6(v6) = ip {
        if let Some(v4) = v6.to_ipv4_mapped().or_else(|| v6.to_ipv4()) {
            ip = IpAddr::V4(v4);
        }
    }
    !IpNetwork::from(ip).is_global()
}

/// Parses the outbound request's `scheme` + `authority` (`host` or
/// `host:port`, IPv6 host in brackets) via the `url` crate, so host
/// normalization (lowercasing, IDNA) and port handling follow the same rules
/// a real HTTP client would. Returns `None` for an unparseable authority.
fn parse_authority(scheme: &str, authority: &str) -> Option<(String, Option<u16>)> {
    let url = Url::parse(&format!("{scheme}://{authority}")).ok()?;
    Some((url.host_str()?.to_string(), url.port()))
}

/// Splits the host part of an allow-list pattern (`host` or `host:port-spec`,
/// with an IPv6 host in brackets) into its host and the raw, not-yet-parsed
/// port spec — unlike `split_authority`, the port half may also be `*`.
fn split_pattern(pat: &str) -> (&str, Option<&str>) {
    if let Some(rest) = pat.strip_prefix('[') {
        if let Some((host, tail)) = rest.split_once(']') {
            return (host, tail.strip_prefix(':'));
        }
    }
    match pat.rsplit_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (pat, None),
    }
}

/// The well-known default port for a URL scheme, used when an allow-list
/// entry omits a port entirely.
fn well_known_port(scheme: &str) -> Option<u16> {
    match scheme {
        "http" => Some(80),
        "https" => Some(443),
        _ => None,
    }
}

/// Returns true if `port` (the request's actual port, if any) satisfies an
/// allow-list entry's port spec: `*` allows any port; an explicit number must
/// match exactly; an entry with no port at all means the scheme's default
/// port (80/http, 443/https) rather than "any port". No ranges — mirrors the
/// pre-guard ts-sandbox/py-sandbox `_egress` semantics, kept deliberately simple.
fn port_matches(pat_port: Option<&str>, scheme: &str, port: Option<u16>) -> bool {
    match pat_port {
        Some("*") => true,
        Some(spec) => spec.parse::<u16>().is_ok_and(|p| port.or_else(|| well_known_port(scheme)) == Some(p)),
        None => port.or_else(|| well_known_port(scheme)) == well_known_port(scheme),
    }
}

/// Returns true if `scheme://authority` (the outbound request's scheme and
/// `host[:port]`) is allowed by the per-request `allowed` list. An allow-list
/// entry with an explicit scheme (`https://example.com`) only matches that
/// scheme; an entry without one, or with a `*` scheme (`*://example.com`),
/// matches any scheme. An entry with no port matches only the request
/// scheme's default port (80/http, 443/https); `:*` allows any port and
/// `:8080` allows exactly that port.
pub fn host_allowed(scheme: &str, authority: &str, allowed: &[String]) -> bool {
    if allowed.is_empty() {
        return false; // default deny
    }
    let scheme_lower = scheme.to_ascii_lowercase();
    let Some((host_lower, port)) = parse_authority(&scheme_lower, authority) else {
        return false; // unparseable authority -> deny
    };
    if is_internal_host(&host_lower) {
        return false; // deny internal targets unconditionally
    }
    allowed.iter().any(|raw| {
        let raw = raw.trim();
        if raw == "*" {
            return false; // a bare "*" from the per-request list must not allow-all
        }
        let (pat_scheme, rest) = match raw.split_once("://") {
            Some((s, rest)) => (Some(s.to_ascii_lowercase()), rest),
            None => (None, raw),
        };
        if let Some(ps) = &pat_scheme {
            if ps != "*" && *ps != scheme_lower {
                return false;
            }
        }
        let rest = rest.split('/').next().unwrap_or(rest);
        let (pat_host, pat_port) = split_pattern(rest);
        let pat_host = pat_host.to_ascii_lowercase();
        let host_matches = if let Some(base) = pat_host.strip_prefix("*.") {
            host_lower == base || host_lower.ends_with(&format!(".{base}"))
        } else {
            host_lower == pat_host
        };
        host_matches && port_matches(pat_port, &scheme_lower, port)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denies_by_default_with_an_empty_allow_list() {
        assert!(!host_allowed("https", "example.com", &[]));
    }

    #[test]
    fn allows_an_exact_host_match() {
        // No port in the pattern defaults to the request scheme's well-known port,
        // mirroring Spin's own allowed_outbound_hosts port mechanics.
        let allowed = vec!["example.com".to_string()];
        assert!(host_allowed("https", "example.com", &allowed));
        assert!(host_allowed("https", "example.com:443", &allowed));
        assert!(!host_allowed("https", "example.com:8080", &allowed));
        assert!(!host_allowed("https", "other.com", &allowed));
    }

    #[test]
    fn allows_a_host_port_pattern_only_on_that_port() {
        let allowed = vec!["example.com:8080".to_string()];
        assert!(host_allowed("https", "example.com:8080", &allowed));
        assert!(!host_allowed("https", "example.com:9090", &allowed));
        assert!(!host_allowed("https", "example.com", &allowed));
    }

    #[test]
    fn a_wildcard_port_allows_any_port() {
        let allowed = vec!["example.com:*".to_string()];
        assert!(host_allowed("https", "example.com", &allowed));
        assert!(host_allowed("https", "example.com:8080", &allowed));
        assert!(host_allowed("https", "example.com:65535", &allowed));
    }

    #[test]
    fn default_port_matches_only_the_request_schemes_well_known_port() {
        // No port in the pattern means the default port for the request's own scheme
        // (80/http, 443/https), not "any port".
        let allowed = vec!["http://example.com".to_string()];
        assert!(host_allowed("http", "example.com:80", &allowed));
        assert!(host_allowed("http", "example.com", &allowed)); // port omitted -> implied 80
        assert!(!host_allowed("http", "example.com:8080", &allowed));
    }

    #[test]
    fn scheme_prefixed_patterns_only_match_that_scheme() {
        let allowed = vec!["https://example.com".to_string()];
        assert!(host_allowed("https", "example.com", &allowed));
        assert!(!host_allowed("http", "example.com", &allowed));
    }

    #[test]
    fn a_star_scheme_pattern_matches_any_scheme() {
        let allowed = vec!["*://example.com".to_string()];
        assert!(host_allowed("http", "example.com", &allowed));
        assert!(host_allowed("https", "example.com", &allowed));
    }

    #[test]
    fn a_scheme_less_pattern_matches_any_scheme() {
        let allowed = vec!["example.com".to_string()];
        assert!(host_allowed("http", "example.com", &allowed));
        assert!(host_allowed("https", "example.com", &allowed));
    }

    #[test]
    fn wildcard_subdomain_matches_any_depth_and_the_bare_domain() {
        // Mirrors the pre-guard ts-sandbox/py-sandbox semantics: "*.example.com" also
        // covers the bare "example.com", not just strict subdomains.
        let allowed = vec!["*.example.com".to_string()];
        assert!(host_allowed("https", "a.example.com", &allowed));
        assert!(host_allowed("https", "a.b.example.com", &allowed));
        assert!(host_allowed("https", "example.com", &allowed));
        assert!(!host_allowed("https", "notexample.com", &allowed));
    }

    #[test]
    fn a_bare_star_does_not_allow_all() {
        assert!(!host_allowed("https", "example.com", &["*".to_string()]));
    }

    #[test]
    fn denies_internal_hosts_even_if_allow_listed() {
        for host in [
            "localhost",
            "127.0.0.1",
            "169.254.169.254", // cloud metadata
            "10.0.0.1",
            "192.168.1.1",
            "100.64.0.1",  // RFC 6598 CGNAT
            "foo.internal",
            "foo.local",
            "[::1]",
            "[fc00::1]",
            "[::ffff:169.254.169.254]", // IPv4-mapped IPv6
        ] {
            assert!(!host_allowed("https", host, &[host.trim_start_matches('[').trim_end_matches(']').to_string()]), "{host}");
        }
    }

    #[test]
    fn allows_public_ip_literals() {
        let allowed = vec!["93.184.216.34".to_string()];
        assert!(host_allowed("https", "93.184.216.34", &allowed));
    }

    #[test]
    fn is_internal_host_matches_expected_ranges() {
        for host in ["", "localhost", "a.localhost", "a.internal", "a.local", "127.0.0.1", "169.254.1.1", "10.1.2.3", "192.168.1.1", "100.64.1.1", "::1", "fc00::1"] {
            assert!(is_internal_host(host), "{host}");
        }
        for host in ["example.com", "93.184.216.34", "2600::1"] {
            assert!(!is_internal_host(host), "{host}");
        }
    }

    #[test]
    fn matching_is_case_insensitive() {
        let allowed = vec!["Example.COM".to_string()];
        assert!(host_allowed("https", "example.com", &allowed));
        assert!(host_allowed("HTTPS", "EXAMPLE.com", &allowed));
    }
}
