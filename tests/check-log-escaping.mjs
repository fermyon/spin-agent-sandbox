#!/usr/bin/env node
// Checks that error text from user code cannot forge or split a guard log line.
// Run after tests/smoke.hurl, which sends the `log-injection-*` requests, against the log
// of the running app (`spin up ... > spin.log`):
//
//   node tests/check-log-escaping.mjs spin.log
//
// Each request raises an error whose message holds a newline followed by a fake
// `guard: ERROR FORGED-LOG-LINE-*` entry. Escaped, the whole message stays on the single
// `uncaught error:` line; unescaped, the fake entry would start a line of its own.

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node tests/check-log-escaping.mjs <spin log file>");
  process.exit(2);
}

const lines = readFileSync(file, "utf8").split(/\r?\n/);
const problems = [];

for (const lang of ["ts", "py"]) {
  const marker = `FORGED-LOG-LINE-${lang.toUpperCase()}`;
  const logged = lines.filter((l) => l.includes(`sandbox=log-injection-${lang} uncaught error:`));
  if (logged.length === 0) {
    problems.push(`${lang}: no "uncaught error" log line for the log-injection request (did smoke.hurl run?)`);
    continue;
  }
  if (!logged.some((l) => l.includes(`boom\\nguard: ERROR ${marker}`))) {
    problems.push(`${lang}: the error text is not escaped on its log line`);
  }
  if (lines.some((l) => l.includes(marker) && !l.includes("uncaught error:"))) {
    problems.push(`${lang}: ${marker} appears outside the "uncaught error" line (a forged or split log line)`);
  }
}

if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exit(1);
}
console.log("ok: error text is escaped in the log");
