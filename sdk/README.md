# @spinframework/sandbox

An extensible TypeScript client for **sandboxed code execution**, consumed from a Spin
application. It ships one backend today — the **Wasm code interpreter** (this repo's
`ts-sandbox` / `py-sandbox` components) — and is built so a **container** or **microVM**
backend can be added later without changing the portable surface.

## The portable contract

Author a tool against the `CodeRunner` interface and it runs unchanged on any backend; the
host injects the concrete client at the edge.

```ts
import type { CodeRunner } from "@spinframework/sandbox/core";
import { Interpreter } from "@spinframework/sandbox/interpreter";

// A tool depends only on the interface — swap the backend without touching it.
async function compute(runner: CodeRunner, code: string) {
  const r = await runner.run(code, { lang: "python", allowedHosts: [] });
  if (r.error) throw new Error(`${r.error.name}: ${r.error.value}`);
  return r.stdout;
}

const runner = new Interpreter({ baseUrl: "http://wasm-sandbox.spin.internal" });
console.log(await compute(runner, "print(6 * 7)"));
```

`run()` returns **data** (`{ stdout, stderr, results, error? }`) — an exception *inside* the
sandbox is `Result.error`, not a thrown error. `run()` only throws for transport/auth/
validation failures.

## Backends

- **`interpreter`** — a thin client over the wasm-sandbox app's `POST /ts/run` and
  `/py/run` routes. Single-shot, buffered, default-deny egress, plus a scoped KV store
  (`Interpreter.kv(namespace)`). From a Spin guest, `baseUrl` is typically
  `http://<wasm-app>.spin.internal` (service chaining) or a URL the caller lists in
  `allowed_outbound_hosts`.

## Extending it

The library has **no container/microVM types** — but it is designed to gain them:

- **`core`** (`./core`) is the only shared surface: `CodeRunner`, `RunOpts`, `Result`, and
  `Caps`. It carries no transport and nothing interpreter-specific.
- **`Backend`** is a widenable union (`"interpreter" | (string & {})`) — a new backend
  names itself without a breaking change.
- **`Caps`** already describes capabilities a heavier backend would light up (`filesystem`,
  `sessions`, `exec`, `lifecycle`, `arbitraryImage`, `realTimeout`), so a tool can branch on
  them at runtime; native TypeScript tools rely on compile-time method absence instead.

To add one: create `src/container/index.ts` (or `src/microvm/…`), implement `CodeRunner`,
declare its `Caps`, and export it from `src/index.ts`. Nothing in `core` or `interpreter`
has to change.

## Develop

```bash
npm install
npm run typecheck    # tsc, incl. the compile-time contract assertions in test/types.assert.ts
npm test             # node --test (type-stripped)
npm run check        # both
```
