# Spin templates

These templates scaffold apps that consume the sandbox components as prebuilt Wasm
pulled from this repo's GitHub releases (the [spin-fileserver] model), so the generated
app has no build step. The components are built and published by
[`.github/workflows/release.yml`](../.github/workflows/release.yml).

[spin-fileserver]: https://github.com/spinframework/spin-fileserver

| Template      | `spin new` (new app)                     | `spin add` (existing app) | Components           |
| ------------- | ---------------------------------------- | ------------------------- | -------------------- |
| `sandbox-ts`  | JS/TS sandbox + bundler (both private)   | adds both (private)       | ts-sandbox + bundler |
| `sandbox-py`  | app with the Python sandbox              | adds the Python sandbox   | py-sandbox           |
| `sandbox-app` | app with both sandboxes                  | not supported             | ts + py              |

`sandbox-ts` gives JavaScript npm-dependency support: it wires the code sandbox
together with its experimental bundler, both as private components. The bundler uses the
public esm.sh by default; to use a
[self-hosted instance](https://github.com/esm-dev/esm.sh/blob/main/HOSTING.md), set the
`esm_base_url` variable (`spin new`) or edit the bundler's host and variables in the added
components (`spin add`).
Drive them from your own component with `new Interpreter({ baseUrl, bundlerUrl })` and
`run(code, { lang: "javascript", packageJson })`. The two stay separate so the "fetch
npm" capability is isolated from the "run untrusted code" capability.

## Install

```bash
# from a clone of this repo (the dir that contains templates/)
spin templates install --dir . --upgrade

# or straight from git
spin templates install --git https://github.com/fermyon/spin-sandboxes --upgrade
```

## Use

```bash
# New app with the JS/TS sandbox + bundler (both private; drive them from your own component):
spin new -t sandbox-ts my-sandbox

# New app with the Python sandbox (prompts for HTTP path, default /py/...):
spin new -t sandbox-py my-py && cd my-py && spin up

# Add a sandbox to an existing app:
spin add -t sandbox-ts        # JS/TS sandbox + bundler (private)
spin add -t sandbox-py        # Python sandbox

# New app with both sandboxes at /ts/... and /py/...:
spin new -t sandbox-app my-sandbox
```

Built-in parameters `project-name` (the name you pass to `spin new`/`spin add`) and
`authors` (from git config) populate `spin.toml`. `sandbox-py` uses `project-name` as
the component id; `sandbox-ts` uses `project-name` for the sandbox and
`project-name-bundler` for the bundler; `sandbox-app` uses fixed ids `ts-sandbox` and
`py-sandbox`. `spin up` fetches the components by URL + digest on first run.

Every sandbox component starts with `allowed_outbound_hosts = []`, so user code can make no
outbound requests until you list the hosts it may reach. A request's `allowedHosts` can
only narrow that list. In `spin add` mode, also add `http://<name>.spin.internal` (and the
`-bundler` one for `sandbox-ts`) to your calling component's `allowed_outbound_hosts`.

## Releasing the components (maintainers)

1. Push a tag `vX.Y.Z` (or run the Release workflow manually for a `canary`
   prerelease). The workflow runs the full test workflow, then builds
   `ts-sandbox.wasm`, `py-sandbox.wasm`, and `bundler.wasm` from the same commit and
   uploads them, plus a `checksums-*.txt`, to the release.
2. Point the templates at the new release (fills in real `sha256` digests):

   ```bash
   scripts/update-template-refs.sh vX.Y.Z            # uses fermyon/spin-sandboxes
   scripts/update-template-refs.sh vX.Y.Z myorg/repo # or specify your fork
   git diff templates/                               # review, then commit
   ```

## Placeholders to set before first release

The templates ship with placeholder digests (`sha256:0000…0000`) and point at a `v0.1.0`
release of `fermyon/spin-sandboxes`. `update-template-refs.sh` fills in the real
digests after the first release; until then, `spin up` on a generated app fails digest
verification. Forks pass their own `owner/repo` to the script.

The prebuilt `wasm32-wasi` Python packages come from the `spin-python-deps` git
submodule under `py-sandbox/`; the CI and release workflows check it out
(`submodules: recursive`), with no extra repo or secret to configure.
`packages/typescript/sandbox/package-lock.json` is committed so the CI's `npm ci` is reproducible; keep
it tracked.

## Maintaining vs. the source

Unlike a from-source template, these carry no component source, just `spin.toml` and a
snippet referencing the release. They only drift when the URL/version/digest changes,
which `update-template-refs.sh` handles. The component source lives at the top level of
this repo.
