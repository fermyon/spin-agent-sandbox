import * as variables from "@spinframework/spin-variables";

const LEVELS: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
type Level = keyof typeof LEVELS;

let threshold = 2;

export function initLogger(): void {
  const raw = variables.get("log_level") ?? "info";
  threshold = LEVELS[raw.trim().toLowerCase()] ?? LEVELS["info"];
}

function emit(level: Level, msg: string): void {
  if (LEVELS[level] > threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padStart(5)} ts_sandbox: ${msg}`;
  level === "error" ? console.error(line) : console.log(line);
}

export const log = {
  error: (msg: string) => emit("error", msg),
  warn: (msg: string) => emit("warn", msg),
  info: (msg: string) => emit("info", msg),
  debug: (msg: string) => emit("debug", msg),
  trace: (msg: string) => emit("trace", msg),
};
