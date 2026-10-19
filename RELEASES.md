# CI and Releases

GitHub Actions is defined in [`.github/workflows/test.yml`](.github/workflows/test.yml)
and [`.github/workflows/release.yml`](.github/workflows/release.yml).

## CI

The `tests` workflow runs on pull requests and pushes to `main`.

- `audit` runs `node scripts/check-npm-audit.mjs`, which runs `npm audit` on every tracked npm
  project and fails unless each result is clean or exactly matches a reviewed exception in that
  script.
- `unit` runs Rust formatting and clippy, Rust tests, TypeScript sandbox, bundler, Python sandbox, and SDK checks.
- `sandboxes` builds all components, checks the host capabilities each sandbox imports
  (`tests/check-imports.mjs`), starts the app, and runs the smoke tests and security gates
  (`tests/smoke.hurl`), checks that user error text is escaped in the app's log
  (`tests/check-log-escaping.mjs`), and runs every example program (`tests/run-examples.sh`)
  against both the TypeScript and Python sandboxes.
- `bundler` runs only from **Run workflow** or when called by a release, because its
  suites reach esm.sh and take longer. It runs the bundler integration and compatibility
  gates.
- `ci` is the aggregate status check. Configure it as required in branch protection.

Run the corresponding checks locally:

```bash
node scripts/check-npm-audit.mjs
cargo fmt --check
cargo clippy --workspace --locked --all-targets -- -D warnings
cargo test --workspace --locked
cd packages/typescript/sandbox && npm test
cd py-sandbox && python3 -m unittest discover -s tests -t .
cd sdk && npm run check

# Live sandbox suites (the `sandboxes` job), against a running app:
spin build && node tests/check-imports.mjs
spin up --listen 127.0.0.1:3007 > spin.log 2>&1 &
hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl
node tests/check-log-escaping.mjs spin.log
BASE=http://127.0.0.1:3007 tests/run-examples.sh

# Live bundler suites (the `bundler` job; starts its own Spin app and reaches esm.sh):
cd packages/typescript/bundler && npm run test:ci
```

## Releases

Push a `vX.Y.Z` tag to create a versioned release. Run the **Release** workflow manually
for a rolling `canary` prerelease. Both paths first invoke the full test workflow,
including the bundler gates. The release job then builds the components from the same
commit, checks their imports, and publishes them with that run's compatibility reports.

The release publishes:

- `ts-sandbox.wasm`
- `py-sandbox.wasm`
- `bundler.wasm`
- SHA-256 checksums
- Bundler compatibility reports and logs

After a versioned release, update the template component URLs and digests:

```bash
scripts/update-template-refs.sh vX.Y.Z
# For a fork:
scripts/update-template-refs.sh vX.Y.Z owner/repo
git diff templates/
```

Review and commit the template update separately. See [templates/README.md](templates/README.md)
for template behavior and first-release placeholders.
