# Spin Application

This is a [Spin](https://developer.fermyon.com/spin/v3) application — a WebAssembly
(Wasm) serverless functions framework. Each component is compiled to Wasm and
runs in an isolated sandbox.

## Project structure

```
spin.toml                   # Application manifest — defines triggers, components, and variables
tests/                      # Hurl integration tests
<component-name>/           # Each component lives in its own subdirectory
```

Components are added with `spin add -t <template>` and each gets its own directory
with independent source, build toolchain, and dependencies.

## spin.toml manifest

The manifest (`spin.toml`) is the source of truth. 
Always reference the official documentation: https://spinframework.dev/v3/manifest-reference

Key sections:

- **`[variables]`** — Application-wide variables (e.g. `log_level`). Components
  access these through their SDK. Variable values can be overridden at runtime
  via environment variables: `SPIN_VARIABLE_LOG_LEVEL=debug spin up`.
- **`[[trigger.http]]`** — Maps an HTTP route to a component. Routes use `/...`
  as a wildcard suffix (e.g. `route = "/api/..."`). The component receives the
  full request path including the prefix.
- **`[component.<name>]`** — Defines source wasm path, build command, allowed
  outbound hosts, and which variables are passed to the component.
- **`[component.<name>.variables]`** — Binds application variables to component
  variables using `{{variable_name}}` syntax (this is Spin syntax, not a template).

You can find a list of examples and samples here: https://github.com/fermyon/fwf-examples

And some other patterns here: https://github.com/fermyon/enterprise-architectures-and-patterns

### Adding outbound networking

By default, `allowed_outbound_hosts = []` blocks all outbound requests. To allow
a component to make HTTP calls, add hosts explicitly:

```toml
allowed_outbound_hosts = ["https://api.example.com"]
```

Use `"https://*:*"` to allow all outbound HTTPS (not recommended for production).

### Using key-value storage

Documentation: https://spinframework.dev/v3/kv-store-api-guide

Spin comes with a built-in key-value storage that is implementaed by default everywhere you run Spin applications.
Use the built-in APIs in Rust and TypeScript to access it.

Components must be allowed to use KV stores. To do so, add the following to thecomponent configuration:

```toml
[component.example]
key_value_stores = ["default"]
```

The key value store is a great built-in persistence layer for non-relational data.

#### Rust KV

```rust
let store = spin_sdk::key_value::Store::open_default()?;
store.set("key", b"value")?;
let val = store.get("key")?;
```

#### TypeScript KV

```typescript
import * as kv from '@spinframework/spin-kv';

const store = kv.open('default');
store.setJson("session:abc", { user: "alice", role: "admin" });
const session = store.getJson("session:abc");
const keys = store.getKeys().filter(k => k.startsWith("session:"));
```

### Application Variables

Documentation: https://spinframework.dev/v3/variables

Application variables and secrets should be configured using Spin variables. Only suggest default values (in `spin.toml`)
for non-sensitive values. All secrets should have `secret=true`

```toml
[variables]
log_level = { default = "info" }
redis_password = { required = true, secret = true }
api_token = { required = true }
api_uri = { default = "http://my-api.com" }
```

Variables are surfaced to a specific component by adding a [component.(name).variables] section to the component and referencing them within it. The [component.(name).variables] section contains a mapping of component variables and values. Entries can be static (like `api_version` below) or reference an updatable application variable (like `token` below) using mustache-inspired string templates. Only components that explicitly use variables in their configuration section will get access to them. This enables only exposing variables (such as secrets) to the desired components of an application.


```toml
[component.(name).variables]
token = "{{ api_token }}"
api_uri = "{{ api_uri }}"
api_version = "v1"
```

Variables can also be used in other sections of the application manifest that benefit from runtime configuration. In these cases, the variables are substituted at application load time rather than dynamically updated while the application is running. For example, the `allowed_outbound_hosts` can be dynamically configured using variables as follows:

```
[component.(name)]
allowed_outbound_hosts = [ "{{ api_uri }}" ]
```

## Bundling files with components

Documentation: https://spinframework.dev/v3/writing-apps#including-files-with-components

Example:

```toml
[component.asset-server]
files = [ "images/**/*.jpg", { source = "styles/dist", destination = "/styles" } ]
```

By default, Spin takes a snapshot of your included files, and components access that snapshot. This ensures that when you test your application, you are checking it with the set of files it will be deployed with. However, it also means that your component does not pick up changes to the files while it is running. When testing a Web site, you might want to be able to edit a HTML or CSS file, and see the changes reflected without restarting Spin. You can tell Spin to give components access to the original, “live” files by passing the --direct-mounts flag to spin up.

Each component can access only the files included via its files section. It does not have access to files included by other components, to your source code, or to the compiled .wasm file (unless you add those to the files section).

## A static fileserver

If an application requires a static file server, there is an optimized implementation here: https://github.com/spinframework/spin-fileserver

To add the static file server, use: `spin add -t static-fileserver`

## Frontend applications (SPA + API)

The recommended pattern for frontend apps is client-side rendering served by
the Spin static fileserver, with the API as a separate component. This keeps
the frontend and backend independently deployable and cacheable.

### Architecture

```
spin.toml
frontend/              # SPA source (React, Vue, Nuxt, Svelte, etc.)
  dist/                # Build output served by fileserver
api/                   # API component (Rust or TypeScript)
```

Route ordering in spin.toml matters — **more specific routes must come first**:

```toml
# API route — must come before the catch-all
[[trigger.http]]
route = "/api/..."
component = "api"

# Frontend catch-all — serves static files, falls back to index.html for SPA routing
[[trigger.http]]
route = "/..."
component = "frontend"

[component.frontend]
source = { url = "https://github.com/spinframework/spin-fileserver/releases/download/v0.3.0/spin_static_fs.wasm", digest = "sha256:..." }
files = [{ source = "frontend/dist", destination = "/" }]
environment = { FALLBACK_PATH = "index.html" }
```

`FALLBACK_PATH = "index.html"` is critical for SPAs — it ensures that
client-side routes (e.g. `/dashboard/settings`) serve `index.html` instead
of returning 404, letting the frontend router handle them.

### Frontend API calls

The frontend should use **relative URLs** (e.g. `/api/...`) so requests
go through the same origin in both local development and production:

```typescript
const resp = await fetch("/api/items", {
  headers: { "authorization": `Bearer ${token}` },
});
const data = await resp.json();
```

### API proxy for external services

If the frontend needs to reach external APIs, add a proxy component instead
of calling them directly from the browser (avoids CORS and keeps secrets
server-side):

```typescript
// api/src/index.ts (Hono proxy example)
import { Hono } from 'hono';
import { get as getVariable } from '@spinframework/spin-variables';

const app = new Hono();

app.all('/api/external/*', async (c) => {
  const backendUrl = getVariable('external_api_url');
  const path = c.req.path.replace('/api/external', '');
  const resp = await fetch(`${backendUrl}${path}`, {
    method: c.req.method,
    headers: { "authorization": `Bearer ${getVariable('external_api_token')}` },
    body: c.req.method !== 'GET' ? await c.req.arrayBuffer() : undefined,
  });
  return new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
});
```

This keeps API tokens in Spin variables (never exposed to the browser) and
avoids CORS entirely since the frontend calls its own origin.

### Build setup

ALWAYS try to use static site generation for client side rendering.

Most frontend frameworks support static site generation:

| Framework | Build command | Output directory |
|---|---|---|
| Vite (React/Vue/Svelte) | `npm run build` | `dist/` |
| Nuxt | `npx nuxt generate` | `.output/public/` |
| Next.js (static export) | `npx next build` | `out/` |

Update the `files` source in spin.toml to match your framework's output
directory. Add the build command to the component:

```toml
[component.frontend.build]
command = "npm install && npm run build"
workdir = "frontend"
```

## Service chaining (inter-component communication)

Spin components within the same application can call each other using internal
hostnames: `http://<component-name>.spin.internal`. This avoids going through
the public endpoint and is much faster.

The calling component must allow the internal host in `allowed_outbound_hosts`:

```toml
[component.frontend]
allowed_outbound_hosts = ["http://backend-api.spin.internal"]
```

### Rust

```rust
let req = spin_sdk::http::Request::builder()
    .method(spin_sdk::http::Method::Post)
    .uri("http://backend-api.spin.internal/internal/data")
    .header("content-type", "application/json")
    .body(serde_json::to_vec(&payload)?)
    .build();
let resp: spin_sdk::http::Response = spin_sdk::http::send(req).await?;
```

### TypeScript

```typescript
const resp = await fetch("http://backend-api.spin.internal/internal/data", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
```

## Authentication patterns

### Rust — check_auth helper

A pattern that returns `None` on success and `Some(Response)` on failure,
so handlers can early-return:

```rust
pub fn check_auth(req: &Request) -> Option<Response> {
    let expected = spin_sdk::variables::get("auth_token").ok()?;
    let header_value = req.header("authorization")?.as_str()?;
    let token = header_value.strip_prefix("Bearer ")
        .or_else(|| header_value.strip_prefix("bearer "));
    match token {
        Some(t) if t == expected => None,
        _ => Some(http::error_response(403, "invalid or missing bearer token")),
    }
}

// In a handler:
pub async fn my_handler(req: Request, _params: Params) -> Result<impl IntoResponse> {
    if let Some(resp) = check_auth(&req) {
        return Ok(resp);
    }
    // ... proceed
}
```

### TypeScript (Hono) — auth middleware

```typescript
import { get as getVariable } from "@spinframework/spin-variables";

app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("authorization");
  const expected = getVariable("auth_token");
  if (!authHeader || authHeader !== `Bearer ${expected}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});
```

Both patterns require an `auth_token` application variable:

```toml
[variables]
auth_token = { required = true, secret = true }
```

## Client IP extraction

When running behind a proxy or CDN, use this header priority to find the real
client IP: `true-client-ip` → `x-forwarded-for` (first entry) → `x-real-ip`
→ `spin-client-addr`.

```rust
fn client_ip(req: &Request) -> Option<String> {
    for header in ["true-client-ip", "x-forwarded-for", "x-real-ip", "spin-client-addr"] {
        if let Some(val) = req.header(header) {
            let ip = val.as_str().unwrap_or_default().split(',').next().unwrap_or_default().trim();
            if !ip.is_empty() {
                return Some(ip.to_string());
            }
        }
    }
    None
}
```

## Rust components

Documentation: https://spinframework.dev/v3/rust-components
SDK Reference: https://docs.rs/spin-sdk/latest/spin_sdk/index.html

Rust components use `spin-sdk` and compile to `wasm32-wasip1`.

- Entry point: `src/lib.rs` with `#[http_component]`
- Router: `spin_sdk::http::Router` — register handlers with `.get_async("/*", handler)`
- Tracing: `setup::setup_tracing()` is called on each request. It reads the
  `log_level` variable and configures `tracing-subscriber` with two layers:
  errors → stderr, everything else → stdout.
- Use `tracing::info!()`, `tracing::debug!()`, etc. for structured logging.
- Build: `cargo build --target wasm32-wasip1 --release`
- Key dependencies: `spin-sdk`, `tracing`, `tracing-subscriber`

### Response helpers (`src/http.rs`)

The template includes `http::json_response`, `http::error_response`, and
`http::plain_response` helpers. Use these instead of building responses manually:

```rust
use crate::http;

Ok(http::json_response(200, &serde_json::json!({ "status": "ok" })))
Ok(http::error_response(400, "missing required field"))
Ok(http::plain_response(200, "pong"))
```

### JSON request parsing

Use `serde_json::from_slice` with a match to return structured errors:

```rust
let body = req.body();
let payload: MyRequest = match serde_json::from_slice(body) {
    Ok(p) => p,
    Err(e) => return Ok(http::error_response(400, &format!("invalid JSON: {e}"))),
};
```

When adding new routes, register them on the `Router` in the `handle` function:

```rust
router.get_async("/my-path/*", my_handler);
router.post_async("/submit/*", submit_handler);
```


If you need to perform any concurrency, check the following WASIp3 examples:

* WASIp3 hello world: https://github.com/spinframework/spin-rust-sdk/blob/main/examples/wasip3-http-hello-world/src/lib.rs
* sending outbound requests: https://github.com/spinframework/spin-rust-sdk/blob/main/examples/wasip3-http-send-request/src/lib.rs
* streaming: https://github.com/spinframework/spin-rust-sdk/blob/main/examples/wasip3-streaming/src/lib.rs
* concurrent outbound HTTP requests: https://github.com/spinframework/spin-rust-sdk/blob/main/examples/wasip3-concurrent-outbound-http-calls/src/lib.rs


There is a very useful pattern where you can bundle data with your Rust function, then initialize it.

This means when invoking your function, it can use that data (read-only) without any external I/O.
This is a HUGE performance improvement over reading from KV (~10+ms) or any external data store (100+ms depending on regions).

Only suggest this pattern when it has significant performance improvements for read-heavy, read-only functions, where reading off KV is too slow, and opening files on each request generates too much disk I/O.

* repo: https://github.com/radu-matei/spin-sqlite-example

```rust
// Some global variable to hold your data (or "handle").
static DB: OnceLock<Db> = OnceLock::new();

// The initialization function
#[export_name = "wizer.initialize"]
pub extern "C" fn init() {
    std::io::stdin()
        .read_line(&mut db_path)
        .expect("failed to read db path from stdin");

    eprintln!("Loading {db_path} into memory");

    let mut dst = Connection::open_in_memory().expect("failed to open in-memory db");

    // Setting the global variable with the data.
    DB.set(Db(dst)).ok().expect("DB already initialized");
}
```

This process embeds the data into the compiled Wasm binary, which means:

* the data is available immediately when the function starts, without any additional I/O overhead
* at runtime, the data is entirely read-only (you can modify it for the duration of the requests, but state is not persisted)
* there may be interesting patterns where you bundle a "large" (tens of MB) file with your function, then use KV to distribute the delta for the changes.

* downside: this increases the total size of your binary.

## TypeScript components

TypeScript components compile to Wasm via `esbuild` + `@spinframework/build-tools`.

- Entry point: `src/index.ts`
- Router: Hono (`hono`) or itty-router (`itty-router`), chosen at template time.
- Logging: `src/logger.ts` reads the `log_level` variable via
  `@spinframework/spin-variables` and provides `log.info()`, `log.debug()`, etc.
  `initLogger()` must be called per request (done in middleware).
- Build: `npm run build` (runs esbuild, then `j2w` to produce the `.wasm` file)
- Errors go to `console.error()`, everything else to `console.log()`.

When adding new routes (Hono example):

```typescript
app.get('/my-prefix/items/:id', (c: Context) => {
  log.info(`Fetching item ${c.req.param('id')}`);
  return c.json({ id: c.req.param('id') });
});

app.post('/my-prefix/items', async (c: Context) => {
  const body = await c.req.json();
  return c.json(body, 201);
});
```

Route paths must include the full prefix matching the `[[trigger.http]] route`
in `spin.toml` (Spin does not strip the prefix before handing the request to
the component).


In JavaScript, the runtime does not usually support code outside the handlers (other than initialization without calling external imports). So any code you add, ensure it runs inside the fetch handler.

## Shared types between Rust components

For apps with multiple Rust components that exchange data (via service chaining
or shared storage), create a shared types crate:

```
shared-types/
├── Cargo.toml
└── src/
    └── lib.rs
```

```toml
# shared-types/Cargo.toml
[package]
name = "shared-types"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
```

```rust
// shared-types/src/lib.rs
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RouteRequest {
    pub client_ip: String,
    pub model: String,
}
```

Then reference it from each component's `Cargo.toml`:

```toml
[dependencies]
shared-types = { path = "../shared-types" }
```

This avoids duplicating struct definitions and keeps serialization consistent
across components. Keep this crate serde-only (no SDK dependencies) so it
stays lightweight.

## Building and running

```bash
spin build                  # Build all components
spin up                     # Build and serve locally (default: http://127.0.0.1:3000)
spin watch                  # Rebuild and restart on file changes
```

## Testing

Integration tests use [Hurl](https://hurl.dev). Run against a live instance:

```bash
hurl --variable base_url=http://127.0.0.1:3000 tests/*.hurl
```

## Deploying to Akamai Functions

Akamai Functions is a hosted, global service for functions. It was originally Fermyon Wasm Functions, so whenever you see references to Fermyon Wasm Functions, or FWF, it is Akamai Functions.

When working with Akamai functions and the `spin aka` plugin, ALWAYS ask for and provide the `--account-id` flag.

The `spin aka` plugin reference: https://developer.fermyon.com/wasm-functions/aka-command-reference
Deploying to Akamai Functions: https://developer.fermyon.com/wasm-functions/deploy
Deploying to Akamai Functions using GitHub Actions: https://developer.fermyon.com/wasm-functions/github-actions
Note: *always* pass `--account-id` and `--app-id` when deploying or deleting Functions.

```yaml
name: Deploy to Akamai Functions

jobs:
    steps:
    - name: Clone repository
      uses: actions/checkout@v4

    - name: Install Spin
      run: |
        curl -fsSL https://wasm-functions.fermyon.app/downloads/install.sh | bash
        mv spin /usr/local/bin/spin

    - name: Build
      run: spin build

    - name: Login to Akamai Functions
      run: spin aka login --token ${{ secrets.SPIN_AKA_ACCESS_TOKEN }}

    - name: Link environment to production function
      run: spin aka app link --app-id ${{ vars.SPIN_AKA_APP_ID }} --account-id ${{ vars.SPIN_AKA_ACCOUNT_ID }}

    - name: Deploy
      run: spin aka deploy --app-id ${{ vars.SPIN_AKA_APP_ID }} --no-confirm --account-id ${{ vars.SPIN_AKA_ACCOUNT_ID }}
```

## Local development dashboard: `spin dashboard`

Repository: https://github.com/radu-matei/dash
Installing: `spin plugins install --url https://github.com/radu-matei/dash/releases/download/canary/dashboard.json`

Starting the dashboard with an application overview, visualization, logs, metrics, traces, and HTTP test runner: `spin dashboard`.


## Tracing, logging

Logging is already configured to use the `log_level` variable.

In Rust, use the tracing library. In TypeScript, the `log` object.

The logging patterns above generate timestamps you can use to understand how expensive certain operations are. If you can read logs... I cannot do mental math with timestamps, so I add explicit timings to my logs for the things I care about:

```rust
        let start = Instant::now();
        let loc = match fermyon::geoip::lookup::lookup(&payload.ip) {
        // do some expensive operation
        let duration_ms = (start.elapsed().as_secs_f64() * 100_000.0).round() / 100.0;

        tracing::info!(
            "route: {} -> {} ({}) for model {} [{}] at {:.1}km, util {:.1}% in {duration_ms:.2}ms", ...
        );
```

This generates a log like that looks like this:

```
2026-02-26T07:30:23.166183Z  INFO controlplane::routing: route: 85.122.195.187 -> fr-par-2 (172.239.9.12) for model google/gemma-3-4b-it [cold] at 264.3km, util 0.0% in 18348.62ms client_ip="85.122.195.187" client_lat=50.8534 client_lon=4.347 model="google/gemma-3-4b-it" node="fr-par-2" node_ip="172.239.9.12" model_status="cold" distance_km=264.3 utilization_pct=0.0 reason="best_cold" duration_ms=18348.62
```

## Common tasks

| Task | Command |
|---|---|
| Add a Rust component | `spin add -t op-rust` |
| Add a TypeScript component | `spin add -t op-ts` |
| Set log level at runtime | `SPIN_VARIABLE_LOG_LEVEL=debug spin up` |
| Deploy to Akamai Functions | `spin aka deploy --account-id <account-id>`
