// App Builder API — Claude generates a self-contained HTTP-handler web app; we store it via
// @spinframework/sandbox and serve each stored app live at its own URL.
//
// Two surfaces on one component:
//   /api/...   control plane — generate (Claude loop) + list apps
//   /a/<id>/   live app — load stored code from KV, run it in the sandbox, forward its Response

import { Hono } from "hono";
import { fire } from "hono/service-worker";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import * as variables from "@spinframework/spin-variables";

import { Interpreter, type Language } from "@spinframework/sandbox/interpreter";
import { KvCodeStore, serveStoredCode } from "@spinframework/sandbox/store";
import { log, initLogger } from "./logger";

// ---- the tool the model calls to publish an app ----

const CREATE_APP_TOOL: Anthropic.Tool = {
  name: "create_app",
  description:
    "Publish a complete, self-contained web app. The app is ONE HTTP handler that serves its HTML UI " +
    "at path '/' and any JSON API at sub-paths; it is stored and served live at its own URL. " +
    "JavaScript: `export default { async fetch(request) { … return new Response(html, { headers: { 'content-type': 'text/html' } }); } }`. " +
    "Python: `def handle_request(request): return Response(200, {'content-type': 'text/html'}, html.encode())`.",
  input_schema: {
    type: "object",
    properties: {
      language: { type: "string", enum: ["javascript", "python"] },
      title: { type: "string", description: "A short title for the app." },
      code: { type: "string", description: "The full single-file HTTP-handler program." },
    },
    required: ["language", "title", "code"],
  },
};

function systemPrompt(): string {
  return [
    "You are App Builder. Given a request, WRITE a complete, self-contained web app and publish it by",
    "calling the create_app tool. The app is a SINGLE HTTP handler:",
    "- JavaScript: `export default { async fetch(request) { … } }` returning a `Response`.",
    "- Python: `def handle_request(request):` returning a `Response(status, headers, body_bytes)`.",
    "Rules:",
    "1. Serve the HTML UI for a GET at path '/'. Route on the request path — JS: `new URL(request.url).pathname`,",
    "   Python: `urllib.parse.urlparse(request.uri).path`.",
    "2. Put any API on sub-paths (e.g. '/data') returning JSON.",
    "3. Use RELATIVE URLs everywhere in the HTML — `fetch('data')`, `href='style.css'` — never a leading '/'.",
    "   The app is mounted under a base path, so absolute paths break.",
    "4. Inline all CSS and JS in the HTML. No external requests, no CDN — the sandbox denies network by default.",
    "5. To persist state across requests (counters, saved items, notes), use the app's private key-value",
    "   store — Spin's DEFAULT store, which is automatically scoped to this app and durable across requests:",
    "   - JS: `import { openDefault } from '@spinframework/spin-kv'; const store = openDefault();` then",
    "     `store.getJson(k)`, `store.setJson(k, v)`, `store.delete(k)`, `store.exists(k)`, `store.getKeys()`.",
    "   - Python (synchronous in this sandbox): `from spin_sdk import key_value; store = key_value.open_default()`",
    "     then `store.get_json(k)`, `store.set_json(k, v)`, `store.get(k)`/`store.set(k, b'…')` (bytes),",
    "     `store.delete(k)`, `store.exists(k)`, `store.get_keys()`.",
    "   Reference: https://spinframework.dev/v4/kv-store-api-guide",
    "6. Keep it one self-contained file, then call create_app with { language, title, code }.",
    "After publishing, reply with a single short sentence naming the app.",
  ].join("\n");
}

// ---- streaming wire events (one JSON object per line, NDJSON) ----

type WireEvent =
  | { t: "text_delta"; block: string; text: string }
  | { t: "tool_start"; block: string } // model began writing the app (create_app tool call)
  | { t: "tool_delta"; block: string; code: string; language: string; title: string } // code streaming in
  | { t: "tool_saving"; block: string } // tool call done, persisting to the sandbox
  | { t: "app_saved"; block: string; id: string; url: string; title: string; language: string; code: string; prevCode: string | null }
  | { t: "done"; messages: Anthropic.MessageParam[] }
  | { t: "error"; error: string };

type Emit = (e: WireEvent) => void;

// Incrementally decode a JSON string value starting at the opening-quote index of `buf`.
// Returns the value decoded so far and whether the closing quote was reached. Used to pull
// the code/title/language out of the create_app tool input *as it streams* (partial JSON).
function decodeJsonStringAt(buf: string, openQuote: number): { value: string; complete: boolean } {
  let s = "";
  for (let k = openQuote + 1; k < buf.length; k++) {
    const ch = buf[k];
    if (ch === "\\") {
      const next = buf[k + 1];
      if (next === undefined) return { value: s, complete: false }; // escape split across chunks
      if (next === "n") s += "\n";
      else if (next === "t") s += "\t";
      else if (next === "r") s += "\r";
      else if (next === "b") s += "\b";
      else if (next === "f") s += "\f";
      else if (next === "u") {
        const hex = buf.slice(k + 2, k + 6);
        if (hex.length < 4) return { value: s, complete: false };
        s += String.fromCharCode(parseInt(hex, 16));
        k += 4;
      } else s += next; // \" \\ \/ and the rest → the literal char
      k += 1;
    } else if (ch === '"') {
      return { value: s, complete: true };
    } else {
      s += ch;
    }
  }
  return { value: s, complete: false };
}

// Pull one string field out of a (possibly incomplete) JSON object buffer.
function extractField(buf: string, key: string): { value: string; complete: boolean } | null {
  const i = buf.indexOf(`"${key}"`);
  if (i < 0) return null;
  const colon = buf.indexOf(":", i + key.length + 2);
  if (colon < 0) return null;
  const q = buf.indexOf('"', colon + 1);
  if (q < 0) return null;
  return decodeJsonStringAt(buf, q);
}

// The interpreters are two private, service-chained components — one per language. Storage
// (the code registry) runs through the JS interpreter's scoped KV.
function makeStore() {
  const tsUrl = variables.get("ts_interpreter_url") ?? "http://ts-sandbox.spin.internal";
  const pyUrl = variables.get("py_interpreter_url") ?? "http://py-sandbox.spin.internal";
  const interpreters: Record<Language, Interpreter> = {
    javascript: new Interpreter({ baseUrl: tsUrl }),
    python: new Interpreter({ baseUrl: pyUrl }),
  };
  const store = new KvCodeStore({ interpreter: interpreters.javascript, namespace: "apps" });
  // Per-app conversation blobs (opaque to the api — the UI owns the shape), in their own
  // KV scope so they never collide with the code registry.
  const convos = interpreters.javascript.kv("convos");
  return { store, interpreters, convos };
}

async function runAgent(
  prompt: string,
  session: { id?: string; history: Anthropic.MessageParam[] },
  emit: Emit,
): Promise<void> {
  const apiKey = variables.get("anthropic_api_key") ?? "";
  const model = variables.get("model") ?? "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey });
  const { store } = makeStore();
  let appId = session.id;

  // Continue the conversation, or seed a fresh edit session with the app's current code.
  const messages: Anthropic.MessageParam[] = [...session.history];
  if (messages.length === 0 && appId) {
    const current = await store.get(appId);
    if (current) {
      const fence = current.language === "python" ? "python" : "javascript";
      messages.push({
        role: "user",
        content:
          `You are editing an existing app titled "${current.title ?? appId}" (${current.language}). ` +
          `Its current code is:\n\n\`\`\`${fence}\n${current.code}\n\`\`\`\n\n` +
          `Apply this change and re-publish the FULL updated app with create_app: ${prompt}`,
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }
  } else {
    messages.push({ role: "user", content: prompt });
  }

  log.info(`generate: model=${model} ${appId ? `edit=${appId}` : "new"} prompt=${JSON.stringify(prompt.slice(0, 80))}`);

  // Let the model reason, (re)write the app, and call create_app; loop until it stops.
  for (let turn = 0; turn < 4; turn++) {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 8192,
      system: systemPrompt(),
      tools: [CREATE_APP_TOOL],
      messages,
    });
    const toolBufs: Record<number, string> = {}; // accumulated partial JSON per tool block
    const toolEmitLen: Record<number, number> = {}; // last code length we streamed (throttle)
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use" && event.content_block.name === "create_app") {
        toolBufs[event.index] = "";
        toolEmitLen[event.index] = -1;
        emit({ t: "tool_start", block: `${turn}-${event.index}` });
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
        emit({ t: "text_delta", block: `${turn}-${event.index}`, text: event.delta.text });
      } else if (event.type === "content_block_delta" && event.delta.type === "input_json_delta" && toolBufs[event.index] !== undefined) {
        toolBufs[event.index] += event.delta.partial_json;
        const buf = toolBufs[event.index];
        const codeF = extractField(buf, "code");
        const codeLen = codeF?.value.length ?? 0;
        // Throttle: stream the code once it grows ~24 chars (or the first bytes appear).
        if (codeLen - toolEmitLen[event.index] >= 24 || (toolEmitLen[event.index] === -1 && codeLen > 0)) {
          toolEmitLen[event.index] = codeLen;
          const langF = extractField(buf, "language");
          const titleF = extractField(buf, "title");
          emit({
            t: "tool_delta",
            block: `${turn}-${event.index}`,
            code: (codeF?.value ?? "").slice(-1600), // a tail is enough for a live preview
            language: langF?.complete ? langF.value : "",
            title: titleF?.complete ? titleF.value : "",
          });
        }
      }
    }
    const res = await stream.finalMessage();

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (let idx = 0; idx < res.content.length; idx++) {
      const block = res.content[idx];
      if (block.type === "tool_use" && block.name === "create_app") {
        const input = block.input as { language: Language; title: string; code: string };
        const blockId = `${turn}-${idx}`; // same index as the streamed content block
        emit({ t: "tool_saving", block: blockId });
        // The code being replaced (when editing), so the UI can show a diff.
        const before = appId ? await store.get(appId) : null;
        // Save at the app's id when editing (update in place); otherwise mint a new one.
        const meta = await store.save({ id: appId, code: input.code, language: input.language, title: input.title });
        appId = meta.id; // subsequent turns in this session edit the same app
        const url = `/a/${meta.id}/`;
        log.info(`saved app id=${meta.id} lang=${input.language} bytes=${input.code.length}`);
        emit({
          t: "app_saved",
          block: blockId,
          id: meta.id,
          url,
          title: input.title,
          language: input.language,
          code: input.code,
          prevCode: before?.code ?? null,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Published "${input.title}" — live at ${url}`,
        });
      }
    }

    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "tool_use") {
      emit({ t: "done", messages });
      return;
    }
    messages.push({ role: "user", content: toolResults });
  }
  emit({ t: "done", messages });
}

// ---- HTTP surface ----

const app = new Hono();

app.use(async (c: Context, next) => {
  initLogger();
  c.header("server", "app-builder");
  await next();
});

// ---- access-token gate ----
// If the `access_token` variable is set, every route except health/auth requires a matching
// `app_token` cookie (set by POST /api/auth) — including the live `/a/<id>/` app URLs, which a
// browser navigation carries via the cookie. An empty token disables the gate (local dev).
const AUTH_COOKIE = "app_token";
const accessToken = () => (variables.get("access_token") ?? "").trim();

app.use(async (c: Context, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/api/health" || path === "/api/auth") return next();
  const token = accessToken();
  if (token && getCookie(c, AUTH_COOKIE) !== token) return c.text("Unauthorized", 401);
  return next();
});

// Keep a stored app's own JS from reaching the control plane: reject /api/* calls whose
// referer is inside a live app (/a/...). A served app fetches its OWN /a/<id>/* sub-paths.
app.use("/api/*", async (c: Context, next) => {
  const ref = c.req.header("referer");
  if (ref) {
    try {
      if (new URL(ref).pathname.startsWith("/a/")) return c.json({ error: "forbidden" }, 403);
    } catch {
      // unparseable referer — allow
    }
  }
  return next();
});

app.get("/api/health", (c: Context) => {
  const token = accessToken();
  return c.json({
    ok: true,
    model: variables.get("model") ?? "claude-opus-4-8",
    authRequired: token !== "",
    authed: token === "" || getCookie(c, AUTH_COOKIE) === token,
  });
});

// Validate the access token and, on success, set the gate cookie.
app.post("/api/auth", async (c: Context) => {
  const token = accessToken();
  if (!token) return c.json({ ok: true }); // gate disabled
  let given = "";
  try {
    given = ((await c.req.json<{ token?: string }>()).token ?? "").trim();
  } catch {
    /* fall through to 401 */
  }
  if (given && given === token) {
    setCookie(c, AUTH_COOKIE, token, { path: "/", sameSite: "Lax", maxAge: 60 * 60 * 24 * 30 });
    return c.json({ ok: true });
  }
  return c.json({ ok: false, error: "invalid access token" }, 401);
});

app.get("/api/apps", async (c: Context) => {
  const { store } = makeStore();
  return c.json(await store.list());
});

// The full record (source + saved conversation) for one app — so the UI can show its code
// and restore the chat history any time (survives navigating away and reloads).
app.get("/api/apps/:id", async (c: Context) => {
  const { store, convos } = makeStore();
  const id = c.req.param("id") ?? "";
  const rec = await store.get(id);
  if (!rec) return c.json({ error: "not found" }, 404);
  const convo = (await convos.getJson<unknown>(id)) ?? { messages: [], history: [] };
  return c.json({ ...rec, convo });
});

// Persist an app's conversation (display transcript + model history). Stored opaquely.
app.put("/api/apps/:id/convo", async (c: Context) => {
  const { convos } = makeStore();
  const id = c.req.param("id") ?? "";
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  await convos.setJson(id, body);
  return c.json({ ok: true });
});

app.post("/api/generate", async (c: Context) => {
  let prompt = "";
  let id: string | undefined;
  let history: Anthropic.MessageParam[] = [];
  try {
    const body = await c.req.json<{ prompt?: string; id?: string; history?: Anthropic.MessageParam[] }>();
    prompt = (body.prompt ?? "").trim();
    if (typeof body.id === "string") id = body.id;
    if (Array.isArray(body.history)) history = body.history;
  } catch {
    return c.json({ error: "expected JSON body { prompt: string, id?, history? }" }, 400);
  }
  if (!prompt) return c.json({ error: "prompt is required" }, 400);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (e) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(prompt, { id, history }, emit);
      } catch (e: any) {
        log.error(`generate error: ${e?.stack ?? e}`);
        emit({ t: "error", error: String(e?.message ?? e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
});

// A stored app with no trailing slash → redirect so its relative URLs resolve under /a/<id>/.
app.get("/a/:id", (c: Context) => c.redirect(`/a/${c.req.param("id")}/`, 302));

// Serve a stored app live: strip the /a/<id> prefix, run the handler in the sandbox, forward it.
app.all("/a/:id/*", async (c: Context) => {
  const id = c.req.param("id") ?? "";
  const { store, interpreters } = makeStore();
  const url = new URL(c.req.url);
  const prefix = `/a/${id}`;
  let path = url.pathname.slice(prefix.length) || "/";
  if (!path.startsWith("/")) path = "/" + path;
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });
  const method = c.req.method;
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const body = method === "GET" || method === "HEAD" ? undefined : await c.req.text();

  const resp = await serveStoredCode(store, interpreters, id, { method, path, query, headers, body });
  return finishResponse(resp, `${prefix}/`);
});

// Presentation layer: inject <base> into served HTML so relative URLs resolve under the app,
// prettify a sandbox crash into a readable page, and harden headers.
async function finishResponse(resp: Response, baseHref: string): Promise<Response> {
  const ct = resp.headers.get("content-type") ?? "application/octet-stream";
  // Build FRESH headers — never copy the upstream response's headers wholesale. Its
  // `content-length` describes the ORIGINAL body; re-sending it with a modified body (base
  // injection) or streaming an outbound body straight through makes the declared length
  // mismatch the bytes written, which traps wasi-http mid-response ("after response started").
  const headers: Record<string, string> = {
    "content-type": ct,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };

  // A sandbox handler crash comes back as 500 JSON — show a readable page instead.
  if (resp.status >= 500 && ct.includes("application/json")) {
    const j: any = await resp.json().catch(() => ({}));
    const detail = String(j?.trace ?? j?.message ?? "unknown error");
    const page =
      `<!doctype html><meta charset="utf-8"><title>App error</title>` +
      `<body style="font:13px ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px;color:#b42318;background:#fff">` +
      `<h2 style="margin:0 0 12px">This app crashed</h2><pre style="white-space:pre-wrap">${escapeHtml(detail)}</pre></body>`;
    return new Response(page, { status: resp.status, headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
  }

  if (ct.includes("text/html")) {
    let html = await resp.text();
    if (!/<base\b/i.test(html)) {
      const tag = `<base href="${baseHref}">`;
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : tag + html;
    }
    return new Response(html, { status: resp.status, headers });
  }

  // Everything else (JSON APIs, etc.): buffer and re-emit so we never stream an outbound
  // body back out and the runtime computes a correct content-length from the buffer.
  const buf = await resp.arrayBuffer();
  return new Response(buf, { status: resp.status, headers });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

fire(app);
