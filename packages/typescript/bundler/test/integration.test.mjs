// Integration tests against the REAL Wasm components (bundler + ts-sandbox) over HTTP.
// They chain POST /bundle -> POST /ts/run and assert the full claim set end to end,
// including the engine-limitation claim that only reproduces on real StarlingMonkey.
//
// Point them at a running `spin up` via BUNDLER_BASE_URL, or let the runner start one:
//   npm run test:integration          # builds (if needed) + starts spin + runs these
//   BUNDLER_BASE_URL=http://127.0.0.1:3000 node --test test/integration.test.mjs
//
// With no BUNDLER_BASE_URL set, every test SKIPS (so `node --test test/*.mjs` stays green
// in environments without Spin).

import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BUNDLER_BASE_URL;
const skip = BASE ? false : "set BUNDLER_BASE_URL (or use `npm run test:integration`)";

async function bundleReq(source, deps) {
  const r = await fetch(`${BASE}/bundle`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, packageJson: { dependencies: deps } }), signal: AbortSignal.timeout(45000) });
  return r.json();
}
async function sandboxRun(code) {
  const r = await fetch(`${BASE}/ts/run`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, sandboxId: "it", input: {} }), signal: AbortSignal.timeout(45000) });
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, body: ct.includes("application/json") ? await r.json() : await r.text() };
}

test("negative control: the sandbox itself does not have a new dependency", { skip }, async () => {
  const s = await sandboxRun(`try { require('mustache'); console.log('PRESENT'); } catch (e) { console.log('ABSENT:' + e.message); }`);
  assert.match(s.body.stdout, /ABSENT:module not found: 'mustache'/);
  const listed = s.body.stdout.split("fixed set of modules:")[1] || "";
  assert.doesNotMatch(listed, /mustache/, "mustache must not be one of the built-ins");
});

test("new dependency is added and runs end to end (bundler -> sandbox)", { skip }, async () => {
  const src = `import M from 'mustache';\nconsole.log('OUT:' + M.render('{{a}}-{{b}}', { a: 7, b: 8 }));`;
  const b = await bundleReq(src, { mustache: "^4.2.0" });
  assert.ok(!b.error, `bundle failed: ${b.error} ${b.message || ""}`);
  assert.ok(b.stats.fetches > 0, "a new dep must be fetched");
  assert.match(b.blob, /esm\.sh - mustache@/, "mustache must be inlined");

  const s = await sandboxRun(b.blob);
  assert.equal(s.body.error, null, s.body.error || "");
  assert.match(s.body.stdout, /OUT:7-8/);
});

test("built-in dependency is reused, not fetched or inlined", { skip }, async () => {
  const src = `import { chunk } from 'lodash';\nconsole.log('OUT:' + JSON.stringify(chunk([1,2,3,4], 2)));`;
  const b = await bundleReq(src, {});
  assert.equal(b.stats.fetches, 0, "a built-in must not be fetched");
  assert.doesNotMatch(b.blob, /esm\.sh\/lodash/, "a built-in must not be inlined");

  const s = await sandboxRun(b.blob);
  assert.equal(s.body.error, null, s.body.error || "");
  assert.match(s.body.stdout, /OUT:\[\[1,2\],\[3,4\]\]/);
});

test("version provenance: the requested version is what gets fetched", { skip }, async () => {
  const src = `import M from 'mustache';\nconsole.log(M.render('{{v}}', { v: 'x' }));`;
  const a = await bundleReq(src, { mustache: "4.2.0" });
  const b = await bundleReq(src, { mustache: "4.0.1" });
  assert.match(a.blob, /esm\.sh - mustache@4\.2\.0/);
  assert.match(b.blob, /esm\.sh - mustache@4\.0\.1/);
});

test("mixed source: new dep inlined, built-in stays external, handler runs", { skip }, async () => {
  const src = `import M from 'mustache';\nimport { z } from 'zod';\nexport default { async fetch(req){ z.string().parse('ok'); return new Response(M.render('{{a}}', { a: 'ok' })); } };`;
  const b = await bundleReq(src, { mustache: "^4.2.0" });
  assert.match(b.blob, /esm\.sh - mustache@/, "mustache inlined");
  assert.doesNotMatch(b.blob, /esm\.sh\/zod/, "zod not inlined");
  assert.equal(b.stats.fetches, 2, "only mustache and its bundle are fetched; zod is not");

  const s = await sandboxRun(b.blob);
  assert.equal(s.status, 200);
  assert.equal(s.body, "ok"); // handler Response body
});

test("node-builtin shims: axios bundles and is usable in the sandbox", { skip }, async () => {
  const src = `import axios from 'axios';\nexport default { async fetch(req){ return new Response('get is ' + typeof axios.get); } };`;
  const b = await bundleReq(src, { axios: "^1.6.0" });
  assert.ok(!b.error, `bundle failed: ${b.error} ${b.message || ""}`);
  const s = await sandboxRun(b.blob);
  assert.equal(s.status, 200);
  assert.equal(s.body, "get is function");
});

// The engine-limitation claim: only reproducible on real StarlingMonkey (Node's V8 accepts
// these regexes). The bundler produces a valid blob; the sandbox's engine rejects the regex.
test("engine limit: unicode-property regex (\\p{...}) is rejected by StarlingMonkey", { skip }, async () => {
  // direct proof: the regex literal alone fails to compile in the sandbox
  const direct = await sandboxRun(`console.log(/[\\p{L}\\p{N}]/u.test('a'));`);
  assert.equal(direct.body.error, "compile_error");
  assert.match(direct.body.message, /invalid class property name in regular expression/);

  // and marked (which uses such regexes) bundles fine but fails at the sandbox, not the bundler
  const b = await bundleReq(`import { marked } from 'marked';\nexport default { async fetch(){ return new Response(marked.parse('# h')); } };`, { marked: "^11.0.0" });
  assert.ok(!b.error, "the BUNDLER still succeeds (the blob is well-formed)");
  const s = await sandboxRun(b.blob);
  assert.equal(s.body.error, "compile_error", "the SANDBOX engine rejects it, not the bundler");
  assert.match(s.body.message, /invalid class property name in regular expression/);
});
