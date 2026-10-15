# bundler tests

Two live layers, both run against the real Wasm components (bundler + ts-sandbox) over
HTTP.

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
[compat/COMPATIBILITY.md](compat/COMPATIBILITY.md).

From `packages/typescript/bundler`:

```bash
npm run test:ci              # integration + full compatibility gate, one managed Spin server
npm run test:unit            # offline tests of gating, report history, and baseline updates

# Reuse a server instead of starting one (for either test:ci or test:integration):
BUNDLER_BASE_URL=http://127.0.0.1:3000 npm run test:ci

# Run only compatibility against an existing server:
BUNDLER_BASE_URL=http://127.0.0.1:3000 npm run test:compat
```

Pull requests and pushes to `main` run the offline unit suites. To run the live
integration and compatibility gates in GitHub Actions (the `bundler` job), select
**Run workflow** on the `tests` workflow. Releases explicitly request the same live suites and must
pass them before publishing. Tool-installer checks run alongside these live suites.

`test:ci` builds missing artifacts, including the **composed** sandbox at
`dist/ts-sandbox.wasm` in the repository root. It runs both suites even if integration
fails, and exits nonzero if either suite fails. `PORT` changes the managed server's
listen port (default `3000`). Live suites fetch npm packages from esm.sh; network
failures fail the gate and can require a rerun. Compatibility bundle requests allow
120 seconds because large dependency graphs can require hundreds of sequential CDN
fetches; sandbox execution requests allow 45 seconds. Each transport request gets at
most three attempts. Completed compatibility failures are not retried. Override the
deadlines with `COMPAT_BUNDLE_TIMEOUT_MS` / `COMPAT_RUN_TIMEOUT_MS` or the compatibility
runner's `--bundle-timeout-ms=` / `--run-timeout-ms=` flags. Retry details are logged
and each result's `requests` field preserves attempt timings and outcomes.

The compatibility gate uses the checked-in `compat/baseline.json` as a reviewed
policy: only library names, versions, and whether each must pass. Every required
library must still pass; an improvement elsewhere cannot mask
a regression. Known failures remain allowed, and newly passing libraries are reported.
The catalog, baseline and new results must contain exactly the same library names and
versions, with no duplicates, missing results or invalid statuses. `net_error` always
fails because the request did not complete; it is reported as an inconclusive request
rather than a compatibility regression. Adding or changing catalog entries requires
a matching reviewed baseline update. The gate rejects `--only` to prevent partial runs
from passing CI.

Each run creates a unique timestamped directory beneath ignored
`test-results/bundler-compat/` in the repository root. `COMPAT_OUTPUT_DIR` or
`--out-dir=PATH` changes this parent directory. The runner prints the complete path;
`latest.json` in the parent points to the most recently started run.

Each directory contains `results.json`, `REPORT.md`, and `run.json` provenance;
gated runs also include `GATE.md`. Completed cases are saved during the sweep, so
interrupted runs retain partial results marked incomplete. Ordinary runs never
update the committed baseline or earlier reports. Optional `--out` and `--report`
exports must target new files outside tracked paths; `--report=none` skips the
optional export, while the run directory still preserves its Markdown report.

On-demand and release runs upload reports and logs even on failure, retain them for
90 days, and show the gate result in the run summary. Releases attach an archive of the reports from their test run;
unique archive names preserve history across rolling canary releases.

To update expectations deliberately, review a complete run and use its directory:

```bash
npm run compat:update-baseline -- /path/to/run-directory --dry-run
npm run compat:update-baseline -- /path/to/run-directory
```

This command validates full catalog coverage and updates only `baseline.json`.
Incomplete runs, malformed data, and network errors cannot become a baseline.
Regressions are rejected unless individually acknowledged with
`--accept-regressions=name1,name2` after review. Generated reports remain artifacts.
Review the authored findings in `COMPATIBILITY.md` when support expectations change.

## Files

- `integration.test.mjs`  the invariant assertions (above).
- `integration-run.mjs`  orchestrator: builds the two components if missing, starts
  `spin up` (via `spin.test.toml`, ts-sandbox + bundler only), runs
  `integration.test.mjs` and optionally the full compatibility gate, tears down.
- `spin.test.toml`  trimmed manifest (no py-sandbox) used by both layers.
- `compat/`  the catalog and baseline policy, runner, gate, report storage, and
  explicit baseline update command, with offline tests for these behaviors.
