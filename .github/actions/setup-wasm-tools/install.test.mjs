import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const installer = fileURLToPath(new URL('./install.sh', import.meta.url));
const supported = [
  ['Linux', 'X64', 'x86_64-linux', 'x86_64-unknown-linux-musl'],
  ['Linux', 'ARM64', 'aarch64-linux', 'aarch64-unknown-linux-musl'],
  ['macOS', 'X64', 'x86_64-macos', 'x86_64-apple-darwin'],
  ['macOS', 'ARM64', 'aarch64-macos', 'aarch64-apple-darwin'],
  ['Windows', 'X64', 'x86_64-windows', 'x86_64-pc-windows-gnu'],
];

function command(name) {
  for (const directory of process.env.PATH.split(path.delimiter)) {
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}

const bash = command('bash');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
  return result;
}

function fixture(t, runnerOS, runnerArch, wasmPlatform, wacPlatform, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-installer-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const assets = path.join(root, 'assets');
  const temp = path.join(root, 'runner temp');
  for (const directory of [bin, assets, temp]) fs.mkdirSync(directory);

  // Isolate PATH so the shasum test cannot accidentally find sha256sum elsewhere.
  for (const name of ['bash', 'jq', 'tar', 'unzip', 'install', 'mktemp', 'rm', 'cp',
    'dirname', 'basename', 'sed', 'cut', 'tr', 'cat', 'chmod', 'gzip', 'awk', 'shasum', 'sha256sum']) {
    if (options.shasumOnly && name === 'sha256sum') continue;
    const target = command(name);
    if (target) fs.symlinkSync(target, path.join(bin, name));
  }

  function script(name, source) {
    fs.writeFileSync(path.join(bin, name), `#!${bash}\nset -eu\n${source}\n`, { mode: 0o755 });
  }

  script('curl', `
destination=
url=
while (( $# )); do
  case "$1" in
    --output) destination=$2; shift 2 ;;
    https://*) url=$1; shift ;;
    *) shift ;;
  esac
done
printf '%s\\n' "$url" >> "$FIXTURE_REQUESTS"
case "$url" in
  https://api.github.com/repos/bytecodealliance/wasm-tools/releases/latest) source="$FIXTURE_ROOT/wasm-tools.json" ;;
  https://api.github.com/repos/bytecodealliance/wac/releases/latest) source="$FIXTURE_ROOT/wac.json" ;;
  https://github.com/bytecodealliance/*/releases/download/*) source="$FIXTURE_ROOT/assets/\${url##*/}" ;;
  *) echo "Unexpected fixture URL: $url" >&2; exit 1 ;;
esac
cp "$source" "$destination"
`);

  // Git Bash converts these paths on Windows; this host uses native POSIX paths.
  script('cygpath', 'printf \'%s\\n\' "$2"');
  if (options.shasumOnly) {
    fs.unlinkSync(path.join(bin, 'shasum'));
    script('shasum', 'printf \'shasum\\n\' >> "$FIXTURE_CHECKSUMS"\nexec "$FIXTURE_SHASUM" "$@"');
  }

  const executable = runnerOS === 'Windows' ? 'wasm-tools.exe' : 'wasm-tools';
  const prefix = `wasm-tools-1.258.0-${wasmPlatform}`;
  const archiveName = `${prefix}.${runnerOS === 'Windows' ? 'zip' : 'tar.gz'}`;
  fs.mkdirSync(path.join(root, prefix));
  fs.writeFileSync(path.join(root, prefix, executable), `#!${bash}\necho 'wasm-tools 1.258.0'\n`, { mode: 0o755 });
  if (runnerOS === 'Windows') {
    run(command('zip'), ['-q', path.join(assets, archiveName), `${prefix}/${executable}`], { cwd: root });
  } else {
    run(command('tar'), ['-czf', path.join(assets, archiveName), '-C', root, prefix]);
  }
  const wacName = `wac-cli-${wacPlatform}`;
  fs.writeFileSync(path.join(assets, wacName), `#!${bash}\necho 'wac 0.11.0'\n`, { mode: 0o755 });

  for (const [tool, tag, name] of [['wasm-tools', 'v1.258.0', archiveName], ['wac', 'v0.11.0', wacName]]) {
    const digest = createHash('sha256').update(fs.readFileSync(path.join(assets, name))).digest('hex');
    fs.writeFileSync(path.join(root, `${tool}.json`), JSON.stringify({
      tag_name: tag,
      assets: [{
        name,
        digest: `sha256:${options.badChecksum === tool ? '0'.repeat(64) : digest}`,
        browser_download_url: `https://github.com/bytecodealliance/${tool}/releases/download/${tag}/${name}`,
      }],
    }));
  }

  const githubPath = path.join(root, 'github-path');
  const githubOutput = path.join(root, 'github-output');
  fs.writeFileSync(githubPath, '');
  fs.writeFileSync(githubOutput, '');
  const result = spawnSync(bash, [installer], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin,
      RUNNER_OS: runnerOS,
      RUNNER_ARCH: runnerArch,
      RUNNER_TEMP: temp,
      GH_TOKEN: 'fixture-token',
      GITHUB_PATH: githubPath,
      GITHUB_OUTPUT: githubOutput,
      FIXTURE_ROOT: root,
      FIXTURE_REQUESTS: path.join(root, 'requests'),
      FIXTURE_CHECKSUMS: path.join(root, 'checksums'),
      FIXTURE_SHASUM: command('shasum') ?? '',
    },
  });
  assert.equal(result.error, undefined);
  return { root, result, archiveName, wacName, githubPath, githubOutput };
}

function assertInstalled(result, runnerOS) {
  assert.equal(result.result.status, 0, `${result.result.stdout}\n${result.result.stderr}`);
  const installDir = fs.readFileSync(result.githubPath, 'utf8').trim();
  assert.ok(installDir, 'installation directory is published to GITHUB_PATH');
  const suffix = runnerOS === 'Windows' ? '.exe' : '';
  assert.match(run(path.join(installDir, `wasm-tools${suffix}`), ['--version']).stdout, /wasm-tools 1\.258\.0/);
  assert.match(run(path.join(installDir, `wac${suffix}`), ['--version']).stdout, /wac 0\.11\.0/);
  assert.equal(fs.readFileSync(result.githubOutput, 'utf8'), 'wasm-tools-version=v1.258.0\nwac-version=v0.11.0\n');
  const requests = fs.readFileSync(path.join(result.root, 'requests'), 'utf8');
  assert.ok(requests.includes(`/${result.archiveName}\n`));
  assert.ok(requests.includes(`/${result.wacName}\n`));
}

for (const [runnerOS, runnerArch, wasmPlatform, wacPlatform] of supported) {
  test(`installs the correct native assets on ${runnerOS} ${runnerArch}`, (t) => {
    assertInstalled(fixture(t, runnerOS, runnerArch, wasmPlatform, wacPlatform), runnerOS);
  });
}

test('reports the missing wac release asset on Windows ARM64', (t) => {
  const result = fixture(t, 'Windows', 'ARM64', 'aarch64-windows', 'x86_64-pc-windows-gnu');
  assert.notEqual(result.result.status, 0);
  const output = `${result.result.stdout}\n${result.result.stderr}`;
  assert.match(output, /wac/);
  assert.match(output, /Windows.*ARM64|ARM64.*Windows/);
  assert.match(output, /wac-cli-aarch64-pc-windows-gnu/);
  assert.equal(fs.readFileSync(result.githubPath, 'utf8'), '');
});

test('rejects an asset whose SHA-256 differs from release metadata', (t) => {
  const result = fixture(t, ...supported[0], { badChecksum: 'wasm-tools' });
  assert.notEqual(result.result.status, 0);
  assert.equal(fs.readFileSync(result.githubPath, 'utf8'), '');
  assert.equal(fs.readFileSync(result.githubOutput, 'utf8'), '');
});

test('verifies both macOS downloads with shasum when sha256sum is unavailable', (t) => {
  const result = fixture(t, ...supported[3], { shasumOnly: true });
  assertInstalled(result, 'macOS');
  assert.equal(fs.readFileSync(path.join(result.root, 'checksums'), 'utf8'), 'shasum\nshasum\n');
});
