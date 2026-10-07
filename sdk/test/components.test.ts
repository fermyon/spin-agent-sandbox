import assert from "node:assert/strict";
import { test } from "node:test";

import { Interpreter } from "../src/interpreter/index.ts";

const baseUrl = process.env.SANDBOX_BASE_URL;

if (!baseUrl) {
  test("component integration tests require SANDBOX_BASE_URL", { skip: true }, () => {});
} else {
  test("language-bound clients execute code against the sandbox components", async () => {
    const python = Interpreter.python({ baseUrl });
    const javascript = Interpreter.javascript({ baseUrl });

    assert.equal((await python.execute("print(6 * 7)")).stdout, "42\n");
    assert.equal((await javascript.execute("console.log(6 * 7)")).stdout, "42\n");
    assert.deepEqual(python.capabilities().languages, ["python"]);
    assert.deepEqual(javascript.capabilities().languages, ["javascript"]);
  });

  test("runHandler returns streamed Python handler responses", async () => {
    const python = Interpreter.python({ baseUrl });
    const response = await python.runHandler(
      `def handle_request(request):
    def chunks():
        yield "first-"
        yield b"second"
    return (201, {"content-type": "text/plain"}, chunks())`,
      { path: "/stream" },
    );

    assert.equal(response.status, 201);
    assert.equal(await response.text(), "first-second");
  });

  test("scoped KV persists within an SDK namespace", async () => {
    const namespace = `sdk-component-${Date.now()}`;
    const kv = Interpreter.javascript({ baseUrl }).kv(namespace);

    await kv.setJson("answer", 42);
    assert.equal(await kv.getJson<number>("answer"), 42);
    await kv.delete("answer");
    assert.equal(await kv.getJson<number>("answer"), null);
  });
}