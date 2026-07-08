// @spinframework/sandbox — an extensible client for sandboxed code execution,
// consumed from a Spin application.
//
// Author a tool against `CodeRunner` (from "@spinframework/sandbox/core") and it
// runs unchanged on any backend; the host injects the concrete client:
//
//   import { Interpreter } from "@spinframework/sandbox/interpreter";
//   const runner = new Interpreter({ baseUrl: "http://wasm.spin.internal" });
//
// Only the Wasm code interpreter backend ships today. The library is built to be
// EXTENDED: a container or microVM backend is a new module that implements
// `CodeRunner` (and declares itself through `Caps`) — add it as `./container`
// (or `./microvm`) and export it below. Nothing in `core` is interpreter-specific.

export * from "./core/index.ts";
export { Interpreter, InterpreterKV, type InterpreterOptions } from "./interpreter/index.ts";

// Future backends plug in here, e.g.:
//   export { Container, type ContainerOptions } from "./container/index.ts";
