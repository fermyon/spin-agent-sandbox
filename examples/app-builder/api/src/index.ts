// App Builder API: an LLM generates a self-contained HTTP-handler web app; we store it via
// @spinframework/sandbox and serve each stored app live at its own URL. The LLM provider
// (Anthropic or OpenAI) is chosen at build time; see build.mjs.
//
// Two surfaces on one component:
//   /api/...   control plane: generate (model loop), app records + conversations, health/auth
//   /a/<id>/   live app: load stored code from KV, run it in the sandbox, forward its Response
//
// Live apps are model-written code, so they are kept away from the control plane. Every /a/*
// response carries `Content-Security-Policy: sandbox`, giving app pages an opaque origin: they
// never send the access cookie and cannot read /api/* responses, and /api/* also rejects
// cross-origin (including `Origin: null`) requests. Requests forwarded into an app's sandboxed
// handler have their credentials stripped. With the access gate on, an app is served under
// /a/<id>/<key>/, where the key is an HMAC of the id keyed by the access token, so the app's
// relative fetches authenticate without the cookie and a key opens only its own app.

import { Hono } from "hono";
import { fire } from "hono/service-worker";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import * as variables from "@spinframework/spin-variables";
import { createProvider } from "#llm-provider";

import { Interpreter, type Language } from "@spinframework/sandbox/interpreter";
import { KvCodeStore, serveStoredCode } from "@spinframework/sandbox/store";
import type { ToolDefinition } from "@spinframework/sandbox/tools";
import { historyFor, type History, type ToolResult } from "./llm/types";
import { log, initLogger } from "./logger";

// ---- the tool the model calls to publish an app ----

const CREATE_APP_TOOL: ToolDefinition = {
  name: "create_app",
  description:
    "Publish a complete, self-contained web app. The app is ONE HTTP handler that serves its HTML UI " +
    "at path '/' and any JSON API at sub-paths; it is stored and served live at its own URL. " +
    "JavaScript: `export default { async fetch(request) { … return new Response(html, { headers: { 'content-type': 'text/html' } }); } }`. " +
    "Python: `def handle_request(request): return Response(200, {'content-type': 'text/html'}, html.encode())`. " +
    "For a JavaScript app you may pull additional npm packages by listing them in `dependencies` " +
    "(name -> semver); they are bundled into the app at publish time. Import them with ESM `import` " +
    "(e.g. `import { marked } from 'marked'`), NOT `require()`. Python cannot add packages. " +
    "The app's network egress is DENIED by default. If the app calls an external API/tool with `fetch`, " +
    "list the hosts it will reach in `allowedHosts` (e.g. [\"api.openweathermap.org\"]); only those are permitted. " +
    "The app's private key-value store is DISABLED by default; set `kvEnabled` to true if the app persists state.",
  inputSchema: {
    type: "object",
    properties: {
      language: { type: "string", enum: ["javascript", "python"] },
      title: { type: "string", description: "A short title for the app." },
      code: { type: "string", description: "The full single-file HTTP-handler program." },
      dependencies: {
        type: "object",
        description:
          "JavaScript only. Extra npm dependencies to bundle into the app, as name -> semver range, " +
          'e.g. { "marked": "^11.0.0" }. Omit for Python or when only the pre-bundled libraries are used. ' +
          "Use each dep via ESM `import` (e.g. `import { marked } from 'marked'`), not `require()`.",
        additionalProperties: { type: "string" },
      },
      allowedHosts: {
        type: "array",
        items: { type: "string" },
        description:
          "Outbound hosts the app's server-side handler may call (default-deny; omit for no network). " +
          'Give hostnames, optionally with a port or a leading "*." wildcard, e.g. ' +
          '["api.openweathermap.org", "*.githubusercontent.com"]. Internal/loopback/metadata hosts are always blocked.',
      },
      kvEnabled: {
        type: "boolean",
        description: "Set true if the app uses its private key-value store to persist state. Default false: KV access fails.",
      },
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
    "1. Serve the HTML UI for a GET at path '/'. Route on the request path, JS: `new URL(request.url).pathname`,",
    "   Python: `urllib.parse.urlparse(request.uri).path`.",
    "2. Put any API on sub-paths (e.g. '/data') returning JSON.",
    "3. Use RELATIVE URLs everywhere in the HTML, `fetch('data')`, `href='style.css'`, never a leading '/'.",
    "   The app is mounted under a base path, so absolute paths break. The page runs in a sandboxed origin:",
    "   cookies, localStorage, sessionStorage and IndexedDB are unavailable, so keep state on the server (rule 5).",
    "4. Inline all CSS and JS in the HTML; do not load assets from a CDN. Outbound network is DENIED by default,",
    "   so a browser `fetch` to a third party will fail, but the app's server-side handler MAY call an external",
    "   API if you list its hosts in create_app's `allowedHosts` (e.g. [\"api.openweathermap.org\"]); proxy such",
    "   calls through your own sub-path (e.g. '/data') rather than from the browser. JS calls them with `fetch`;",
    "   Python with `from spin_sdk.http import send, Request` and `send(Request('GET', url, {}, None))`",
    "   (urllib.request, http.client, and requests are not available).",
    "   JavaScript only: to use an npm library beyond the pre-bundled set (lodash, zod, date-fns, dayjs, cheerio,",
    "   uuid, nanoid), list it in create_app's `dependencies` (name -> semver) and import it with ESM `import`",
    "   (e.g. `import { marked } from 'marked'`), NOT `require()`. It is bundled into the app at publish time",
    "   (not fetched at runtime). Python cannot add packages.",
    "5. To persist state across requests (counters, saved items, notes), use the app's private key-value",
    "   store, Spin's DEFAULT store, which is automatically scoped to this app and durable across requests.",
    "   It is DISABLED unless you pass `kvEnabled: true` to create_app, so set it whenever the app uses KV:",
    "   - JS: `import { openDefault } from '@spinframework/spin-kv'; const store = openDefault();` then",
    "     `store.getJson(k)`, `store.setJson(k, v)`, `store.delete(k)`, `store.exists(k)`, `store.getKeys()`.",
    "   - Python (synchronous in this sandbox): `from spin_sdk import key_value; store = key_value.open_default()`",
    "     then `store.get(k)` (bytes or None), `store.set(k, b'…')`, `store.delete(k)`, `store.exists(k)`,",
    "     `store.get_keys()`. There are no JSON helpers: use `json.dumps(v).encode()` and `json.loads(store.get(k))`.",
    "   Reference: https://spinframework.dev/v4/kv-store-api-guide",
    "6. JavaScript: `await` all asynchronous work (`fetch`, timers) before returning the `Response`.",
    "   Never leave floating promises, such as an un-awaited `doWork()` call: work still running when the handler",
    "   returns is discarded without any output or error.",
    "7. Keep it one self-contained file, then call create_app with { language, title, code } (plus `kvEnabled` if it uses KV).",
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
  | { t: "done"; history: History }
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

// The interpreters are two private, service-chained components, one per language. Storage
// (the code registry) runs through the JS interpreter's scoped KV.
function makeStore() {
  const tsUrl = variables.get("ts_interpreter_url") ?? "http://ts-sandbox.spin.internal";
  const pyUrl = variables.get("py_interpreter_url") ?? "http://py-sandbox.spin.internal";
  const bundlerUrl = variables.get("bundler_url") ?? "http://bundler.spin.internal";
  // The JS interpreter also knows the bundler, so apps can pull extra npm deps, bundled once
  // at publish (see create_app below).
  const interpreters: Record<Language, Interpreter> = {
    javascript: Interpreter.javascript({ baseUrl: tsUrl, bundlerUrl }),
    python: Interpreter.python({ baseUrl: pyUrl }),
  };
  const store = new KvCodeStore({ interpreter: interpreters.javascript, namespace: "apps" });
  // Per-app conversation blobs (opaque to the api; the UI owns the shape), in their own
  // KV scope so they never collide with the code registry.
  const convos = interpreters.javascript.kv("convos");
  return { store, interpreters, convos };
}

async function runAgent(
  prompt: string,
  session: { id?: string; history: unknown },
  emit: Emit,
): Promise<void> {
  const llm = createProvider();
  const { store, interpreters } = makeStore();
  let appId = session.id;

  // Continue the conversation, or seed a fresh edit session with the app's current code.
  // History from a different provider is dropped, so an edit restarts from the stored code.
  const messages = historyFor(llm, session.history);
  if (messages.length === 0 && appId) {
    const current = await store.get(appId);
    if (current) {
      const fence = current.language === "python" ? "python" : "javascript";
      messages.push(
        llm.userMessage(
          `You are editing an existing app titled "${current.title ?? appId}" (${current.language}). ` +
            `Its current code is:\n\n\`\`\`${fence}\n${current.code}\n\`\`\`\n\n` +
            `Apply this change and re-publish the FULL updated app with create_app: ${prompt}`,
        ),
      );
    } else {
      messages.push(llm.userMessage(prompt));
    }
  } else {
    messages.push(llm.userMessage(prompt));
  }
  const done = () => emit({ t: "done", history: { provider: llm.name, items: messages } });

  log.info(
    `generate: provider=${llm.name} model=${llm.model} ${appId ? `edit=${appId}` : "new"} prompt=${JSON.stringify(prompt.slice(0, 80))}`,
  );

  // Let the model reason, (re)write the app, and call create_app; loop until it stops.
  for (let turn = 0; turn < 4; turn++) {
    const toolBufs: Record<number, string> = {}; // accumulated partial JSON per tool block
    const toolEmitLen: Record<number, number> = {}; // last code length we streamed (throttle)
    const res = await llm.turn(
      messages,
      { system: systemPrompt(), tools: [CREATE_APP_TOOL], maxTokens: 8192 },
      {
        onToolStart(block, name) {
          if (name !== "create_app") return;
          toolBufs[block] = "";
          toolEmitLen[block] = -1;
          emit({ t: "tool_start", block: `${turn}-${block}` });
        },
        onText(block, text) {
          emit({ t: "text_delta", block: `${turn}-${block}`, text });
        },
        onToolInput(block, partialJson) {
          if (toolBufs[block] === undefined) return;
          toolBufs[block] += partialJson;
          const buf = toolBufs[block];
          const codeF = extractField(buf, "code");
          const codeLen = codeF?.value.length ?? 0;
          // Throttle: stream the code once it grows ~24 chars (or the first bytes appear).
          if (codeLen - toolEmitLen[block] >= 24 || (toolEmitLen[block] === -1 && codeLen > 0)) {
            toolEmitLen[block] = codeLen;
            const langF = extractField(buf, "language");
            const titleF = extractField(buf, "title");
            emit({
              t: "tool_delta",
              block: `${turn}-${block}`,
              code: (codeF?.value ?? "").slice(-1600), // a tail is enough for a live preview
              language: langF?.complete ? langF.value : "",
              title: titleF?.complete ? titleF.value : "",
            });
          }
        },
      },
    );

    const toolResults: ToolResult[] = [];
    for (const call of res.toolCalls) {
      if (call.name !== "create_app") {
        toolResults.push({ id: call.id, content: `error: unknown tool ${call.name}`, isError: true });
        continue;
      }
      const input = call.input as {
        language: Language;
        title: string;
        code: string;
        dependencies?: Record<string, string>;
        allowedHosts?: string[];
        kvEnabled?: boolean;
      };
      if ((input.language !== "python" && input.language !== "javascript") || typeof input.code !== "string") {
        toolResults.push({
          id: call.id,
          content: "error: create_app needs language (python|javascript), title, and code",
          isError: true,
        });
        continue;
      }
      const title = typeof input.title === "string" && input.title ? input.title : "Untitled app";
      const blockId = `${turn}-${call.block}`; // same index as the streamed output block
      emit({ t: "tool_saving", block: blockId });
      // The code being replaced (when editing), so the UI can show a diff.
      const before = appId ? await store.get(appId) : null;
      // JS apps with extra deps are bundled ONCE here at publish; the store keeps the source
      // (for editing/diffs) and the self-contained bundle (what serveStoredCode runs).
      const deps =
        input.language === "javascript" && input.dependencies && Object.keys(input.dependencies).length
          ? input.dependencies
          : undefined;
      const bundled = deps ? await interpreters.javascript.bundle(input.code, { dependencies: deps }) : undefined;
      // The model lists the hosts the app may call; egress is default-deny otherwise. Stored with
      // the app so serveStoredCode applies it on every request.
      const allowedHosts = Array.isArray(input.allowedHosts) ? input.allowedHosts : undefined;
      // Save at the app's id when editing (update in place); otherwise mint a new one.
      const meta = await store.save({
        id: appId,
        code: input.code,
        language: input.language,
        title,
        dependencies: deps,
        allowedHosts,
        kvEnabled: input.kvEnabled === true,
        bundled,
      });
      appId = meta.id; // subsequent turns in this session edit the same app
      const url = `/a/${meta.id}/`;
      log.info(`saved app id=${meta.id} lang=${input.language} bytes=${input.code.length}`);
      emit({
        t: "app_saved",
        block: blockId,
        id: meta.id,
        url,
        title,
        language: input.language,
        code: input.code,
        prevCode: before?.code ?? null,
      });
      toolResults.push({ id: call.id, content: `Published "${title}", live at ${url}` });
    }

    if (res.toolCalls.length === 0) {
      done();
      return;
    }
    messages.push(...llm.toolResults(toolResults));
  }
  done();
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
// `app_token` cookie (set by POST /api/auth). Live apps instead authenticate with their per-app
// key (see the /a/* routes). An empty token disables the gate: fine for local dev, but then
// anyone who can reach the app can spend the model key and read or overwrite every app.
const AUTH_COOKIE = "app_token";
const accessToken = () => (variables.get("access_token") ?? "").trim();
const hasAccess = (c: Context, token: string) => !token || getCookie(c, AUTH_COOKIE) === token;

app.use(async (c: Context, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/api/health" || path === "/api/auth" || path.startsWith("/a/")) return next();
  if (!hasAccess(c, accessToken())) return c.text("Unauthorized", 401);
  return next();
});

// Only this origin's own pages may call the control plane. Browsers send `Origin` on every
// cross-origin request and on same-origin writes; live apps run in a sandboxed (opaque) origin
// and send `Origin: null`, so they are rejected here even when the gate is off.
app.use("/api/*", async (c: Context, next) => {
  const origin = c.req.header("origin");
  if (origin !== undefined && !isSameHost(origin, c.req.url)) return c.json({ error: "forbidden" }, 403);
  return next();
});

function isSameHost(origin: string, requestUrl: string): boolean {
  try {
    // Compare hosts, not schemes: behind a TLS-terminating proxy the request URL is http.
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false; // "null" (sandboxed page) or garbage
  }
}

function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";
}

app.get("/api/health", (c: Context) => {
  const token = accessToken();
  const llm = createProvider();
  return c.json({
    ok: true,
    provider: llm.name,
    model: llm.model,
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
    // HttpOnly: page scripts (including any app that escaped its sandbox) cannot read it.
    // Secure over HTTPS only, so plain http://localhost keeps working.
    setCookie(c, AUTH_COOKIE, token, {
      path: "/",
      httpOnly: true,
      secure: isHttps(c),
      sameSite: "Lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.json({ ok: true });
  }
  return c.json({ ok: false, error: "invalid access token" }, 401);
});

app.get("/api/apps", async (c: Context) => {
  const { store } = makeStore();
  return c.json(await store.list());
});

// The full record (source + saved conversation) for one app, so the UI can show its code
// and restore the chat history any time (survives navigating away and reloads).
app.get("/api/apps/:id", async (c: Context) => {
  const { store, convos } = makeStore();
  const id = c.req.param("id") ?? "";
  const rec = await store.get(id);
  if (!rec) return c.json({ error: "not found" }, 404);
  const convo = (await convos.getJson<unknown>(id)) ?? { messages: [], history: null };
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
  if (!accessToken()) {
    log.warn("access_token is empty: anyone who can reach this app can use the model key and change every app");
  }
  let prompt = "";
  let id: string | undefined;
  let history: unknown = null;
  try {
    const body = await c.req.json<{ prompt?: string; id?: string; history?: unknown }>();
    prompt = (body.prompt ?? "").trim();
    if (typeof body.id === "string") id = body.id;
    history = body.history ?? null;
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

// ---- live apps ----

// Applied to every /a/* response. `sandbox` without allow-same-origin gives the page an opaque
// origin, so it cannot use the access cookie, same-origin storage, or read /api/* responses.
const APP_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads";
// The sandboxed page's own relative fetches are cross-origin (from origin "null"), so allow them.
const APP_CORS = { "access-control-allow-origin": "*" };
// Credentials that must never reach model-written handler code.
const STRIPPED_HEADERS = new Set(["cookie", "authorization", "proxy-authorization"]);

// The per-app key: HMAC-SHA256(access token, app id), hex, truncated to 128 bits.
async function appKey(token: string, id: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(id)));
  return Array.from(mac.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

// A stored app with no trailing slash → redirect so its relative URLs resolve under /a/<id>/.
app.get("/a/:id", (c: Context) => c.redirect(`/a/${c.req.param("id")}/`, 302));

// Serve a stored app live: resolve its base path, run the handler in the sandbox, forward it.
app.all("/a/:id/*", async (c: Context) => {
  const id = c.req.param("id") ?? "";
  const url = new URL(c.req.url);
  let rest = url.pathname.slice(`/a/${id}`.length) || "/";

  // With the gate on, the first segment must be this app's key. A cookie-holding visitor
  // without it (e.g. the UI's "Open live" link) is redirected to the keyed path.
  let base = `/a/${id}/`;
  const token = accessToken();
  if (token) {
    const key = await appKey(token, id);
    const [, first = "", ...tail] = rest.split("/");
    if (first === key) {
      base = `/a/${id}/${key}/`;
      rest = "/" + tail.join("/");
    } else if (getCookie(c, AUTH_COOKIE) === token && (c.req.method === "GET" || c.req.method === "HEAD")) {
      return c.redirect(`/a/${id}/${key}${rest}${url.search}`, 302);
    } else {
      return c.text("Unauthorized", 401, { "content-security-policy": APP_CSP });
    }
  }

  // CORS preflight from the sandboxed page's own non-simple fetches (e.g. a JSON POST).
  if (c.req.method === "OPTIONS" && c.req.header("access-control-request-method")) {
    return new Response(null, {
      status: 204,
      headers: {
        ...APP_CORS,
        "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE",
        "access-control-allow-headers": c.req.header("access-control-request-headers") ?? "",
        "access-control-max-age": "600",
      },
    });
  }

  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });
  const method = c.req.method;
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    if (!STRIPPED_HEADERS.has(k.toLowerCase())) headers[k] = v;
  });
  const body = method === "GET" || method === "HEAD" ? undefined : await c.req.text();

  const { store, interpreters } = makeStore();
  const resp = await serveStoredCode(store, interpreters, id, { method, path: rest, query, headers, body });
  return finishResponse(resp, base);
});

// Presentation layer: inject <base> into served HTML so relative URLs resolve under the app,
// prettify a sandbox crash into a readable page, and harden headers.
async function finishResponse(resp: Response, baseHref: string): Promise<Response> {
  const ct = resp.headers.get("content-type") ?? "application/octet-stream";
  // Build FRESH headers; never copy the upstream response's headers wholesale. Its
  // `content-length` describes the ORIGINAL body; re-sending it with a modified body (base
  // injection) or streaming an outbound body straight through makes the declared length
  // mismatch the bytes written, which traps wasi-http mid-response ("after response started").
  const headers: Record<string, string> = {
    "content-type": ct,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": APP_CSP,
    ...APP_CORS,
  };

  // A sandbox handler crash comes back as 500 JSON; show a readable page instead.
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

// Without this, Hono re-fetches the request itself on any 404, which Spin blocks (500).
fire(app, { fetch: undefined });
