# @spinframework/sandbox

An extensible TypeScript client for **sandboxed code execution**, consumed from a Spin
application. It ships one backend today — the **Wasm code interpreter** (this repo's
`ts-sandbox` / `py-sandbox` components) — and is built so another backend can be added later
without changing the portable surface.

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

const runner = new Interpreter({ baseUrl: "http://py-sandbox.spin.internal" });
console.log(await compute(runner, "print(6 * 7)"));
```

`run()` returns **data** (`{ stdout, stderr, results, error? }`) — an exception *inside* the
sandbox is `Result.error`, not a thrown error. `run()` only throws for transport/auth/
validation failures.

## Backends

- **`interpreter`** — a thin client over a wasm-sandbox component's `POST /ts/run` (JS/TS)
  and `/py/run` (Python) routes. Single-shot, buffered, default-deny egress, plus a scoped
  KV store (`Interpreter.kv(namespace)`).

  The intended deployment is **two private components** (ts-sandbox, py-sandbox) reached via
  service chaining. `.spin.internal` resolves to a **component id**, so each language has its
  own host — use **one `Interpreter` per language**, each `baseUrl` pointed at its component:

  ```ts
  const js = new Interpreter({ baseUrl: "http://ts-sandbox.spin.internal" });
  const py = new Interpreter({ baseUrl: "http://py-sandbox.spin.internal" });
  await js.run(code, { lang: "javascript" }); // -> ts-sandbox
  await py.run(code, { lang: "python" });      // -> py-sandbox
  ```

  See [`examples/ai-code-executor`](../examples/ai-code-executor). (A single combined app that routes both `/ts`
  and `/py` by path also works — then one `baseUrl` at the app suffices.)

## Extending it

The library ships **no other-backend types** — but it is designed to gain them:

- **`core`** (`./core`) is the only shared surface: `CodeRunner`, `RunOpts`, `Result`, and
  `Caps`. It carries no transport and nothing interpreter-specific.
- **`Backend`** is a widenable union (`"interpreter" | (string & {})`) — a new backend
  names itself without a breaking change.
- **`Caps`** already describes capabilities a heavier backend would light up (`filesystem`,
  `sessions`, `exec`, `lifecycle`, `arbitraryImage`, `realTimeout`), so a tool can branch on
  them at runtime; native TypeScript tools rely on compile-time method absence instead.

To add one: create a module under `src/`, implement `CodeRunner`, declare its `Caps`, and
export it from `src/index.ts`. Nothing in `core` or `interpreter` has to change.

## Develop

```bash
npm install
npm run typecheck    # tsc, incl. the compile-time contract assertions in test/types.assert.ts
npm test             # node --test (type-stripped)
npm run check        # both
```
