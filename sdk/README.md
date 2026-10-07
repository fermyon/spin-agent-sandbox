# @spinframework/sandbox

An extensible TypeScript client for sandboxed code execution, consumed from a Spin
application. It ships one backend today, the Wasm code interpreter (this repo's
`ts-sandbox` / `py-sandbox` components), and is built so another backend can be added
later without changing the portable surface.

## The portable contract

Author a tool against the `CodeRunner` interface and it runs unchanged on any backend;
the host injects the concrete client at the edge.

```ts
import type { CodeRunner } from "@spinframework/sandbox/core";
import { Interpreter } from "@spinframework/sandbox/interpreter";

// A tool depends only on the interface, so the backend can be swapped without touching it.
async function compute(runner: CodeRunner, code: string) {
  const r = await runner.run(code, { lang: "python", allowedHosts: [] });
  if (r.error) throw new Error(`${r.error.name}: ${r.error.value}`);
  return r.stdout;
}

const runner = Interpreter.python({ baseUrl: "http://py-sandbox.spin.internal" });
console.log(await compute(runner, "print(6 * 7)"));
```

`run()` returns data (`{ stdout, stderr, results, error? }`): an exception inside the
sandbox is `Result.error`, not a thrown error. `run()` only throws for transport, auth,
or validation failures.

## Agent tools

`interpreterTool()` returns context for the languages served by one interpreter endpoint.
Adapt it to Anthropic or OpenAI tool shapes with `toAnthropicTool()` or `toOpenAITool()`.

```ts
import { interpreterTool, toAnthropicTool } from "@spinframework/sandbox/tools";

const tools = [toAnthropicTool(interpreterTool({ languages: ["javascript"] }))];
```

## Backends

- **`interpreter`**: a thin client over a wasm-sandbox component's `POST /ts/run`
  (JS/TS) and `/py/run` (Python) routes. Single-shot, buffered, default-deny egress,
  plus a scoped KV store (`Interpreter.kv(namespace)`).

  The intended deployment is two private components (ts-sandbox, py-sandbox) reached
  via service chaining. `.spin.internal` resolves to a component id, so each language
  has its own host: use one `Interpreter` per language, each `baseUrl` pointed at its
  component:

  ```ts
  const js = Interpreter.javascript({ baseUrl: "http://ts-sandbox.spin.internal" });
  const py = Interpreter.python({ baseUrl: "http://py-sandbox.spin.internal" });
  await js.execute(code); // ts-sandbox
  await py.execute(code); // py-sandbox
  ```

  `Interpreter.javascript({ baseUrl })` is shorthand for `new Interpreter({ baseUrl,
  lang: "javascript" })`. Language-bound clients reject a mismatched `lang` option. Create an unbound
  `new Interpreter({ baseUrl })` only when one endpoint really serves both `/ts` and
  `/py`; scoped KV and npm bundling require that unbound client or a JavaScript client.

  To invoke an HTTP handler, use `runHandler()` rather than manually constructing an
  envelope. It returns the handler's `Response`, including a streamed response body:

  ```ts
  const response = await py.runHandler(
    `def handle_request(request): return (200, {}, "hello")`,
    { path: "/hello" },
  );
  console.log(await response.text());
  ```

  See [`examples/ai-code-executor`](../examples/ai-code-executor). (A single combined
  app that routes both `/ts` and `/py` by path also works; then one `baseUrl` at the
  app suffices.)

## Extending it

The library ships no other-backend types, but it is designed to gain them:

- **`core`** (`./core`) is the only shared surface: `CodeRunner`, `RunOpts`, `Result`,
  and `Caps`. It carries no transport and nothing interpreter-specific.
- **`Backend`** is a widenable union (`"interpreter" | (string & {})`), so a new
  backend names itself without a breaking change.
- **`Caps`** already describes capabilities a heavier backend would light up
  (`filesystem`, `sessions`, `exec`, `lifecycle`, `arbitraryImage`, `realTimeout`), so
  a tool can branch on them at runtime; native TypeScript tools rely on compile-time
  method absence instead.

To add one: create a module under `src/`, implement `CodeRunner`, declare its `Caps`,
and export it from `src/index.ts`. Nothing in `core` or `interpreter` has to change.

## Develop

```bash
npm install
npm run typecheck    # tsc, incl. the compile-time contract assertions in test/types.assert.ts
npm test             # node --test (runs the .ts tests directly)
npm run check        # both
```

`npm test` runs the TypeScript tests through Node's built-in runner with no build step, so
it needs Node 24+ (native type stripping, plus `--test` glob support).

To test the SDK against real sandbox components, first start the root application, then run:

```bash
SANDBOX_BASE_URL=http://127.0.0.1:3007 npm run test:components
```
