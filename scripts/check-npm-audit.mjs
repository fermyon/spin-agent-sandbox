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

const decompressAdvisories = [
  {
    source: 1122670,
    severity: "critical",
    url: "https://github.com/advisories/GHSA-mp2f-45pm-3cg9",
    range: "<=4.2.1",
  },
  {
    source: 1130126,
    severity: "moderate",
    url: "https://github.com/advisories/GHSA-h39j-r5qq-r9mm",
    range: "<=4.2.1",
  },
  {
    source: 1139405,
    severity: "moderate",
    url: "https://github.com/advisories/GHSA-jwp9-9v96-94mx",
    range: "<=4.2.1",
  },
];

const buildToolsDowngrade = {
  name: "@spinframework/build-tools",
  version: "1.0.7",
  isSemVerMajor: true,
};

const proxyDowngrade = {
  name: "@spinframework/wasi-http-proxy",
  version: "1.0.1",
  isSemVerMajor: true,
};

function expectedSpinFindings(includeProxy) {
  const findings = [
    {
      name: "@bytecodealliance/componentize-js",
      severity: "moderate",
      isDirect: false,
      range: "0.13.0 - 0.18.5 || >=0.19.4-rc.1",
      fixAvailable: buildToolsDowngrade,
      via: ["@bytecodealliance/weval"],
      effects: ["@bytecodealliance/jco", "@spinframework/build-tools"],
      nodes: [
        "node_modules/@bytecodealliance/componentize-js",
        "node_modules/@bytecodealliance/jco/node_modules/@bytecodealliance/componentize-js",
      ],
    },
    {
      name: "@bytecodealliance/jco",
      severity: "moderate",
      isDirect: false,
      range: "1.7.0 - 1.15.0 || >=1.18.0",
      fixAvailable: true,
      via: ["@bytecodealliance/componentize-js"],
      effects: [],
      nodes: ["node_modules/@bytecodealliance/jco"],
    },
    {
      name: "@bytecodealliance/weval",
      severity: "moderate",
      isDirect: false,
      range: "*",
      fixAvailable: buildToolsDowngrade,
      via: ["decompress"],
      effects: ["@bytecodealliance/componentize-js"],
      nodes: ["node_modules/@bytecodealliance/weval"],
    },
    {
      name: "@spinframework/build-tools",
      severity: "moderate",
      isDirect: true,
      range: "<=1.0.2 || >=2.0.0",
      fixAvailable: buildToolsDowngrade,
      via: ["@bytecodealliance/componentize-js"],
      effects: includeProxy ? ["@spinframework/wasi-http-proxy"] : [],
      nodes: ["node_modules/@spinframework/build-tools"],
    },
    {
      name: "decompress",
      severity: "critical",
      isDirect: false,
      range: "*",
      fixAvailable: buildToolsDowngrade,
      via: decompressAdvisories,
      effects: ["@bytecodealliance/weval"],
      nodes: ["node_modules/decompress"],
    },
  ];

  if (includeProxy) {
    findings.push({
      name: "@spinframework/wasi-http-proxy",
      severity: "moderate",
      isDirect: true,
      range: ">=2.0.0",
      fixAvailable: proxyDowngrade,
      via: ["@spinframework/build-tools"],
      effects: [],
      nodes: ["node_modules/@spinframework/wasi-http-proxy"],
    });
  }

  return findings
    .map(normalizeVulnerability)
    .sort((left, right) => left.name.localeCompare(right.name));
}

// Spin 2.1 emits the repository's current WASI 0.2.10 component interface.
// npm's suggested downgrade clears these findings but changes that interface.
// Keep this as an exact snapshot: any advisory or dependency-graph change must
// fail CI and be reviewed rather than being absorbed by a broad allowlist.
const auditExceptions = new Map([
  [
    "packages/typescript/sandbox",
    {
      vulnerabilities: expectedSpinFindings(false),
      metadata: {
        info: 0,
        low: 0,
        moderate: 4,
        high: 0,
        critical: 1,
        total: 5,
      },
    },
  ],
  [
    "packages/typescript/bundler",
    {
      vulnerabilities: expectedSpinFindings(true),
      metadata: {
        info: 0,
        low: 0,
        moderate: 5,
        high: 0,
        critical: 1,
        total: 6,
      },
    },
  ],
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
    const suffix = findings === 0 ? "clean" : `${findings} reviewed Spin-toolchain findings`;
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
