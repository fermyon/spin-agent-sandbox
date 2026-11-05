#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const compareJson = (left, right) =>
  JSON.stringify(left).localeCompare(JSON.stringify(right));

const vulnerabilityMetadataKeys = [
  "info",
  "low",
  "moderate",
  "high",
  "critical",
  "total",
];

function normalizeMetadata(metadata) {
  const actualKeys = Object.keys(metadata).sort();
  const expectedKeys = [...vulnerabilityMetadataKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`audit vulnerability metadata has an unexpected shape`);
  }

  return Object.fromEntries(
    vulnerabilityMetadataKeys.map((key) => {
      if (!Number.isInteger(metadata[key]) || metadata[key] < 0) {
        throw new Error(`audit vulnerability metadata ${key} is not a non-negative integer`);
      }
      return [key, metadata[key]];
    }),
  );
}

function normalizeVulnerability(vulnerability) {
  return {
    name: vulnerability.name,
    severity: vulnerability.severity,
    isDirect: vulnerability.isDirect,
    range: vulnerability.range,
    fixAvailable:
      typeof vulnerability.fixAvailable === "object" &&
      vulnerability.fixAvailable !== null
        ? {
            name: vulnerability.fixAvailable.name,
            version: vulnerability.fixAvailable.version,
            isSemVerMajor: vulnerability.fixAvailable.isSemVerMajor,
          }
        : vulnerability.fixAvailable,
    via: vulnerability.via
      .map((entry) =>
        typeof entry === "string"
          ? { name: entry }
          : {
              source: entry.source,
              severity: entry.severity,
              url: entry.url,
              range: entry.range,
            },
      )
      .sort(compareJson),
    effects: [...vulnerability.effects].sort(),
    nodes: [...vulnerability.nodes].sort(),
  };
}

function normalizeVulnerabilities(vulnerabilities) {
  return Object.entries(vulnerabilities)
    .map(([name, vulnerability]) => {
      if (name !== vulnerability.name) {
        throw new Error(
          `audit entry ${JSON.stringify(name)} reports the mismatched name ` +
            JSON.stringify(vulnerability.name),
        );
      }
      if (
        !Array.isArray(vulnerability.via) ||
        !Array.isArray(vulnerability.effects) ||
        !Array.isArray(vulnerability.nodes)
      ) {
        throw new Error(`audit entry ${JSON.stringify(name)} has an unexpected shape`);
      }
      return normalizeVulnerability(vulnerability);
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

// The example UIs are served as static `nuxt generate` output. deepmerge is
// used by Rollup's node-resolve plugin during the build and has no patched
// release for GHSA-gcqx-w48m-w2h4. Builds must use trusted configuration.
function expectedNuxtFindings() {
  const findings = [
    {
      name: "@nuxt/nitro-server",
      severity: "low",
      isDirect: false,
      range: ">=3.20.0",
      fixAvailable: true,
      via: ["nitropack", "nuxt"],
      effects: ["nuxt"],
      nodes: ["node_modules/@nuxt/nitro-server"],
    },
    {
      name: "@nuxt/vite-builder",
      severity: "low",
      isDirect: false,
      range: "3.20.0 - 3.21.11 || >=4.2.0",
      fixAvailable: true,
      via: ["nuxt"],
      effects: ["nuxt"],
      nodes: ["node_modules/@nuxt/vite-builder"],
    },
    {
      name: "@nuxt/vite-server",
      severity: "low",
      isDirect: false,
      range: ">=4.6.0",
      fixAvailable: true,
      via: ["nuxt"],
      effects: ["nuxt"],
      nodes: ["node_modules/@nuxt/vite-server"],
    },
    {
      name: "@rollup/plugin-node-resolve",
      severity: "low",
      isDirect: false,
      range: ">=8.0.0",
      fixAvailable: true,
      via: ["deepmerge"],
      effects: ["nitropack"],
      nodes: ["node_modules/@rollup/plugin-node-resolve"],
    },
    {
      name: "deepmerge",
      severity: "low",
      isDirect: false,
      range: ">=4.2.0",
      fixAvailable: true,
      via: [
        {
          source: 1243505,
          severity: "low",
          url: "https://github.com/advisories/GHSA-gcqx-w48m-w2h4",
          range: ">=4.2.0 <=4.3.1",
        },
      ],
      effects: ["@rollup/plugin-node-resolve"],
      nodes: ["node_modules/deepmerge"],
    },
    {
      name: "nitropack",
      severity: "low",
      isDirect: false,
      range: ">=0.1.0",
      fixAvailable: true,
      via: ["@rollup/plugin-node-resolve"],
      effects: ["@nuxt/nitro-server"],
      nodes: ["node_modules/nitropack"],
    },
    {
      name: "nuxt",
      severity: "low",
      isDirect: true,
      range: "3.20.0 - 3.21.11 || >=4.2.0",
      fixAvailable: true,
      via: ["@nuxt/nitro-server", "@nuxt/vite-builder", "@nuxt/vite-server"],
      effects: ["@nuxt/nitro-server", "@nuxt/vite-builder", "@nuxt/vite-server"],
      nodes: ["node_modules/nuxt"],
    },
  ];

  return findings
    .map(normalizeVulnerability)
    .sort((left, right) => left.name.localeCompare(right.name));
}

const nuxtAudit = {
  vulnerabilities: expectedNuxtFindings(),
  metadata: {
    info: 0,
    low: 7,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 7,
  },
};

// Keep these as exact snapshots: any advisory or dependency-graph change must
// fail CI and be reviewed rather than being absorbed by a broad allowlist.
const auditExceptions = new Map([
  ["examples/ai-code-executor/ui", nuxtAudit],
  ["examples/app-builder/ui", nuxtAudit],
]);

const cleanAudit = {
  vulnerabilities: [],
  metadata: {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
  },
};

function trackedNpmProjects() {
  const tracked = spawnSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (tracked.error || tracked.status !== 0) {
    throw new Error(
      `could not enumerate tracked files: ${tracked.error?.message ?? tracked.stderr.trim()}`,
    );
  }

  const files = tracked.stdout.split("\0").filter(Boolean);
  const manifests = new Set(
    files.filter((file) => file === "package.json" || file.endsWith("/package.json")),
  );
  const locks = new Set(
    files.filter(
      (file) => file === "package-lock.json" || file.endsWith("/package-lock.json"),
    ),
  );

  for (const manifest of manifests) {
    const lock = `${dirname(manifest)}/package-lock.json`.replace(/^\.\//, "");
    if (!locks.has(lock)) {
      throw new Error(`${manifest} does not have a tracked sibling package-lock.json`);
    }
  }
  for (const lock of locks) {
    const manifest = `${dirname(lock)}/package.json`.replace(/^\.\//, "");
    if (!manifests.has(manifest)) {
      throw new Error(`${lock} does not have a tracked sibling package.json`);
    }
  }

  return [...manifests]
    .map((manifest) => dirname(manifest).replace(/^\.$/, ""))
    .sort();
}

function auditProject(project) {
  const result = spawnSync(
    "npm",
    ["audit", "--package-lock-only", "--json", "--audit-level=low"],
    {
      cwd: resolve(repositoryRoot, project),
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw new Error(`npm audit could not run: ${result.error.message}`);
  }
  if (result.signal || ![0, 1].includes(result.status)) {
    throw new Error(
      `npm audit exited unexpectedly (${result.signal ?? result.status}): ${result.stderr.trim()}`,
    );
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`npm audit returned invalid JSON: ${error.message}`);
  }
  if (
    report.auditReportVersion !== 2 ||
    typeof report.vulnerabilities !== "object" ||
    report.vulnerabilities === null ||
    typeof report.metadata?.vulnerabilities !== "object" ||
    report.metadata.vulnerabilities === null
  ) {
    const details = report.error ? `: ${JSON.stringify(report.error)}` : "";
    throw new Error(`npm audit returned an unsupported or incomplete report${details}`);
  }

  const expected = auditExceptions.get(project) ?? cleanAudit;
  const actual = {
    vulnerabilities: normalizeVulnerabilities(report.vulnerabilities),
    metadata: normalizeMetadata(report.metadata.vulnerabilities),
  };
  const expectedStatus = expected.vulnerabilities.length === 0 ? 0 : 1;

  if (result.status !== expectedStatus || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      [
        "audit result differs from the reviewed policy",
        `expected exit status: ${expectedStatus}; actual: ${result.status}`,
        `expected: ${JSON.stringify(expected, null, 2)}`,
        `actual: ${JSON.stringify(actual, null, 2)}`,
      ].join("\n"),
    );
  }

  return actual.metadata.total;
}

let failures = 0;
const projects = trackedNpmProjects();

for (const project of projects) {
  const label = project || ".";
  process.stdout.write(`Auditing ${label}... `);
  try {
    const findings = auditProject(project);
    const suffix = findings === 0 ? "clean" : `${findings} reviewed findings`;
    console.log(`passed (${suffix})`);
  } catch (error) {
    failures += 1;
    console.log("failed");
    console.error(`${label}: ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`npm audit policy failed for ${failures} project(s)`);
  process.exitCode = 1;
} else {
  console.log(`npm audit policy passed for ${projects.length} project(s)`);
}
