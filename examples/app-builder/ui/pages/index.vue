<template>
  <div v-if="gate === 'locked'" class="gate">
    <div class="gate-card">
      <h1 class="gate-title">App Builder</h1>
      <p class="gate-sub">Enter access token to continue</p>
      <input
        v-model="token"
        class="gate-input"
        type="password"
        placeholder="Access token"
        :disabled="gateBusy"
        @keydown.enter.prevent="submitToken"
      />
      <button class="gate-btn" :disabled="!token.trim() || gateBusy" @click="submitToken">
        {{ gateBusy ? "Checking…" : "Continue" }}
      </button>
      <p v-if="gateError" class="gate-err">{{ gateError }}</p>
    </div>
  </div>

  <div v-else-if="gate === 'open'" class="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">App Builder</span>
        <span class="tag">generate web apps · edit by chatting · run live in a Wasm sandbox</span>
      </div>
      <button class="ghost" @click="showHelp = true">How it works</button>
    </header>

    <div class="body">
      <aside class="sidebar">
        <button class="newbtn" :class="{ active: activeId === null }" @click="newApp">＋ New app</button>
        <div class="applist">
          <button
            v-for="a in apps"
            :key="a.id"
            class="applink"
            :class="{ active: a.id === activeId }"
            @click="openEdit(a)"
          >
            <span class="badge" :class="a.language">{{ shortLang(a.language) }}</span>
            <span class="applink-title">{{ a.title || a.id }}</span>
          </button>
          <p v-if="!apps.length" class="side-empty">No apps yet — build one.</p>
        </div>
      </aside>

      <main class="main">
        <div v-if="activeMeta" class="appbar">
          <span class="badge" :class="activeMeta.language">{{ activeMeta.language }}</span>
          <strong class="appbar-title">{{ activeMeta.title }}</strong>
          <div class="segtoggle">
            <button :class="{ on: mainView === 'chat' }" @click="mainView = 'chat'">Chat</button>
            <button :class="{ on: mainView === 'code' }" @click="mainView = 'code'">Code</button>
          </div>
          <a class="open" :href="activeMeta.url" target="_blank" rel="noopener">Open live ↗</a>
        </div>

        <!-- Persistent source view for the active app — loaded from the backend, so it
             survives navigating between apps (unlike the ephemeral chat transcript). -->
        <div v-if="activeMeta && mainView === 'code'" class="codepane">
          <div v-if="lastDiff" class="codepane-bar">
            <div class="viewtoggle">
              <button :class="{ on: codeView === 'diff' }" @click="codeView = 'diff'">Changes</button>
              <button :class="{ on: codeView === 'code' }" @click="codeView = 'code'">Code</button>
            </div>
          </div>
          <div v-if="!activeCode" class="codepane-empty">Loading source…</div>
          <div v-else-if="lastDiff && codeView === 'diff'" class="diff diff-fill">
            <div v-for="(d, k) in lastDiff" :key="k" class="dl" :class="d.t"><span class="dm">{{ d.t === "add" ? "+" : d.t === "del" ? "−" : " " }}</span>{{ d.text }}</div>
          </div>
          <pre v-else class="code code-fill"><code class="hljs" v-html="highlight(activeCode, activeLang)"></code></pre>
        </div>

        <div v-else ref="scrollEl" class="transcript">
          <section v-if="!messages.length && activeId === null" class="welcome">
            <h2>Describe an app to build</h2>
            <p class="welcome-sub">Claude writes a self-contained web app, runs it live, and you can keep editing it by chatting.</p>
            <div class="suggestions">
              <button v-for="p in SUGGESTIONS" :key="p" class="chip" @click="send(p)">{{ p }}</button>
            </div>
          </section>

          <template v-for="(m, i) in messages" :key="i">
            <div v-if="m.t === 'user'" class="user">{{ m.text }}</div>
            <div v-else-if="m.t === 'assistant'" class="assistant">{{ m.text }}</div>
            <div v-else-if="m.t === 'app'" class="appcard" :class="{ live: m.phase !== 'done' }">
              <div class="appcard-head">
                <span class="badge" :class="m.language || 'pending'">{{ m.language || "app" }}</span>
                <strong class="appcard-title">{{
                  m.phase === "done" ? m.title : m.title || (m.phase === "saving" ? "Publishing…" : "Writing the app…")
                }}</strong>
                <span v-if="m.phase !== 'done'" class="pulse" aria-hidden="true"></span>
                <template v-if="m.phase === 'done'">
                  <div v-if="m.prevCode !== null" class="viewtoggle">
                    <button :class="{ on: m.view === 'diff' }" @click="m.view = 'diff'">Changes</button>
                    <button :class="{ on: m.view === 'code' }" @click="m.view = 'code'">Code</button>
                  </div>
                  <a class="open" :href="m.url" target="_blank" rel="noopener">Open live ↗</a>
                </template>
              </div>
              <div v-if="m.phase === 'done' && m.view === 'diff'" class="diff">
                <div v-for="(d, k) in m.diffLines" :key="k" class="dl" :class="d.t"><span class="dm">{{ d.t === "add" ? "+" : d.t === "del" ? "−" : " " }}</span>{{ d.text }}</div>
              </div>
              <pre v-else-if="m.phase === 'done'" class="code"><code class="hljs" v-html="highlight(m.code, m.language)"></code></pre>
              <pre v-else-if="m.code" class="code code-live"><code>{{ tail(m.code) }}</code></pre>
            </div>
          </template>

          <p v-if="building && messages.length && messages[messages.length - 1].t === 'user'" class="thinking">Thinking…</p>
          <p v-if="error" class="err">⚠ {{ error }}</p>
        </div>

        <footer class="composer">
          <textarea
            v-model="draft"
            :disabled="building"
            rows="2"
            :placeholder="activeId ? 'Describe a change… (⌘/Ctrl+Enter)' : 'Describe an app to build… (⌘/Ctrl+Enter)'"
            @keydown.meta.enter.prevent="send()"
            @keydown.ctrl.enter.prevent="send()"
          />
          <button class="primary" :disabled="building || !draft.trim()" @click="send()">
            {{ activeId ? "Send" : "Build" }}
          </button>
        </footer>
      </main>
    </div>

    <!-- How it works: describe → Claude writes an app → sandbox serves it live → edit loop -->
    <div v-if="showHelp" class="help-overlay" @click.self="showHelp = false">
      <div class="help-card">
        <button class="help-close" @click="showHelp = false" aria-label="Close">×</button>
        <h2 class="help-title">How it works</h2>
        <p class="help-lede">
          App Builder is a chat assistant that builds small web apps for you. Describe what you
          want — a counter, a notes board, a calculator — and it writes a complete app (an HTML
          page plus a JSON API) and gives you a URL where it runs live.
        </p>
        <p class="help-lede">
          That app is written by the model, so it is untrusted. Each one runs in a
          <strong>WebAssembly sandbox</strong>: isolated from the host — no filesystem, no
          network unless allowed — with its own scoped key-value store for state, and
          near-instant to start (milliseconds, no container cold-start), so serving a fresh app
          on every request stays cheap.
        </p>

        <div class="diagram">
          <svg viewBox="0 0 720 250" role="img" aria-label="You describe an app, Claude writes it, a private Wasm sandbox stores and serves it live at its own URL, and editing loops back to Claude.">
            <defs>
              <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#9aa0a8" />
              </marker>
              <marker id="ahb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#1d4ed8" />
              </marker>
            </defs>

            <!-- edit loop: the live app is re-published by Claude, in place -->
            <path d="M664 118 C 664 46, 251 46, 251 118" fill="none" stroke="#1d4ed8" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#ahb)" />
            <text x="457" y="38" text-anchor="middle" font-size="12.5" fill="#1d4ed8" font-weight="600">edit — updates in place, same URL</text>

            <!-- forward arrows -->
            <line x1="112" y1="150" x2="170" y2="150" stroke="#9aa0a8" stroke-width="1.6" marker-end="url(#ah)" />
            <text x="141" y="141" text-anchor="middle" font-size="11.5" fill="#8a8f98">describe</text>
            <line x1="326" y1="150" x2="384" y2="150" stroke="#9aa0a8" stroke-width="1.6" marker-end="url(#ah)" />
            <text x="355" y="141" text-anchor="middle" font-size="11.5" fill="#8a8f98">code</text>
            <line x1="560" y1="150" x2="618" y2="150" stroke="#9aa0a8" stroke-width="1.6" marker-end="url(#ah)" />
            <text x="592" y="141" text-anchor="middle" font-size="11.5" fill="#8a8f98">URL</text>

            <!-- nodes -->
            <rect x="16" y="120" width="96" height="60" rx="12" fill="#fff" stroke="#d7dbe0" />
            <text x="64" y="155" text-anchor="middle" font-size="14" fill="#1f2328" font-weight="600">You</text>

            <rect x="176" y="120" width="150" height="60" rx="12" fill="#eef4ff" stroke="#c7d7fe" />
            <text x="251" y="146" text-anchor="middle" font-size="13.5" fill="#1d4ed8" font-weight="700">Claude</text>
            <text x="251" y="165" text-anchor="middle" font-size="12" fill="#3b5bdb">writes an app</text>

            <rect x="390" y="120" width="170" height="60" rx="12" fill="#ecfdf5" stroke="#a7f3d0" />
            <text x="475" y="146" text-anchor="middle" font-size="13" fill="#047857" font-weight="700">Private Wasm sandbox</text>
            <text x="475" y="165" text-anchor="middle" font-size="12" fill="#059669">stores &amp; serves it</text>

            <rect x="624" y="120" width="80" height="60" rx="12" fill="#1f2328" />
            <text x="664" y="151" text-anchor="middle" font-size="12.5" fill="#fff" font-weight="600">Live app</text>
            <text x="664" y="167" text-anchor="middle" font-size="10.5" fill="#c9cdd2">/a/&lt;id&gt;/</text>

            <text x="475" y="200" text-anchor="middle" font-size="11" fill="#8a8f98">isolated · per-app KV · default-deny network</text>
          </svg>
        </div>

        <ol class="help-steps">
          <li><span class="n">1</span>
            <div><strong>You describe an app.</strong> Say what you want in the chat.</div>
          </li>
          <li><span class="n">2</span>
            <div><strong>Claude writes it.</strong> One self-contained HTTP handler — an HTML UI plus a JSON API — streamed in live as it is written.</div>
          </li>
          <li><span class="n">3</span>
            <div><strong>It runs at its own URL.</strong> The code is stored in the sandbox's KV and executed on demand at <code>/a/&lt;id&gt;/</code>, returning the app's response verbatim.</div>
          </li>
          <li><span class="n">4</span>
            <div><strong>Keep editing by chatting.</strong> Each change updates the same app in place — the URL never changes, and the source and conversation persist.</div>
          </li>
        </ol>

        <p class="help-why-title">Why run generated apps in a Wasm sandbox?</p>
        <ul class="help-why">
          <li><strong>Isolated</strong> — untrusted, model-written code can't reach the host: no filesystem, network default-deny.</li>
          <li><strong>Instant</strong> — millisecond cold starts (no container), so running a fresh app per request is cheap.</li>
        </ul>
        <p class="help-refs">
          Further reading:
          <a href="https://arxiv.org/pdf/2210.03629" target="_blank" rel="noopener">ReAct</a> (ICLR 2023) ·
          <a href="https://machinelearning.apple.com/research/codeact" target="_blank" rel="noopener">CodeAct</a> (Apple, 2024).
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from "vue";
import { diffLines } from "diff";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import "highlight.js/styles/github.css";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);

type AppMeta = { id: string; language: string; title?: string; createdAt: number };
type AppBar = { title: string; language: string; url: string };
type DiffLine = { t: "ctx" | "add" | "del"; text: string };
type Msg =
  | { t: "user"; text: string }
  | { t: "assistant"; text: string }
  | {
      t: "app";
      block: string;
      phase: "writing" | "saving" | "done";
      id: string;
      url: string;
      title: string;
      language: string;
      code: string;
      prevCode: string | null;
      diffLines: DiffLine[];
      view: "diff" | "code";
    };

const SUGGESTIONS = [
  "A click counter that remembers its count",
  "A shared notes board with add + delete",
  "A random-quote page that rerolls on click",
  "A tip calculator",
];

const apps = ref<AppMeta[]>([]);
const activeId = ref<string | null>(null); // null = building a new app
const activeMeta = ref<AppBar | null>(null);
const messages = ref<Msg[]>([]);
const history = ref<any[]>([]); // Anthropic message history for the active session
const draft = ref("");
const building = ref(false);
const error = ref("");
const scrollEl = ref<HTMLElement | null>(null);

// Persistent source view for the active app (loaded from the backend; survives navigation).
const activeCode = ref("");
const activeLang = ref("javascript");
const lastDiff = ref<DiffLine[] | null>(null); // diff of the most recent edit this session
const mainView = ref<"chat" | "code">("chat");
const codeView = ref<"code" | "diff">("code");
const showHelp = ref(false); // "How it works" modal

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
function highlight(code: string, lang: string): string {
  const language = lang === "python" ? "python" : "javascript";
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}
function shortLang(lang: string): string {
  return lang === "python" ? "PY" : "JS";
}

// The live app card for a streaming tool block (so deltas update it in place).
function findApp(block: string): any {
  return messages.value.find((m) => m.t === "app" && (m as any).block === block);
}
// Last lines of the streaming code — the writing edge, without an unbounded live card.
function tail(code: string): string {
  const lines = code.split("\n");
  return lines.length > 26 ? lines.slice(-26).join("\n") : code;
}

// Line-level diff via jsdiff — renders the whole file with +/- so you see the code AND the
// change. (jsdiff is the same engine @pierre/diffs uses, minus the React/Shiki weight.)
function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const out: DiffLine[] = [];
  for (const part of diffLines(oldStr, newStr)) {
    const t: DiffLine["t"] = part.added ? "add" : part.removed ? "del" : "ctx";
    const lines = part.value.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop(); // drop trailing "" from the split
    for (const text of lines) out.push({ t, text });
  }
  return out;
}

function upsertApp(m: AppMeta) {
  const i = apps.value.findIndex((a) => a.id === m.id);
  if (i >= 0) apps.value[i] = m;
  else apps.value.unshift(m);
}

// Conversation persistence: store the display transcript minus derived fields (diffLines/view
// are recomputed from prevCode on load), plus the model history.
function serializeMsgs(msgs: Msg[]): any[] {
  return msgs.map((m) =>
    m.t === "app"
      ? { t: "app", id: m.id, url: m.url, title: m.title, language: m.language, code: m.code, prevCode: m.prevCode }
      : m,
  );
}
function deserializeMsgs(raw: any[]): Msg[] {
  return (raw ?? []).map((m: any) => {
    if (m && m.t === "app") {
      const prev = typeof m.prevCode === "string" ? m.prevCode : null;
      return {
        t: "app",
        block: "",
        phase: "done",
        id: m.id,
        url: m.url,
        title: m.title,
        language: m.language,
        code: m.code,
        prevCode: prev,
        diffLines: prev !== null ? lineDiff(prev, m.code) : [],
        view: prev !== null ? "diff" : "code",
      } as Msg;
    }
    return { t: m.t, text: m.text } as Msg;
  });
}
// Persist the active app's conversation so it survives navigation and reloads.
async function saveConvo() {
  const id = activeId.value;
  if (!id) return;
  try {
    await fetch(`/api/apps/${id}/convo`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: serializeMsgs(messages.value), history: history.value }),
    });
  } catch {
    // best-effort — the in-memory conversation still works
  }
}

async function toBottom() {
  await nextTick();
  scrollEl.value?.scrollTo({ top: scrollEl.value.scrollHeight, behavior: "smooth" });
}

async function loadApps() {
  try {
    const r = await fetch("/api/apps");
    if (r.ok) apps.value = ((await r.json()) as AppMeta[]).slice().reverse(); // newest first
  } catch {
    // gallery stays empty
  }
}

// ---- access-token gate ----
const gate = ref<"checking" | "locked" | "open">("checking");
const token = ref("");
const gateBusy = ref(false);
const gateError = ref("");

async function checkAuth() {
  try {
    const d = await (await fetch("/api/health")).json();
    gate.value = !d.authRequired || d.authed ? "open" : "locked";
  } catch {
    gate.value = "open"; // health unreachable — don't hard-lock local dev
  }
  if (gate.value === "open") loadApps();
}
async function submitToken() {
  const t = token.value.trim();
  if (!t || gateBusy.value) return;
  gateBusy.value = true;
  gateError.value = "";
  try {
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: t }),
    });
    if (r.ok) {
      gate.value = "open";
      loadApps();
    } else {
      gateError.value = "Invalid access token";
    }
  } catch {
    gateError.value = "Could not verify — try again";
  } finally {
    gateBusy.value = false;
  }
}
checkAuth();

function newApp() {
  activeId.value = null;
  activeMeta.value = null;
  messages.value = [];
  history.value = [];
  draft.value = "";
  error.value = "";
  activeCode.value = "";
  lastDiff.value = null;
  mainView.value = "chat";
}

// Open an existing app — load its source AND its saved conversation, so both the chat and the
// Code view are restored (they survive navigating away and reloads).
async function openEdit(a: AppMeta) {
  activeId.value = a.id;
  activeMeta.value = { title: a.title || a.id, language: a.language, url: `/a/${a.id}/` };
  messages.value = [];
  history.value = [];
  draft.value = "";
  error.value = "";
  activeCode.value = "";
  activeLang.value = a.language;
  lastDiff.value = null;
  codeView.value = "code";
  mainView.value = "chat"; // default to the conversation
  try {
    const r = await fetch(`/api/apps/${a.id}`);
    if (activeId.value !== a.id) return; // user switched apps while this was loading
    if (r.ok) {
      const rec = await r.json();
      activeCode.value = rec.code ?? "";
      activeLang.value = rec.language ?? a.language;
      const convo = rec.convo ?? { messages: [], history: [] };
      messages.value = deserializeMsgs(convo.messages);
      history.value = Array.isArray(convo.history) ? convo.history : [];
    }
  } catch {
    // leave it empty; the chat still works
  }
  if (!messages.value.length) {
    messages.value = [{ t: "assistant", text: `Editing “${a.title || a.id}”. Tell me what to change.` }];
  }
}

async function send(text?: string) {
  const p = (text ?? draft.value).trim();
  if (!p || building.value) return;
  draft.value = "";
  error.value = "";
  building.value = true;
  mainView.value = "chat"; // follow the streaming turn
  messages.value.push({ t: "user", text: p });
  let live: { t: "assistant"; text: string } | null = null;
  await toBottom();

  try {
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: p, id: activeId.value ?? undefined, history: history.value }),
    });
    if (!resp.ok || !resp.body) {
      const d = await resp.json().catch(() => ({}));
      throw new Error(d?.error || `request failed (${resp.status})`);
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.t === "text_delta") {
          if (!live) {
            live = reactive({ t: "assistant", text: "" }) as { t: "assistant"; text: string };
            messages.value.push(live);
          }
          live.text += ev.text;
        } else if (ev.t === "tool_start") {
          live = null; // any streaming text block is done
          messages.value.push({
            t: "app",
            block: ev.block,
            phase: "writing",
            id: "",
            url: "",
            title: "",
            language: "",
            code: "",
            prevCode: null,
            diffLines: [],
            view: "code",
          });
        } else if (ev.t === "tool_delta") {
          const m = findApp(ev.block);
          if (m) {
            m.code = ev.code; // the streaming tail
            if (ev.language) m.language = ev.language;
            if (ev.title) m.title = ev.title;
          }
        } else if (ev.t === "tool_saving") {
          const m = findApp(ev.block);
          if (m) m.phase = "saving";
        } else if (ev.t === "app_saved") {
          live = null;
          const prev = typeof ev.prevCode === "string" ? ev.prevCode : null;
          const dl = prev !== null ? lineDiff(prev, ev.code) : [];
          let m = findApp(ev.block);
          if (!m) {
            messages.value.push({ t: "app", block: ev.block, phase: "done", id: "", url: "", title: "", language: "", code: "", prevCode: null, diffLines: [], view: "code" });
            m = findApp(ev.block); // the reactive proxy
          }
          m.phase = "done";
          m.id = ev.id;
          m.url = ev.url;
          m.title = ev.title;
          m.language = ev.language;
          m.code = ev.code; // the full final source
          m.prevCode = prev;
          m.diffLines = dl;
          m.view = prev !== null ? "diff" : "code"; // an edit defaults to the change view
          activeId.value = ev.id; // a new app becomes the active edit target
          activeMeta.value = { title: ev.title, language: ev.language, url: ev.url };
          activeCode.value = ev.code; // keep the persistent source view current
          activeLang.value = ev.language;
          lastDiff.value = prev !== null ? dl : null;
          if (prev !== null) codeView.value = "diff";
          upsertApp({ id: ev.id, language: ev.language, title: ev.title, createdAt: Date.now() });
        } else if (ev.t === "done") {
          if (Array.isArray(ev.messages)) history.value = ev.messages;
          saveConvo(); // persist the updated conversation (fire-and-forget)
        } else if (ev.t === "error") {
          error.value = ev.error;
        }
        await toBottom();
      }
    }
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    building.value = false;
    await toBottom();
  }
}
</script>

<style>
* { box-sizing: border-box; }
html, body, #__nuxt { height: 100%; margin: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1f2328; background: #fafafa; }
.app { display: flex; flex-direction: column; height: 100vh; }

.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 22px; border-bottom: 1px solid #ececec; background: #fff; }
.ghost { background: #fff; border: 1px solid #e2e2e2; border-radius: 8px; padding: 7px 14px; font-size: 14px; cursor: pointer; white-space: nowrap; }
.ghost:hover { background: #f6f6f6; }
.brand { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.logo { font-weight: 700; font-size: 18px; }
.tag { color: #8a8f98; font-size: 14px; }

.body { flex: 1; display: flex; min-height: 0; }

.sidebar { width: 248px; flex: 0 0 248px; border-right: 1px solid #ececec; background: #fff; padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.newbtn { text-align: left; background: #1f2328; color: #fff; border: none; border-radius: 10px; padding: 10px 12px; font-size: 14px; cursor: pointer; }
.newbtn.active { background: #1d4ed8; }
.applist { display: flex; flex-direction: column; gap: 4px; }
.applink { display: flex; align-items: center; gap: 8px; text-align: left; background: transparent; border: none; border-radius: 8px; padding: 9px 10px; font-size: 14px; cursor: pointer; color: #2a2f36; }
.applink:hover { background: #f4f5f7; }
.applink.active { background: #eef4ff; }
.applink-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-empty { color: #9aa0a8; font-size: 13px; padding: 6px 10px; }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.appbar { display: flex; align-items: center; gap: 10px; padding: 12px 22px; border-bottom: 1px solid #f0f0f0; background: #fbfbfb; }
.appbar-title { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.segtoggle { display: inline-flex; margin-left: auto; border: 1px solid #e2e2e2; border-radius: 8px; overflow: hidden; }
.segtoggle button { border: none; background: #fff; padding: 6px 14px; font-size: 13px; cursor: pointer; color: #6b7280; }
.segtoggle button.on { background: #1f2328; color: #fff; font-weight: 600; }
.open { margin-left: auto; background: #1d4ed8; color: #fff; text-decoration: none; padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.appbar .open { margin-left: 10px; }
.codepane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.codepane-bar { padding: 8px 14px; border-bottom: 1px solid #f0f0f0; background: #fbfbfb; }
.codepane-empty { padding: 24px; color: #9aa0a8; }

.transcript { flex: 1; overflow-y: auto; padding: 22px; display: flex; flex-direction: column; gap: 14px; }
.welcome { max-width: 560px; margin: 6vh auto 0; text-align: center; }
.welcome h2 { font-weight: 600; color: #3a3f45; margin: 0 0 8px; }
.welcome-sub { color: #8a8f98; font-size: 14px; margin: 0 0 24px; }
.suggestions { display: flex; flex-direction: column; gap: 10px; }
.chip { background: #fff; border: 1px solid #e7e7e7; border-radius: 12px; padding: 13px 16px; font-size: 14.5px; cursor: pointer; text-align: left; }
.chip:hover { border-color: #cfcfcf; }

.user { align-self: flex-end; background: #1f2328; color: #fff; padding: 10px 14px; border-radius: 14px 14px 4px 14px; max-width: 80%; white-space: pre-wrap; }
.assistant { line-height: 1.55; white-space: pre-wrap; max-width: 92%; }
.thinking { color: #8a8f98; }
.err { color: #b42318; }

.appcard { border: 1px solid #e7e7e7; border-radius: 12px; background: #fff; overflow: hidden; }
.appcard-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #f0f0f0; flex-wrap: wrap; }
.appcard-title { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.viewtoggle { display: inline-flex; margin-left: auto; border: 1px solid #e2e2e2; border-radius: 8px; overflow: hidden; }
.viewtoggle button { border: none; background: #fff; padding: 5px 11px; font-size: 12.5px; cursor: pointer; color: #6b7280; }
.viewtoggle button.on { background: #eef4ff; color: #1d4ed8; font-weight: 600; }
.code { margin: 0; padding: 14px; background: #f8fafc; max-height: 400px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.5; }
.code code.hljs { background: transparent; padding: 0; }
.diff { margin: 0; max-height: 400px; overflow: auto; background: #f8fafc; padding: 6px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.5; }
.dl { display: block; white-space: pre; padding: 0 14px; }
.dl .dm { display: inline-block; width: 1.2ch; color: #9aa0a8; user-select: none; }
.dl.ctx { color: #57606a; }
.dl.add { background: #e6ffec; }
.dl.del { background: #ffebe9; }
.dl.add .dm { color: #1a7f37; }
.dl.del .dm { color: #cf222e; }
/* the code/diff filling the persistent Code pane (override the card's max-height cap) */
.code-fill, .diff-fill { flex: 1; min-height: 0; max-height: none; }

.composer { display: flex; gap: 10px; align-items: flex-end; padding: 14px 22px; border-top: 1px solid #ececec; background: #fff; }
.composer textarea { flex: 1; resize: none; border: 1px solid #e2e2e2; border-radius: 12px; padding: 11px 14px; font: inherit; font-size: 15px; max-height: 200px; }
.composer textarea:focus { outline: none; border-color: #b9c0c8; }
.primary { background: #1f2328; color: #fff; border: none; border-radius: 12px; padding: 11px 20px; font-size: 15px; cursor: pointer; }
.primary:disabled { background: #c9cdd2; cursor: not-allowed; }

.badge { font-size: 11.5px; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
.badge.javascript { background: #fef9c3; color: #854d0e; }
.badge.python { background: #dbeafe; color: #1e40af; }
.badge.pending { background: #eef0f3; color: #6b7280; }

/* live "writing the app…" card */
.appcard.live { border-color: #c7d7fe; }
.pulse { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: #1d4ed8; animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } }
.code-live { color: #334155; }
.code-live code { white-space: pre; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

/* How it works modal */
.help-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(20,22,26,0.45); display: flex; align-items: flex-start; justify-content: center; padding: 5vh 16px; overflow-y: auto; }
.help-card { position: relative; width: 100%; max-width: 720px; background: #fff; border-radius: 16px; padding: 28px 30px 30px; box-shadow: 0 14px 44px rgba(0,0,0,0.2); }
.help-close { position: absolute; top: 12px; right: 14px; border: none; background: transparent; font-size: 26px; line-height: 1; color: #8a8f98; cursor: pointer; }
.help-close:hover { color: #1f2328; }
.help-title { margin: 0 0 10px; font-size: 22px; font-weight: 700; }
.help-lede { margin: 0 0 20px; color: #3a3f45; line-height: 1.6; font-size: 15px; }
.diagram { background: #fbfcfe; border: 1px solid #eef0f3; border-radius: 12px; padding: 14px 10px 6px; margin-bottom: 22px; }
.diagram svg { display: block; width: 100%; height: auto; }
.help-steps { list-style: none; margin: 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.help-steps li { display: flex; gap: 12px; align-items: flex-start; font-size: 14.5px; line-height: 1.55; color: #2a2f36; }
.help-steps .n { flex: 0 0 auto; width: 24px; height: 24px; margin-top: 1px; border-radius: 999px; background: #eef4ff; color: #1d4ed8; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.help-card code { background: #f1f2f4; padding: 1px 5px; border-radius: 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; }
.help-why-title { margin: 0 0 10px; font-size: 14px; font-weight: 650; color: #2a2f36; }
.help-why { margin: 0 0 18px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.help-why li { position: relative; padding-left: 18px; font-size: 14px; line-height: 1.5; color: #2a2f36; }
.help-why li::before { content: "→"; position: absolute; left: 0; color: #1d4ed8; }
.help-refs { margin: 14px 0 0; font-size: 12.5px; color: #8a8f98; }
.help-refs a { color: #1d4ed8; text-decoration: none; }
.help-refs a:hover { text-decoration: underline; }

/* access-token gate */
.gate { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f4f4f5; padding: 20px; }
.gate-card { width: 100%; max-width: 540px; background: #fff; border-radius: 16px; padding: 44px 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 10px 34px rgba(0,0,0,0.05); text-align: center; }
.gate-title { margin: 0 0 10px; font-size: 28px; font-weight: 800; color: #1f2328; }
.gate-sub { margin: 0 0 26px; color: #6b7280; font-size: 16px; }
.gate-input { width: 100%; border: 1px solid #e2e2e2; border-radius: 10px; padding: 13px 15px; font-size: 15px; margin-bottom: 14px; }
.gate-input:focus { outline: none; border-color: #b9c0c8; }
.gate-btn { width: 100%; border: none; border-radius: 10px; padding: 13px; font-size: 15px; font-weight: 700; color: #fff; background: #1f2328; cursor: pointer; }
.gate-btn:disabled { background: #8a8f98; cursor: not-allowed; }
.gate-err { margin: 14px 0 0; color: #b42318; font-size: 14px; }
</style>
