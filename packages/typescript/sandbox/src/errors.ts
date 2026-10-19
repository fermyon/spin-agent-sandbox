// Formatting thrown values for the outcome. User code can throw anything, including
// values whose `message`/`stack` getters or string conversion throw (for example
// `throw Object.create(null)`). These helpers never throw, so an error outcome can
// always be returned instead of the component trapping.

function toText(value: unknown): string | undefined {
  try {
    return String(value);
  } catch {
    return undefined;
  }
}

export function errorMessage(e: unknown): string {
  let message: unknown;
  try {
    message = (e as any)?.message;
  } catch {
    message = undefined;
  }
  return toText(message ?? e) ?? "uncaught value that cannot be converted to a string";
}

// V8's `.stack` starts with "Error: <message>"; SpiderMonkey's (this
// component runs on StarlingMonkey) is frames-only, so relying on `.stack`
// alone silently drops the actual error text on this engine.
export function errorText(e: unknown): string {
  const message = errorMessage(e);
  let stack: string | undefined;
  try {
    const raw = (e as any)?.stack;
    stack = raw ? toText(raw) : undefined;
  } catch {
    stack = undefined;
  }
  return stack ? `${message}\n${stack}` : message;
}
