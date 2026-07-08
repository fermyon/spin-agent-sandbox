// Compile-time assertions. This file is typechecked by `tsc` (npm run typecheck)
// but never executed. The `@ts-expect-error` lines fail the build if a method
// that MUST be backend-locked ever becomes callable on the wrong client — i.e.
// they prove the "non-portability is a compile error" guarantee, and that the
// `CodeRunner` contract is the (only) portable surface a future backend joins.

import type { CodeRunner, Result } from "../src/core/index.ts";
import { Interpreter } from "../src/interpreter/index.ts";

declare const itp: Interpreter;

// A portable tool depends only on the interface — it accepts ANY backend that
// implements CodeRunner (interpreter today; container / microVM tomorrow).
async function portableTool(r: CodeRunner): Promise<Result> {
  return r.run("print(1)", { lang: "python", allowedHosts: ["api.x.com"], identity: "t" });
}
void portableTool(itp);

// The concrete client satisfies CodeRunner.
const asRunner: CodeRunner = itp;
void asRunner;

// The interpreter has NO filesystem / sessions / exec — these must not compile.
// A container/microVM backend would add such methods on its OWN client, never on
// this one, so a tool that needs them is a compile error against the interpreter.
// @ts-expect-error interpreter has no filesystem
itp.writeFile("/f", "x");
// @ts-expect-error interpreter has no stateful sessions
itp.startSession("python");
// @ts-expect-error interpreter has no subprocess exec
itp.exec(["echo", "hi"]);

// But the interpreter DOES have its scoped-KV power surface.
void itp.kv("ns");
