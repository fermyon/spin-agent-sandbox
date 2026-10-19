# Security policy

This project runs untrusted, often AI-generated, code. We treat a way out of the sandbox
as a serious bug and would like to hear about it.

## Reporting a vulnerability

Please do not open a public issue, pull request, or discussion for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**.
<!-- TODO: confirm private vulnerability reporting is enabled for this repository, or
replace this section with the project's security contact address. -->

Include what you can of:

- the affected component (`ts-sandbox`, `py-sandbox`, `bundler`, the SDK, or an example)
  and the commit or release you tested;
- a request body or code snippet that reproduces the problem;
- what you expected the sandbox to enforce, and what happened instead.

We will acknowledge the report, keep you updated while we investigate, and credit you
in the advisory unless you prefer otherwise.

## Supported versions

The project has not had a stable release yet. Fixes land on `main` and in the next
release; older releases are not patched.

## Scope

In scope are breaks of the guarantees the sandbox components make (see
[AGENTS.md](AGENTS.md#security-invariants-do-not-regress-these) for the full list):

- **KV isolation:** one `sandboxId` reading, writing, or listing another's keys, or
  reaching the KV store when `kvEnabled` is not set.
- **Egress:** outbound requests to a host the request did not allow-list, a bare `"*"`
  granting everything, or reaching loopback, link-local, private, or `.internal`
  targets.
- **Request isolation:** state, allow-lists, or output from one request leaking into
  another.
- **Crashes on input:** a request body or user code that makes a component crash
  instead of returning a structured JSON error.
- **Host capabilities:** user code reaching a Spin or WASI capability the sandbox does
  not expose (filesystem, sockets, variables, databases, and so on).

Out of scope, because they are documented limits that the deployment must handle:

- **CPU, wall-clock, and memory exhaustion.** The components have no per-request
  timeout or memory cap. Enforce them in the host (for example Wasmtime epoch
  interruption or fuel, or the platform request timeout).
- **Unexposed capabilities fail with a crash, not an error.** User code that calls a
  capability the sandbox does not expose (Python sockets, Spin interfaces other than
  KV, or polling the captured stdio streams) traps the instance, so the caller gets the
  host's generic 500 instead of a JSON error. The capability is still refused; reaching
  it is in scope (see **Host capabilities** above).
- **DNS names that resolve to private addresses.** The components refuse private IP
  literals and internal names, but the host network must block hostnames that resolve
  to private ranges.
- **The bundler's trust in esm.sh.** The experimental bundler runs whatever the
  configured esm.sh server returns (see [README.md](README.md#bundler-experimental)).
- **The example apps** in [`examples/`](examples). They are demos, open by default; see
  each example's README before deploying one.
