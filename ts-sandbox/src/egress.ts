// Outbound egress control: per-sandbox allow-list on top of the broad Spin manifest
// bound. Pure logic (no Spin imports); `makeFetch` wraps `globalThis.fetch`.

import * as ipaddr from "ipaddr.js";

export function isInternalHost(hostname: string): boolean {
  // Internal targets are never reachable, even if allow-listed — primary SSRF backstop
  // (cloud metadata 169.254.169.254, *.spin.internal, loopback, RFC1918, ...).
  //
  // DNS-name checks (not IP classification) stay explicit, mirroring _egress.py.
  const h = (hostname || "").toLowerCase().replace(/\.$/, "");
  if (
    h === "" || h === "localhost" ||
    h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")
  ) {
    return true;
  }

  // IP classification via ipaddr.js — the JS analogue of Python's stdlib `ipaddress`
  // (used in _egress.py). Only a globally-routable unicast address may be reached; every
  // special range (loopback, link-local, private, unique-local, multicast, reserved,
  // IPv4-mapped, ...) is refused. url.hostname wraps an IPv6 literal in brackets.
  const literal = h.replace(/^\[/, "").replace(/\]$/, "");
  if (!ipaddr.isValid(literal)) return false; // not an IP literal -> treat as a DNS name
  let addr = ipaddr.parse(literal);
  if (addr instanceof ipaddr.IPv6 && addr.isIPv4MappedAddress()) {
    addr = addr.toIPv4Address(); // classify the embedded IPv4 (e.g. ::ffff:169.254.169.254)
  }
  return addr.range() !== "unicast";
}

export function hostAllowed(url: URL, allowedHosts: string[]): boolean {
  if (!allowedHosts || allowedHosts.length === 0) return false; // default deny
  if (isInternalHost(url.hostname)) return false; // deny internal targets unconditionally
  const host = url.host; // host[:port]
  const hostname = url.hostname;
  return allowedHosts.some((raw) => {
    if (raw === "*") return false; // a bare "*" from the per-request envelope must not allow-all
    const pat = raw.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
    if (pat.startsWith("*.")) {
      const base = pat.slice(2);
      return hostname === base || hostname.endsWith("." + base);
    }
    return hostname === pat || host === pat;
  });
}

const MAX_REDIRECTS = 5;

// Build the `fetch` handed to user code. `nativeFetch` is injected (defaults to
// globalThis.fetch) so the redirect re-validation can be unit-tested with a stub.
export function makeFetch(
  allowedHosts: string[],
  nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis)
) {
  return async (input: any, init?: any) => {
    const raw = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`invalid fetch URL: ${raw}`);
    }
    if (!hostAllowed(url, allowedHosts)) {
      throw new Error(
        `outbound host not allowed by sandbox: ${url.host} (allowedHosts: ${JSON.stringify(allowedHosts)})`
      );
    }
    // Follow redirects manually so EVERY hop is re-checked against the allow-list — an
    // allow-listed host must not be able to 302 to an internal/metadata or otherwise
    // disallowed target. NOTE: this relies on `redirect: "manual"` being honored by the
    // Spin JS runtime; if it is not, fetch auto-follows and only the initial URL is
    // validated (the internal-host block still applies). Verify with a build+test.
    let curInput: any = input;
    let curInit: any = { ...(init || {}), redirect: "manual" };
    for (let hop = 0; ; hop++) {
      const resp = await nativeFetch(curInput, curInit);
      const location = typeof resp.headers?.get === "function" ? resp.headers.get("location") : null;
      if (resp.status >= 300 && resp.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new Error(`invalid redirect location: ${location}`);
        }
        if (!hostAllowed(next, allowedHosts)) {
          throw new Error(`redirect to disallowed host blocked: ${next.host}`);
        }
        url = next;
        curInput = next.toString();
        curInit = { ...curInit, redirect: "manual" };
        continue;
      }
      return resp;
    }
  };
}
