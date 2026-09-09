# bundler tests

Two live layers, both run against the real Wasm components (bundler + ts-sandbox) over
HTTP. The earlier offline unit layer (a Node re-implementation of the sandbox replaying
recorded esm.sh fixtures) was removed: the live tests below assert the same claims
against the real engine, so the fixtures duplicated that coverage at lower fidelity.

## Layer 1: integration invariants

`integration.test.mjs` chains `POST /bundle` (bundler component) into `POST /ts/run`
(ts-sandbox component) and asserts the routing invariants: a new dependency is fetched,
inlined, and runs; a built-in is reused (0 fetches, not inlined, not in `__entry`);
version provenance; mixed new-dep + built-in source; the Node-builtin shims (axios);
and the engine limit that only reproduces on real StarlingMonkey (`\p{...}` regex, e.g.
`marked`, is rejected with `compile_error` while the bundler itself still succeeds).

```
npm test                    # builds ts-sandbox + bundler if needed, starts spin up, runs, tears down
```

Point it at an already-running server instead:

```
BUNDLER_BASE_URL=http://127.0.0.1:3000 node --test test/integration.test.mjs
```

With no `BUNDLER_BASE_URL` and no server, every integration test skips.

## Layer 2: compatibility sweep

`compat/` runs a broad matrix of real npm libraries through the same pipeline and
records what works and what does not. See
[compat/COMPATIBILITY.md](compat/COMPATIBILITY.md). Start the pipeline
(`spin up -f spin.test.toml`) and run `node compat/run.mjs`.

## Files

- `integration.test.mjs`  the invariant assertions (above).
- `integration-run.mjs`  orchestrator: builds the two components if missing, starts
  `spin up` (via `spin.test.toml`, ts-sandbox + bundler only), runs
  `integration.test.mjs`, tears down.
- `spin.test.toml`  trimmed manifest (no py-sandbox) used by both layers.
- `compat/`  the compatibility harness and record (`run.mjs`, `catalog.mjs`,
  `REPORT.md`, `results.json`).
