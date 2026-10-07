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

  const res = await itp.run("print(6*7)", { lang: "python", identity: "job-1", allowedHosts: ["api.x.com"], kvEnabled: true });

  assert.equal(res.stdout, "42\n");
  assert.equal(res.error, undefined);
  assert.equal(res.results.length, 0);

  // route + envelope
  assert.equal(mock.calls[0].url, "http://wasm.spin.internal/py/run");
  const env = JSON.parse(mock.calls[0].init.body);
  assert.equal(env.code, "print(6*7)");
  assert.equal(env.sandboxId, "job-1");
  assert.deepEqual(env.allowedHosts, ["api.x.com"]);
  assert.equal(env.kvEnabled, true);
});

test("run() defaults allowedHosts and kvEnabled to deny and uses /ts for javascript", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: "hi", stderr: "", error: null }) }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn, newId: () => "gen-id" });

  await itp.run("console.log('hi')", { lang: "javascript" });

  assert.equal(mock.calls[0].url, "http://w/ts/run");
  const env = JSON.parse(mock.calls[0].init.body);
  assert.deepEqual(env.allowedHosts, []);
  assert.equal(env.kvEnabled, false);
  assert.equal(env.sandboxId, "gen-id"); // generated when no identity
});

test("language-bound clients use their language for direct run() and runHandler() calls", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: "ok", stderr: "", error: null }) }));
  const javascript = Interpreter.javascript({ baseUrl: "http://w", fetch: mock.fn });

  await javascript.run("console.log('ok')");
  await javascript.runHandler("export default { fetch() {} }", { path: "/handler" });

  assert.equal(mock.calls[0].url, "http://w/ts/run");
  assert.equal(mock.calls[1].url, "http://w/ts/run");
  assert.equal(JSON.parse(mock.calls[1].init.body).input.path, "/handler");
  assert.deepEqual(javascript.capabilities().languages, ["javascript"]);
});

test("constructor lang defaults direct run() calls", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: "ok", stderr: "", error: null }) }));
  const javascript = new Interpreter({ baseUrl: "http://w", lang: "javascript", fetch: mock.fn });

  await javascript.run("console.log('ok')");

  assert.equal(mock.calls[0].url, "http://w/ts/run");
  assert.equal(JSON.parse(mock.calls[0].init.body).code, "console.log('ok')");
});

test("language-bound clients reject a mismatched language before making a request", async () => {
  const mock = mockFetch(() => ({ body: "{}" }));
  const python = Interpreter.python({ baseUrl: "http://py", fetch: mock.fn, bundlerUrl: "http://bundler" });

  await assert.rejects(() => python.run("console.log(1)", { lang: "javascript" }), /bound to python/);
  await assert.rejects(() => python.runRaw("src", { lang: "javascript" }), /bound to python/);
  await assert.rejects(() => python.bundle("src", { dependencies: {} }), /only supported/);
  assert.throws(() => python.kv("ns"), /only supported/);
  assert.equal(mock.calls.length, 0);
  assert.equal(python.capabilities().arbitraryImage, false);
});

test("an unbound client retains access to both language routes and JavaScript KV", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: "", stderr: "", error: null }) }));
  const itp = new Interpreter({ baseUrl: "http://combined", fetch: mock.fn, bundlerUrl: "http://bundler" });

  await itp.run("console.log(1)", { lang: "javascript" });
  itp.kv("ns");

  assert.equal(mock.calls[0].url, "http://combined/ts/run");
  assert.deepEqual(itp.capabilities().languages, ["python", "javascript"]);
  assert.equal(itp.capabilities().arbitraryImage, true);
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
  // compile_error with the detail on `message` is the ts-sandbox shape, so this is a JS run.
  const mock = mockFetch(() => ({
    ok: false,
    status: 400,
    body: JSON.stringify({ error: "compile_error", message: "SyntaxError: bad" }),
  }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  const res = await itp.run("def(", { lang: "javascript", identity: "c" });
  assert.ok(res.error);
  assert.equal(res.error?.name, "compile_error");
  assert.match(res.error?.value ?? "", /SyntaxError/);
});

test("run() maps a py handler_error keyed on `trace` (not `message`) to Result.error", async () => {
  // py-sandbox emits { error: "handler_error", trace: <traceback> }: the detail is on
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

test("runRaw() returns the sandbox Response verbatim and passes input.path", async () => {
  const mock = mockFetch(() => ({ status: 201, body: "<h1>hi</h1>" }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  const resp = await itp.runRaw("export default { fetch() {} }", {
    lang: "javascript",
    identity: "app-1",
    input: { path: "/foo", query: { a: "1" } },
  });

  assert.equal(resp.status, 201);
  assert.equal(await resp.text(), "<h1>hi</h1>");
  assert.equal(mock.calls[0].url, "http://w/ts/run");
  const env = JSON.parse(mock.calls[0].init.body);
  assert.equal(env.input.path, "/foo");
  assert.equal(env.sandboxId, "app-1");
});

test("kv().setJson runs a scoped snippet against the namespace", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: JSON.stringify({ ok: true }), stderr: "", error: null }) }));
  const itp = new Interpreter({ baseUrl: "http://w", fetch: mock.fn });

  await itp.kv("ns-1").setJson("counter", 7);

  // KV ops go through the JS (/ts) route, scoped by sandboxId == namespace.
  assert.equal(mock.calls[0].url, "http://w/ts/run");
  const env = JSON.parse(mock.calls[0].init.body);
  assert.equal(env.sandboxId, "ns-1");
  assert.equal(env.kvEnabled, true);
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

test("run() bundles packageJson via bundlerUrl, then runs the returned blob", async () => {
  const mock = mockFetch((url) =>
    url.endsWith("/bundle")
      ? { body: JSON.stringify({ blob: "BUNDLED();", stats: { fetches: 2 } }) }
      : { body: JSON.stringify({ stdout: "ok", stderr: "", error: null }) },
  );
  const itp = new Interpreter({ baseUrl: "http://ts", bundlerUrl: "http://bundler/", fetch: mock.fn });

  const res = await itp.run("import x from 'mustache'; console.log('hi')", {
    lang: "javascript",
    identity: "j",
    packageJson: { dependencies: { mustache: "^4.2.0" } },
  });

  assert.equal(res.stdout, "ok");
  // first call: bundler (source + package.json); second: sandbox
  assert.equal(mock.calls[0].url, "http://bundler/bundle");
  const bundleReq = JSON.parse(mock.calls[0].init.body);
  assert.match(bundleReq.source, /mustache/);
  assert.deepEqual(bundleReq.packageJson, { dependencies: { mustache: "^4.2.0" } });
  // the sandbox runs the BUNDLED blob, not the original source
  assert.equal(mock.calls[1].url, "http://ts/ts/run");
  const runEnv = JSON.parse(mock.calls[1].init.body);
  assert.equal(runEnv.code, "BUNDLED();");
  assert.equal(runEnv.sandboxId, "j");
});

test("run() without packageJson makes no bundler call", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ stdout: "x", stderr: "", error: null }) }));
  const itp = new Interpreter({ baseUrl: "http://ts", bundlerUrl: "http://bundler", fetch: mock.fn });

  await itp.run("console.log(1)", { lang: "javascript", identity: "j" });

  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, "http://ts/ts/run");
});

test("packageJson without a bundlerUrl throws before any network call", async () => {
  const mock = mockFetch(() => ({ body: "{}" }));
  const itp = new Interpreter({ baseUrl: "http://ts", fetch: mock.fn });

  await assert.rejects(
    () => itp.run("x", { lang: "javascript", packageJson: { dependencies: {} } }),
    /bundlerUrl/,
  );
  assert.equal(mock.calls.length, 0);
});

test("packageJson is rejected for python", async () => {
  const mock = mockFetch(() => ({ body: "{}" }));
  const itp = new Interpreter({ baseUrl: "http://py", bundlerUrl: "http://bundler", fetch: mock.fn });

  await assert.rejects(
    () => itp.run("x", { lang: "python", packageJson: { dependencies: { requests: "*" } } }),
    /only supported for javascript/,
  );
  assert.equal(mock.calls.length, 0);
});

test("a bundler failure throws with its message", async () => {
  const mock = mockFetch((url) =>
    url.endsWith("/bundle")
      ? { ok: false, status: 500, body: JSON.stringify({ error: "bundle_error", message: "boom" }) }
      : { body: "{}" },
  );
  const itp = new Interpreter({ baseUrl: "http://ts", bundlerUrl: "http://bundler", fetch: mock.fn });

  await assert.rejects(
    () => itp.run("x", { lang: "javascript", packageJson: { dependencies: {} } }),
    /bundler failed \(500\): boom/,
  );
});

test("runRaw() also bundles packageJson before running", async () => {
  const mock = mockFetch((url) =>
    url.endsWith("/bundle") ? { body: JSON.stringify({ blob: "BLOB" }) } : { status: 200, body: "<h1>hi</h1>" },
  );
  const itp = new Interpreter({ baseUrl: "http://ts", bundlerUrl: "http://bundler", fetch: mock.fn });

  const resp = await itp.runRaw("src", {
    lang: "javascript",
    packageJson: { dependencies: { m: "^1" } },
    input: { path: "/" },
  });

  assert.equal(await resp.text(), "<h1>hi</h1>");
  assert.equal(mock.calls[0].url, "http://bundler/bundle");
  assert.equal(JSON.parse(mock.calls[1].init.body).code, "BLOB");
});

test("capabilities().arbitraryImage is true only when a bundlerUrl is set", () => {
  assert.equal(new Interpreter({ baseUrl: "http://w" }).capabilities().arbitraryImage, false);
  assert.equal(new Interpreter({ baseUrl: "http://w", bundlerUrl: "http://b" }).capabilities().arbitraryImage, true);
});

test("bundle() posts source + package.json to the bundler and returns the blob (no run)", async () => {
  const mock = mockFetch(() => ({ body: JSON.stringify({ blob: "BUNDLED();", stats: {} }) }));
  const itp = new Interpreter({ baseUrl: "http://ts", bundlerUrl: "http://bundler/", fetch: mock.fn });

  const blob = await itp.bundle("import x from 'm'; x()", { dependencies: { m: "^1.0.0" } });

  assert.equal(blob, "BUNDLED();");
  assert.equal(mock.calls.length, 1); // only the bundler is hit; nothing is executed
  assert.equal(mock.calls[0].url, "http://bundler/bundle");
  const req = JSON.parse(mock.calls[0].init.body);
  assert.match(req.source, /import x/);
  assert.deepEqual(req.packageJson, { dependencies: { m: "^1.0.0" } });
});

test("bundle() without a bundlerUrl throws", async () => {
  const itp = new Interpreter({ baseUrl: "http://ts" });
  await assert.rejects(() => itp.bundle("x", { dependencies: {} }), /bundlerUrl/);
});
