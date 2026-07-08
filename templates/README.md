# Spin templates

These templates scaffold apps that consume the sandbox components as **prebuilt Wasm**
pulled from this repo's GitHub releases (the [spin-fileserver] model) — no build step in the
generated app. The components are built and published by
[`.github/workflows/release.yml`](../.github/workflows/release.yml).

[spin-fileserver]: https://github.com/spinframework/spin-fileserver

| Template       | `spin new` (new app)                 | `spin add` (existing app) | Components        |
| -------------- | ------------------------------------ | ------------------------- | ----------------- |
| `sandbox-ts`   | app with the JS/TS sandbox           | ✅ adds the JS/TS sandbox | ts-sandbox        |
| `sandbox-py`   | app with the Python sandbox          | ✅ adds the Python sandbox | py-sandbox        |
| `sandbox-app`  | app with **both** sandboxes          | —                         | ts + py           |

## Install

```bash
# from a clone of this repo (the dir that contains templates/)
spin templates install --dir . --upgrade

# or straight from git
spin templates install --git https://github.com/lepton/wasm-sandbox --upgrade
```

## Use

```bash
# New app with one sandbox (prompts for HTTP path, default /ts/... or /py/...):
spin new -t sandbox-ts my-sandbox && cd my-sandbox && spin up

# Add a sandbox to an existing app:
spin add -t sandbox-py

# New app with both sandboxes at /ts/... and /py/...:
spin new -t sandbox-app my-sandbox
```

Built-in parameters `project-name` (the name you pass to `spin new`/`spin add`) and `authors`
(from git config) populate `spin.toml`. The single-component templates use `project-name` as
the component id; `sandbox-app` uses fixed ids `ts-sandbox` and `py-sandbox`. `spin up`
fetches the components by URL + digest on first run.

## Releasing the components (maintainers)

1. Push a tag `vX.Y.Z` (or run the **Release** workflow manually for a `canary` prerelease).
   The workflow builds both components with `spin build` and uploads `ts-sandbox.wasm`,
   `py-sandbox.wasm`, and a `checksums-*.txt` to the release.
2. Point the templates at the new release (fills in real `sha256` digests):

   ```bash
   scripts/update-template-refs.sh vX.Y.Z            # uses owner/repo = lepton/wasm-sandbox
   scripts/update-template-refs.sh vX.Y.Z myorg/repo # or specify your fork
   git diff templates/                               # review, then commit
   ```

## ⚠️ Placeholders to set before first release

The templates and workflow ship with placeholders — search for them and set your values:

- **`lepton/wasm-sandbox`** — the GitHub owner/repo in every template's `source` URL and in
  `scripts/update-template-refs.sh`. Set it to your repo (or pass it to the script).
- **`sha256:0000…0000`** — placeholder digests; filled in by `update-template-refs.sh` after
  the first release. Until then, `spin up` will fail digest verification.

The prebuilt `wasm32-wasi` Python packages come from the **`spin-python-deps` git submodule**
under `py-sandbox/`, so the release workflow just checks it out (`submodules: recursive`) — no
extra repo/secret to configure. `ts-sandbox/package-lock.json` is committed so the CI's
`npm ci` is reproducible — keep it tracked.

## Maintaining vs. the source

Unlike a from-source template, these carry no component source — just `spin.toml` and a
snippet referencing the release. They only drift when the URL/version/digest changes, which
`update-template-refs.sh` handles. The component source lives at the top level of this repo.
