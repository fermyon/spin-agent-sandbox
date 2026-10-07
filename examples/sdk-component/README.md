# SDK Component

A minimal Spin application that uses [`@spinframework/sandbox`](../../sdk) from a
public Wasm HTTP component. The TypeScript and Python interpreters are private Spin
components, reached only through service chaining.

The public API deliberately exposes no egress allow-list, KV identity, or KV opt-in:
user code runs with default-deny network access, a generated sandbox identity, and no
durable storage.

## Run

Build the hardened, composed sandbox artifacts from the repository root first:

```bash
spin build
```

Then start this app:

```bash
cd examples/sdk-component
spin up --build
```

The public component is on `http://127.0.0.1:3000`; the interpreter components have
no public routes.

```bash
curl -s http://127.0.0.1:3000/run \
  -H 'content-type: application/json' \
  -d '{"language":"python","code":"print(6 * 7)"}'

curl -s http://127.0.0.1:3000/handler \
  -H 'content-type: application/json' \
  -d '{"language":"javascript","code":"export default { fetch() { return new Response(\"hello\") } }","input":{"path":"/"}}'
```

`POST /run` returns the SDK `Result` JSON. `POST /handler` forwards the sandbox
handler response, including its status, headers, and streamed body.

`GET /stream-demo` runs a built-in Python handler that returns
`(status, headers, generator)`. Each yielded chunk is forwarded as it is produced, so
the five lines arrive half a second apart:

```bash
curl -N http://127.0.0.1:3000/stream-demo
```