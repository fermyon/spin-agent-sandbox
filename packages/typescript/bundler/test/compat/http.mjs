// Retry transport failures, preserving every attempt in the compatibility report.
// A response from either component is a test result, including HTTP errors.
export async function postJson(url, body, {
  timeoutMs = 45000,
  tries = 3,
  fetchImpl = globalThis.fetch,
  retryDelayMs = 500,
  waitImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  onRetry,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    throw new Error("timeoutMs must be a positive integer within the timer range");
  }
  if (!Number.isInteger(tries) || tries < 1 || tries > 3) {
    throw new Error("tries must be an integer from 1 to 3");
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new Error("retryDelayMs must be non-negative");
  }
  const encodedBody = JSON.stringify(body);
  const attempts = [];
  let netError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    let response;
    const startedAt = performance.now();
    const timer = setTimeoutImpl(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: encodedBody,
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      // Keep the deadline active while the response body is being read.
      const payload = isJson ? await response.json() : await response.text();
      attempts.push({ attempt, timeoutMs, ms: elapsed(startedAt), outcome: "response", status: response.status });
      return { status: response.status, isJson, contentType, payload, attempts };
    } catch (error) {
      netError = timedOut ? `Request timed out after ${timeoutMs}ms` : String(error?.message || error);
      // Invalid JSON is a received but unusable response, not a transient
      // transport failure. Preserve it and let the gate reject the missing result.
      const invalidResponse = !timedOut && response && error instanceof SyntaxError;
      if (invalidResponse) netError = `Invalid JSON response: ${netError}`;
      attempts.push({
        attempt, timeoutMs, ms: elapsed(startedAt),
        outcome: timedOut ? "timeout" : invalidResponse ? "response" : "network_error",
        ...(response ? { status: response.status } : {}),
        detail: netError,
      });
      if (invalidResponse) return { netError, attempts };
    } finally {
      clearTimeoutImpl(timer);
    }
    if (attempt < tries) {
      const delayMs = retryDelayMs * attempt;
      onRetry?.({ ...attempts.at(-1), nextAttempt: attempt + 1, delayMs });
      await waitImpl(delayMs);
    }
  }
  return { netError, attempts };
}

const elapsed = (startedAt) => Math.round(performance.now() - startedAt);
