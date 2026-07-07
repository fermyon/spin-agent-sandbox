// Running the transpiled user code and interpreting its result.

// AsyncFunction constructor — user code is compiled into one so top-level `await` works.
export const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as any;

export type UserHandler = (request: Request) => unknown;

// Detect a handler-shape export: `export default { fetch }` or `export default function`.
// Returns null for the main (print) shape.
export function detectHandler(moduleExports: any): UserHandler | null {
  const def = moduleExports && moduleExports.default;
  if (def && typeof def.fetch === "function") return def.fetch.bind(def);
  if (typeof def === "function") return def as UserHandler;
  return null;
}

// Coerce a handler's return value into a Response (handlers usually return one directly).
export function coerceUserResponse(userResp: any): Response {
  if (userResp instanceof Response) return userResp;
  if (typeof userResp === "string") return new Response(userResp);
  return Response.json(userResp ?? null);
}
