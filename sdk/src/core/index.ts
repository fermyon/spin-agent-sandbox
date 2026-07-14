// @spinframework/sandbox/core, the portable interface + shared types.
// No transport, no dependencies. The extension point: implement `CodeRunner` to
// add a backend.

export type {
  Language,
  Backend,
  MIMEResult,
  CodeError,
  Result,
  HttpInput,
  PackageJson,
  RunOpts,
  Caps,
  CodeRunner,
  CodeMeta,
  StoredCode,
  CodeStore,
} from "./types.ts";

import type { Language, RunOpts } from "./types.ts";

/** Maps a portable language to the interpreter route segment ("ts" | "py"). */
export function langToRoute(lang: Language | undefined): "ts" | "py" {
  return (lang ?? "python") === "javascript" ? "ts" : "py";
}

/** Normalizes RunOpts, applying the python default. */
export function withDefaults(opts: RunOpts | undefined): Required<Pick<RunOpts, "lang">> & RunOpts {
  return { lang: "python", ...(opts ?? {}) };
}
