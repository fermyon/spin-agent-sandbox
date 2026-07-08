// @spinframework/sandbox/core — the portable interface + shared types.
// No transport, no dependencies. This is the extension point: implement
// `CodeRunner` to add a backend (interpreter today; container / microVM later).

export type {
  Lang,
  Backend,
  MIMEResult,
  CodeError,
  Result,
  HttpInput,
  RunOpts,
  Caps,
  CodeRunner,
} from "./types.ts";

import type { Lang, RunOpts } from "./types.ts";

/** Maps a portable language to the interpreter route segment ("ts" | "py"). */
export function langToRoute(lang: Lang | undefined): "ts" | "py" {
  return (lang ?? "python") === "javascript" ? "ts" : "py";
}

/** Normalizes RunOpts, applying the python default. */
export function withDefaults(opts: RunOpts | undefined): Required<Pick<RunOpts, "lang">> & RunOpts {
  return { lang: "python", ...(opts ?? {}) };
}
