# bundler

> **Experimental.** The bundler resolves packages through [esm.sh](https://github.com/esm-dev/esm.sh/).
> Some packages may not bundle or run (see the [compatibility report](test/compat/COMPATIBILITY.md)),
> and its behavior and HTTP contract may change.

A Spin/StarlingMonkey component that turns `(source + package.json)` into one
self-contained CommonJS blob the unchanged `ts-sandbox` can execute.

It runs entirely inside StarlingMonkey (SpiderMonkey compiled to Wasm): no Node, no
esbuild at runtime. It is built the same way as `ts-sandbox` (esbuild bundles `src/`
and `sucrase`, then `j2w`/componentize-js produces the Wasm component).

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `esm_base_url` | no | Origin of the esm.sh server. Defaults to the public, rate-limited `https://esm.sh`; set it (e.g. `https://esm.example.com`) to use a [self-hosted instance](https://github.com/esm-dev/esm.sh/blob/main/HOSTING.md). Only the origin is used (no path), and it must match the component's `allowed_outbound_hosts`. |

Set it for the component and use it for the allow-list:

```toml
[variables]
esm_base_url = { default = "https://esm.sh" }

[component.bundler]
allowed_outbound_hosts = ["{{ esm_base_url }}"]
[component.bundler.variables]
esm_base_url = "{{ esm_base_url }}"
```

If the variable is empty or not passed to the component, the bundler uses `https://esm.sh`;
the manifest must still allow that host. An invalid value returns
`500 { "error": "esm_base_url_invalid" }`. A request whose imports are all pre-bundled packages
fetches nothing. A self-hosted server must serve every module from its own origin.

## HTTP contract

```
POST /bundle
{ "source": "import x from 'pkg'; ...", "packageJson": { "dependencies": { "pkg": "^1.0.0" } } }
```

`packageJson` may be an object or the raw package.json string. Response:

```json
{ "blob": "…self-contained CJS…", "stats": { "ms": 123, "fetches": 2, "modules": 2, "bytes": 9216 } }
```

Feed `blob` straight to the sandbox as `code`:

```
POST /ts/run
{ "code": "<blob>", "sandboxId": "…", "input": { … } }
```

## Authoring the `source`: use `import`, not `require`

Pull extra npm dependencies with ESM `import`, not `require()`:

```js
import Mustache from 'mustache';        // ok: the default export is unwrapped for you
const Mustache = require('mustache');   // Mustache.render is undefined (see below)
```

Dependencies arrive from esm.sh as ES modules, so `require('pkg')` returns the module
namespace (`{ default, …named }`). A package whose API is its default export then lives
under `.default`, i.e. `require('pkg').default.foo()`, and `require('pkg').foo()`
throws `foo is not a function`. `import X from 'pkg'` applies that default-interop
automatically, which is why it just works. The dependency is fetched and bundled either
way; this is a CJS/ESM interop detail, not a load failure. (The pre-bundled built-ins
may be `import`ed or `require()`d.)

## How it works

1. Scan the source for bare import specifiers. Skip the sandbox's 11 pre-bundled
   packages (`cheerio`, `zod`, `lodash`, `dayjs`, …); they stay as bare `require()`
   calls so they resolve to the in-Wasm copies, with no duplication and no version
   interference.
2. For each remaining dependency, fetch a near-standalone module from `esm.sh?bundle`
   (esm.sh does the dependency-graph resolution and tree-shaking server side).
3. Close the graph over esm.sh's own Node polyfill URLs. Substitute the curated shims
   in `src/shims.ts` (`buffer`, `process`, `events`, `util`, `path`, …) because
   esm.sh's minified `unenv` polyfills are mis-transpiled by sucrase. Uncovered
   builtins get a generic stub that compiles and only throws if actually called.
4. Transpile each module ESM to CJS with sucrase, then stitch a single blob whose
   `require()` resolves specifiers at runtime via the `URL` API (no string rewriting).

The blob carries a first-line marker that tells the sandbox it is already CommonJS, so
the sandbox skips its own sucrase pass and goes straight to
`new AsyncFunction("require","module","exports",…)`.

## Files

- `src/index.ts`  HTTP entry: validate request, call `bundle`, return `{ blob, stats }`.
- `src/bundler.ts`  the linker (fetch + sucrase + URL-resolved require).
- `src/shims.ts`  curated CJS shims for common Node builtins.

## Build and run

```
npm ci && npm run build     # -> dist/bundler.wasm
spin up                     # route /bundle is added in ../../spin.toml
```

## Known limits

- **Engine regex gaps.** Packages using unicode-property regex escapes (`\p{L}`,
  `\p{N}`, `\p{P}` with the `u` flag) fail to parse in this StarlingMonkey build with
  `invalid class property name in regular expression`. `marked@11` hits this. It is an
  engine capability gap, not a bundler issue: such code fails even if hand-written into
  the sandbox, and esm.sh/esbuild cannot downlevel these escapes at any target.
- **Node compatibility is best-effort.** Pure-JS/browser packages work. Node-ish
  packages work when the curated shim set covers what they touch; otherwise they throw
  a clear `[bundler] node builtin … is not available` at runtime.
- **No caching yet.** Every request re-fetches from esm.sh. A Spin KV cache keyed by
  `hash(source + deps)` (or per `package@version`) would make the warm path
  single-digit ms.
- **esm.sh is a third-party dependency.** The bundler trusts whatever `esm_base_url` serves, and its
  egress is limited to that origin in `spin.toml`.

## Validated (live, bundler component to sandbox component)

`mustache`, `qs`, `ramda`, `axios` (via node shims), and `mustache`+`zod` (handler
shape, built-in externalized) all bundle and execute end to end. `lodash` (a built-in)
bundles with zero fetches and resolves to the in-Wasm copy. The broad sweep in
[test/compat/COMPATIBILITY.md](test/compat/COMPATIBILITY.md) covers 571 libraries.
