import { Hono } from "hono";
import { fire } from "hono/service-worker";

import { Interpreter, type Language } from "@spinframework/sandbox/interpreter";
import type { HttpInput } from "@spinframework/sandbox/core";

const interpreters: Record<Language, Interpreter> = {
  javascript: Interpreter.javascript({ baseUrl: "http://ts-sandbox.spin.internal" }),
  python: Interpreter.python({ baseUrl: "http://py-sandbox.spin.internal" }),
};

interface RunBody {
  language?: Language;
  code?: string;
}

interface HandlerBody extends RunBody {
  input?: HttpInput;
}

// Returning (status, headers, iterable) streams each chunk as the generator yields it.
const PYTHON_STREAM_DEMO = `
import time

def handle_request(request):
    def chunks():
        for i in range(1, 6):
            yield f"chunk {i}\\n"
            time.sleep(0.5)
    return (200, {"content-type": "text/plain"}, chunks())
`;

function validRun(body: RunBody): body is RunBody & { language: Language; code: string } {
  return (body.language === "python" || body.language === "javascript") && typeof body.code === "string";
}

const app = new Hono();

app.get("/health", (context) => context.json({ ok: true }));

app.get("/stream-demo", () => interpreters.python.runHandler(PYTHON_STREAM_DEMO));

app.post("/run", async (context) => {
  let body: RunBody;
  try {
    body = await context.req.json<RunBody>();
  } catch {
    return context.json({ error: "expected JSON { language, code }" }, 400);
  }
  if (!validRun(body)) return context.json({ error: "language must be python or javascript; code must be a string" }, 400);

  const result = await interpreters[body.language].execute(body.code);
  return context.json(result);
});

app.post("/handler", async (context) => {
  let body: HandlerBody;
  try {
    body = await context.req.json<HandlerBody>();
  } catch {
    return context.json({ error: "expected JSON { language, code, input? }" }, 400);
  }
  if (!validRun(body)) return context.json({ error: "language must be python or javascript; code must be a string" }, 400);

  return interpreters[body.language].runHandler(body.code, body.input);
});

// Without this, Hono re-fetches the request itself on any 404, which Spin blocks (500).
fire(app, { fetch: undefined });