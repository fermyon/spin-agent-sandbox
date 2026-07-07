// Capturing console for the "main" code shape: user output is collected into string
// buffers instead of going to the host, and capped so unbounded logging can't OOM.

export const MAX_OUTPUT = 256 * 1024; // cap captured stdout/stderr (mirror py-sandbox _MAX_OUTPUT)

export function fmt(args: any[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

// Append-with-cap: once a stream exceeds MAX_OUTPUT it stops growing (append a marker
// once). `for(;;) console.log(...)` therefore can't grow the buffer without bound.
function capped(arr: string[]): (s: string) => void {
  let len = 0;
  let cut = false;
  return (s: string) => {
    if (cut) return;
    const remaining = MAX_OUTPUT - len;
    if (s.length >= remaining) {
      if (remaining > 0) arr.push(s.slice(0, remaining));
      arr.push("...[truncated]");
      cut = true;
      return;
    }
    len += s.length + 1; // +1 approximates the join("\n") separator
    arr.push(s);
  };
}

export function makeConsole(out: string[], err: string[]) {
  const pushOut = capped(out);
  const pushErr = capped(err);
  return {
    log: (...a: any[]) => pushOut(fmt(a)),
    info: (...a: any[]) => pushOut(fmt(a)),
    debug: (...a: any[]) => pushOut(fmt(a)),
    warn: (...a: any[]) => pushErr(fmt(a)),
    error: (...a: any[]) => pushErr(fmt(a)),
  };
}
