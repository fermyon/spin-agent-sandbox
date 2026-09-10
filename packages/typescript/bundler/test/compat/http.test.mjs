import { test } from "node:test";
import assert from "node:assert/strict";
import { postJson } from "./http.mjs";

const url = "http://compat.test/bundle";
const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { "content-type": "application/json" },
});
const untilAborted = (signal) => new Promise((resolve, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});

test("a timed out request is aborted and its successful retry retains both attempts", async () => {
  let calls = 0;
  let aborted = false;
  const retries = [];
  const result = await postJson(url, { source: "hello" }, {
    timeoutMs: 10,
    retryDelayMs: 0,
    onRetry: (retry) => retries.push(retry),
    fetchImpl: async (requestedUrl, options) => {
      assert.equal(requestedUrl, url);
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { source: "hello" });
      if (++calls === 1) {
        try { await untilAborted(options.signal); }
        finally { aborted = options.signal.aborted; }
      }
      return jsonResponse({ blob: "ok" });
    },
  });
  assert.equal(aborted, true);
  assert.deepEqual(result.payload, { blob: "ok" });
  assert.equal(result.status, 200);
  assert.equal(result.isJson, true);
  assert.equal(result.contentType, "application/json");
  assert.deepEqual(result.attempts.map(({ attempt, timeoutMs, outcome }) => ({ attempt, timeoutMs, outcome })), [
    { attempt: 1, timeoutMs: 10, outcome: "timeout" },
    { attempt: 2, timeoutMs: 10, outcome: "response" },
  ]);
  assert.match(result.attempts[0].detail, /timed out after 10ms/);
  assert.ok(result.attempts.every((attempt) => Number.isInteger(attempt.ms) && attempt.ms >= 0));
  assert.equal(retries.length, 1);
  assert.equal(retries[0].nextAttempt, 2);
});

test("transport failure exhausts three attempts and retains failure details and bounded backoff", async () => {
  const waits = [];
  let calls = 0;
  const result = await postJson(url, {}, {
    timeoutMs: 100,
    fetchImpl: async () => { calls++; throw new TypeError("connection reset"); },
    waitImpl: async (ms) => waits.push(ms),
  });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [500, 1000]);
  assert.equal(result.netError, "connection reset");
  assert.deepEqual(result.attempts.map(({ attempt, timeoutMs, outcome, detail }) => ({ attempt, timeoutMs, outcome, detail })),
    [1, 2, 3].map((attempt) => ({ attempt, timeoutMs: 100, outcome: "network_error", detail: "connection reset" })));
});

test("a delayed response body can complete inside the larger bundle budget", async () => {
  const result = await postJson(url, {}, {
    timeoutMs: 1000,
    fetchImpl: async (_url, { signal }) => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        assert.equal(signal.aborted, false);
        return { blob: "large graph" };
      },
    }),
  });
  assert.deepEqual(result.payload, { blob: "large graph" });
  assert.equal(result.attempts.length, 1);
});

test("the deadline covers a response body that stalls after headers arrive", async () => {
  let calls = 0;
  const result = await postJson(url, {}, {
    timeoutMs: 10,
    tries: 2,
    retryDelayMs: 0,
    fetchImpl: async (_url, { signal }) => {
      calls++;
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => untilAborted(signal),
      };
    },
  });
  assert.equal(calls, 2);
  assert.match(result.netError, /timed out after 10ms/);
  assert.deepEqual(result.attempts.map(({ outcome, status }) => ({ outcome, status })), [
    { outcome: "timeout", status: 200 }, { outcome: "timeout", status: 200 },
  ]);
});

test("compile, runtime and bundle error responses are returned without retry", async () => {
  for (const [status, error] of [[400, "compile_error"], [200, "runtime_error"], [500, "bundle_error"]]) {
    let calls = 0;
    const payload = { error, message: "deterministic incompatibility" };
    const result = await postJson(url, {}, {
      fetchImpl: async () => { calls++; return jsonResponse(payload, status); },
      waitImpl: async () => assert.fail("must not wait for retry"),
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.payload, payload);
    assert.equal(result.attempts[0].status, status);
    assert.equal(result.attempts[0].outcome, "response");
  }
});

test("plain HTTP failures are also returned once for compatibility classification", async () => {
  const result = await postJson(url, {}, {
    fetchImpl: async () => new Response("component trapped", { status: 500 }),
    waitImpl: async () => assert.fail("must not retry a received HTTP response"),
  });
  assert.equal(result.isJson, false);
  assert.equal(result.payload, "component trapped");
  assert.equal(result.attempts.length, 1);
});

test("malformed JSON is preserved as unusable response data without retry", async () => {
  let calls = 0;
  const result = await postJson(url, {}, {
    fetchImpl: async () => {
      calls++;
      return new Response("invalid json", { headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(calls, 1);
  assert.match(result.netError, /Invalid JSON response/);
  assert.equal(result.attempts[0].outcome, "response");
  assert.equal(result.attempts[0].status, 200);
});

test("every request timer is cleared before retry backoff and after success or exhaustion", async () => {
  for (const succeed of [true, false]) {
    const activeTimers = new Set();
    let scheduled = 0;
    let cleared = 0;
    let calls = 0;
    const result = await postJson(url, {}, {
      setTimeoutImpl: () => { const timer = ++scheduled; activeTimers.add(timer); return timer; },
      clearTimeoutImpl: (timer) => { assert.equal(activeTimers.delete(timer), true); cleared++; },
      waitImpl: async () => assert.equal(activeTimers.size, 0),
      onRetry: () => assert.equal(activeTimers.size, 0),
      fetchImpl: async () => {
        if (++calls < 3 || !succeed) throw new TypeError("connection reset");
        return jsonResponse({ blob: "ok" });
      },
    });
    assert.equal(result.attempts.length, 3);
    assert.equal(scheduled, 3);
    assert.equal(cleared, 3);
    assert.equal(activeTimers.size, 0);
  }
});

test("invalid request budgets cannot create unbounded attempts or invalid timers", async () => {
  for (const options of [{ tries: 0 }, { tries: 4 }, { timeoutMs: 0 }, { timeoutMs: Infinity },
    { timeoutMs: 2147483648 }, { retryDelayMs: -1 }]) {
    await assert.rejects(postJson(url, {}, { ...options, fetchImpl: () => assert.fail("must reject before requesting") }));
  }
});
