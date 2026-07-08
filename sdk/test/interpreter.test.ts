import { test } from "node:test";
import assert from "node:assert/strict";

import { Interpreter } from "../src/interpreter/index.ts";

// A mock fetch that records the last request and returns a canned response.
function mockFetch(handler: (url: string, init: any) => { ok?: boolean; status?: number; body: string }) {
  const calls: Array<{ url: string; init: any }> = [];
  const fn = async (url: string, init: any) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      headers: { get: () => "application/json" },
      async text() {
        return r.body;
      },
    } as unknown as Response;
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

test("run() maps the main-program shape and selects the route + envelope", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: "42\n", stderr: "", error: null }) }));
  const itp = new Interpreter({ baseUrl: "http://wasm.spin.internal/", fetch: mock.fn });

  const res = await itp.run("print(6*7)", { lang: "python", identity: "job-1", allowedHosts: ["api.x.com"] });

  assert.equal(res.stdout, "42\n");
  assert.equal(res.error, undefined);
  assert.equal(res.results.length, 0);

  // route + envelope
  assert.equal(mock.calls[0].url, "http://wasm.spin.internal/py/run");
  const env = JSON.parse(mock.calls[0].init.body);
  assert.equal(env.code, "print(6*7)");
  assert.equal(env.sandboxId, "job-1");
  assert.deepEqual(env.allowedHosts, ["api.x.com"]);
});

test("run() defaults allowedHosts to [] (default-deny) and uses /ts for javascript", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: "hi", stderr: "", error: null }) }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn, newId: () => "gen-id" });

  await itp.run("console.log('hi')", { lang: "javascript" });

  assert.equal(mock.calls[0].url, "http://w/ts/run");
  const env = JSON.parse(mock.calls[0].init.body);
  assert.deepEqual(env.allowedHosts, []);
  assert.equal(env.sandboxId, "gen-id"); // generated when no identity
});

test("run() surfaces a runtime error string as Result.error (data, not throw)", async () => {
  const mock = mockFetch(() => ({
    body: JSON.stringify({ stdout: "", stderr: "", error: "Traceback...\nNameError: x" }),
  }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  const res = await itp.run("x", { lang: "python", identity: "e" });
  assert.ok(res.error);
  assert.equal(res.error?.name, "error");
  assert.match(res.error?.value ?? "", /NameError/);
});

test("run() maps a compile-error HTTP 400 to Result.error", async () => {
  const mock = mockFetch(() => ({
    ok: false,
    status: 400,
    body: JSON.stringify({ error: "compile_error", message: "SyntaxError: bad" }),
  }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  const res = await itp.run("def(", { lang: "python", identity: "c" });
  assert.ok(res.error);
  assert.equal(res.error?.name, "compile_error");
  assert.match(res.error?.value ?? "", /SyntaxError/);
});

test("run() maps a py handler_error keyed on `trace` (not `message`) to Result.error", async () => {
  // py-sandbox emits { error: "handler_error", trace: <traceback> } — the detail is on
  // `trace`, not `message`, so a `message`-only read would lose the traceback.
  const mock = mockFetch(() => ({
    ok: false,
    status: 500,
    body: JSON.stringify({ error: "handler_error", trace: "Traceback...\nValueError: boom" }),
  }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  const res = await itp.run("...", { lang: "python", identity: "h" });
  assert.ok(res.error);
  assert.equal(res.error?.name, "handler_error");
  assert.match(res.error?.value ?? "", /ValueError: boom/);
  assert.ok((res.error?.traceback.length ?? 0) > 0);
});

test("run() throws on an infrastructure error (bad envelope / internal)", async () => {
  const mock = mockFetch(() => ({
    ok: false,
    status: 400,
    body: JSON.stringify({ error: "invalid_envelope", message: "missing code" }),
  }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  await assert.rejects(() => itp.run("x", { identity: "i" }), /invalid|missing code|400/);
});

test("kv().setJson runs a scoped snippet against the namespace", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: JSON.stringify({ ok: true }), stderr: "", error: null }) }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  await itp.kv("ns-1").setJson("counter", 7);

  // KV ops go through the JS (/ts) route, scoped by sandboxId == namespace.
  assert.equal(mock.calls[0].url, "http://w/ts/run");
  const env = JSON.parse(mock.calls[0].init.body);
  assert.equal(env.sandboxId, "ns-1");
  assert.match(env.code, /openDefault/);
  assert.match(env.code, /setJson/);
  assert.match(env.code, /"counter"/);
  assert.match(env.code, /7/);
});

test("kv().getJson parses the snippet's JSON output", async () => {
  const mock = mockFetch(() => ({
    body: JSON.stringify({ stdout: JSON.stringify({ v: { hits: 3 } }), stderr: "", error: null }),
  }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  const v = await itp.kv("ns").getJson<{ hits: number }>("k");
  assert.deepEqual(v, { hits: 3 });
});

test("capabilities() reflect the interpreter's honest limits", () => {
  const caps = new Interpreter({ baseUrl: "http://w" }).capabilities();
  assert.equal(caps.filesystem, false);
  assert.equal(caps.sessions, false);
  assert.equal(caps.exec, false);
  assert.equal(caps.kv, true);
  assert.equal(caps.realTimeout, false);
  assert.equal(caps.streaming, false);
});
