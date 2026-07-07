import { test } from "node:test";
import assert from "node:assert/strict";
import { isInternalHost, hostAllowed, makeFetch } from "../src/egress";

test("isInternalHost blocks loopback / link-local / private / internal", () => {
  const internal = [
    "localhost", "LOCALHOST", "", "svc.internal", "backend.spin.internal", "x.local", "y.localhost",
    "127.0.0.1", "0.0.0.0", "169.254.169.254", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "::1", "::", "fc00::1", "fd12::34", "fe80::1",
    // Ranges a hand-rolled check tends to miss but ipaddr.js classifies (and _egress.py
    // matches): carrier-grade NAT, multicast, broadcast, documentation/reserved.
    "100.64.0.1", "224.0.0.1", "255.255.255.255", "ff02::1", "2001:db8::1",
    // IPv4-mapped IPv6, in both the dotted and WHATWG-normalized hex forms. `[...]` is
    // what url.hostname actually yields for a bracketed literal.
    "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "[::ffff:a9fe:a9fe]",
  ];
  for (const h of internal) assert.equal(isInternalHost(h), true, `${h} should be internal`);
});

test("isInternalHost allows public hosts (including a public IPv4-mapped address)", () => {
  const pub = [
    "example.com", "api.example.com", "8.8.8.8", "172.32.0.1", "193.0.0.1", "2606:4700::1",
    "::ffff:8.8.8.8", "::ffff:0808:0808", // mapped public — must NOT be over-blocked
  ];
  for (const h of pub) assert.equal(isInternalHost(h), false, `${h} should be public`);
});

test("hostAllowed default-denies an empty allow-list", () => {
  assert.equal(hostAllowed(new URL("https://example.com/"), []), false);
});

test("hostAllowed matches exact host and wildcard subdomain", () => {
  assert.equal(hostAllowed(new URL("https://example.com/"), ["example.com"]), true);
  assert.equal(hostAllowed(new URL("https://api.example.com/"), ["*.example.com"]), true);
  assert.equal(hostAllowed(new URL("https://example.com/"), ["*.example.com"]), true);
  assert.equal(hostAllowed(new URL("https://evil.com/"), ["example.com"]), false);
  assert.equal(hostAllowed(new URL("https://notexample.com/"), ["*.example.com"]), false);
});

test("hostAllowed enforces the label boundary for wildcard subdomains", () => {
  for (const bad of ["evil-example.com", "example.com.evil.com", "xexample.com"]) {
    assert.equal(hostAllowed(new URL(`https://${bad}/`), ["*.example.com"]), false, bad);
  }
});

test('hostAllowed ignores a bare "*" (envelope cannot grant allow-all)', () => {
  assert.equal(hostAllowed(new URL("https://anything.com/"), ["*"]), false);
});

test("hostAllowed refuses an internal target even if explicitly allow-listed", () => {
  assert.equal(hostAllowed(new URL("http://169.254.169.254/"), ["169.254.169.254"]), false);
  assert.equal(hostAllowed(new URL("http://localhost/"), ["localhost"]), false);
});

test("makeFetch rejects a non-allow-listed host before calling fetch", async () => {
  let called = false;
  const stub = (async () => {
    called = true;
    return new Response("x");
  }) as unknown as typeof fetch;
  const f = makeFetch(["example.com"], stub);
  await assert.rejects(() => f("https://evil.com/"), /not allowed/);
  assert.equal(called, false);
});

test("makeFetch re-validates redirect hops and blocks a disallowed target", async () => {
  const stub = (async (input: any) => {
    const u = new URL(typeof input === "string" ? input : input.url);
    if (u.hostname === "example.com") {
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    }
    return new Response("reached", { status: 200 });
  }) as unknown as typeof fetch;
  const f = makeFetch(["example.com"], stub);
  await assert.rejects(() => f("https://example.com/"), /redirect to disallowed host blocked/);
});

test("makeFetch follows a redirect that stays within the allow-list", async () => {
  const stub = (async (input: any) => {
    const u = new URL(typeof input === "string" ? input : input.url);
    if (u.pathname === "/start") {
      return new Response(null, { status: 302, headers: { location: "https://example.com/end" } });
    }
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;
  const f = makeFetch(["example.com"], stub);
  const r = await f("https://example.com/start");
  assert.equal(await r.text(), "ok");
});

test("makeFetch bounds the redirect chain (too many redirects)", async () => {
  let hops = 0;
  const stub = (async () => {
    hops++;
    return new Response(null, { status: 302, headers: { location: "https://example.com/loop" } });
  }) as unknown as typeof fetch;
  const f = makeFetch(["example.com"], stub);
  await assert.rejects(() => f("https://example.com/loop"), /too many redirects/);
  assert.equal(hops, 6); // initial + MAX_REDIRECTS(5)
});
