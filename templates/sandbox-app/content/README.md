# {{project-name}}

A Spin application that scaffolds two **private** code sandboxes (JS/TS and Python) for executing dynamic, AI-generated code in WebAssembly. Both components are prebuilt and pulled from GitHub releases, so there is no build step.

| Component    | Language        | Service-chaining host              |
| ------------ | --------------- | ---------------------------------- |
| `ts-sandbox` | JavaScript / TS | `http://ts-sandbox.spin.internal`  |
| `py-sandbox` | Python          | `http://py-sandbox.spin.internal`  |

Neither has a public route, because they run untrusted code. Add your own component that calls them with `@spinframework/sandbox`, and add both hosts to its `allowed_outbound_hosts`:

```ts
const js = new Interpreter({ baseUrl: "http://ts-sandbox.spin.internal" });
const py = new Interpreter({ baseUrl: "http://py-sandbox.spin.internal" });
await py.run("print(6 * 7)", { lang: "python" });
```

See [examples/ai-code-executor](https://github.com/fermyon/spin-sandboxes/tree/main/examples/ai-code-executor) for a complete caller. Set `allowedHosts`, `kvEnabled`, and `identity` from application code, never from model output.

## Security model

The trust boundary is the Wasm component (no filesystem; egress gated by Spin). Per-sandbox KV keys are namespaced unambiguously, and KV is off unless the caller enables it. Outbound HTTP is default-deny and refuses loopback, link-local, private, and `.internal` targets even if allow-listed. There is no in-component CPU/wall-clock timeout or memory limit, so enforce a request deadline and memory cap at the host/deployment layer.

Each component's `allowed_outbound_hosts` in `spin.toml` starts empty, so user code cannot make outbound requests. Add the hosts it may reach there (for example `["https://api.example.com"]`); a request's `allowedHosts` can then only narrow that list.

To modify or rebuild the components, see [spin-sandboxes](https://github.com/fermyon/spin-sandboxes).
