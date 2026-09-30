# CI and Releases

GitHub Actions is defined in [`.github/workflows/test.yml`](.github/workflows/test.yml)
and [`.github/workflows/release.yml`](.github/workflows/release.yml).

## CI

The `tests` workflow runs on pull requests and pushes to `main`.

- `unit` runs Rust, TypeScript sandbox, bundler, Python sandbox, and SDK checks.
- `integration` runs only from **Run workflow** or when called by a release. It builds
  the components, validates Wasm artifacts, and runs bundler integration and compatibility
  gates.
- `ci` is the aggregate status check. Configure it as required in branch protection.

Run the corresponding checks locally:

```bash
cargo test --workspace --locked
cd packages/typescript/sandbox && npm test
cd packages/typescript/bundler && npm run test:ci
cd py-sandbox && python3 -m unittest discover -s tests -t .
cd sdk && npm run check
```

## Releases

Push a `vX.Y.Z` tag to create a versioned release. Run the **Release** workflow manually
for a rolling `canary` prerelease. Both paths first invoke the full test workflow,
including integration gates.

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
