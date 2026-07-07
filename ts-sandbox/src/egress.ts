// Outbound egress control: per-sandbox allow-list on top of the broad Spin manifest
// bound. Pure logic (no Spin imports); `makeFetch` wraps `globalThis.fetch`.

// Loopback / link-local / private IPv4, keyed on the first two octets (all that the
// ranges below need). Kept in sync with Python's ipaddress-based check in _egress.py.
function isInternalV4(a: number, b: number): boolean {
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isInternalHost(hostname: string): boolean {
  // Loopback / link-local / private / internal targets are never reachable, even if
  // allow-listed — primary SSRF backstop (cloud metadata 169.254.169.254, *.spin.internal).
  const h = (hostname || "").toLowerCase().replace(/\.$/, "");
  if (
    h === "" || h === "localhost" ||
    h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")
  ) {
    return true;
  }
  const v6 = h.replace(/^\[/, "").replace(/\]$/, "");
  if (v6 === "::1" || v6 === "::" || /^f[cd][0-9a-f]*:/.test(v6) || v6.startsWith("fe80:")) return true;

  // IPv4-mapped IPv6 — the WHATWG URL parser normalizes e.g. ::ffff:169.254.169.254 to
  // ::ffff:a9fe:a9fe, so extract the embedded IPv4 and apply the v4 ranges. This keeps
  // the backstop in sync with Python, whose ipaddress module resolves the mapped v4.
  const mHex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mHex) {
    const hi = parseInt(mHex[1], 16);
    if (isInternalV4(hi >> 8, hi & 0xff)) return true;
  }
  const mDot = v6.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (mDot && isInternalV4(Number(mDot[1]), Number(mDot[2]))) return true;

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m && isInternalV4(Number(m[1]), Number(m[2]))) return true;
  return false;
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
