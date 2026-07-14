# {{project-name}}

A Spin application that executes dynamic, AI-generated JS/TS and Python code received over
HTTP, inside WebAssembly. Both components are prebuilt and pulled from GitHub releases, so
there is no build step: `spin up` fetches them by URL and digest.

| Component    | Route        | Language        |
| ------------ | ------------ | --------------- |
| `ts-sandbox` | `POST /ts/…` | JavaScript / TS |
| `py-sandbox` | `POST /py/…` | Python          |

## Run

```bash
spin up          # fetches the components on first run, then serves on :3000
```

## Request / response contract

POST a strict JSON envelope to `/ts/...` or `/py/...`:

```jsonc
{
  "code": "…source…",          // required: the JS/TS or Python to run
  "sandboxId": "abc123",        // required: scopes the KV store
  "input": {                     // optional: the request the user code sees
    "method": "POST",
    "query":   { "name": "ada" },
    "body":    { "values": [1, 2, 3] }
  },
  "allowedHosts": ["api.example.com"]    // optional: per-sandbox outbound allow-list
}
```

Code may be a main program that prints (captured as `{stdout, stderr, error}`) or an HTTP
handler (`export default { fetch }` / `def handle_request(request)`) whose `Response` is
returned verbatim.

```bash
curl -s localhost:3000/py/run -d '{"code":"print(6*7)","sandboxId":"demo"}'
# {"stdout": "42\n", "stderr": "", "error": null}
```

## Security model

The trust boundary is the Wasm component (no filesystem; egress gated by Spin). Per-sandbox
KV keys are namespaced unambiguously so no sandbox can read another's; outbound HTTP is
default-deny and refuses loopback, link-local, private, and `.internal` targets even if
allow-listed. There is no in-component CPU/wall-clock timeout or memory limit, so enforce a
request deadline and memory cap at the host/deployment layer, and tighten
`allowed_outbound_hosts` from the broad dev default (`https://*:*`) before deploying.

To modify or rebuild the components, see the source project they are released from.
