import * as variables from "@spinframework/spin-variables";

const LEVELS: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
type Level = keyof typeof LEVELS;

let threshold = 2;

export function initLogger(): void {
  const raw = variables.get("log_level") ?? "info";
  threshold = LEVELS[raw.trim().toLowerCase()] ?? LEVELS["info"];
}

// Escapes backslashes and control characters so error text (messages, stacks) cannot
// forge or split a log line.
function escapeLog(msg: string): string {
  return msg.replace(/[\\\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => {
    switch (c) {
      case "\\": return "\\\\";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\t": return "\\t";
      default: return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
    }
  });
}

function emit(level: Level, msg: string): void {
  if (LEVELS[level] > threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padStart(5)} api: ${escapeLog(msg)}`;
  level === "error" ? console.error(line) : console.log(line);
}

export const log = {
  error: (msg: string) => emit("error", msg),
  warn: (msg: string) => emit("warn", msg),
  info: (msg: string) => emit("info", msg),
  debug: (msg: string) => emit("debug", msg),
  trace: (msg: string) => emit("trace", msg),
};
