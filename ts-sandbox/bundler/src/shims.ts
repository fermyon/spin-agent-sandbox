// Curated, hand-written CJS shims for common Node builtins.
//
// esm.sh serves its own Node polyfills (from `unenv`) at /node/<name>.mjs, but those are
// heavily minified and sucrase mis-transpiles some of them. We substitute these clean,
// sucrase-safe shims instead. Anything we don't cover falls back to a generic stub that
// compiles fine and only throws if actually used at runtime — so bundling never breaks.
//
// IMPORTANT: these strings are embedded verbatim into the output blob, which is parsed
// again by the sandbox. They MUST NOT contain backslashes, regex literals, or `${` — hence
// String.fromCharCode(10) instead of a newline escape, string ops instead of regex, etc.

const SHIMS: Record<string, string> = {
  process: `var p = {
  env: { NODE_ENV: "production" },
  platform: "wasi", arch: "wasm32",
  version: "v18.0.0", versions: { node: "18.0.0" },
  argv: ["node", "sandbox"], execPath: "/node", pid: 1, ppid: 0,
  cwd: function(){ return "/"; }, chdir: function(){},
  nextTick: function(f){ var a = Array.prototype.slice.call(arguments, 1); Promise.resolve().then(function(){ f.apply(null, a); }); },
  hrtime: function(){ return [0, 0]; },
  on: function(){ return p; }, once: function(){ return p; }, off: function(){ return p; },
  addListener: function(){ return p; }, removeListener: function(){ return p; },
  emit: function(){ return false; }, exit: function(){}, kill: function(){},
  stdout: { write: function(){ return true; } }, stderr: { write: function(){ return true; } },
  title: "sandbox", browser: true
};
module.exports = p;
module.exports.default = p;`,

  buffer: `var __enc = new TextEncoder();
var __dec = new TextDecoder();
// hex/base64 delegate to the engine's native Uint8Array methods (SpiderMonkey ships the TC39
// Uint8Array.{to,from}Hex / {to,from}Base64 proposal); we only add the Node Buffer API surface.
function __toBytes(v, enc){
  if (v == null) return new Uint8Array(0);
  if (typeof v === "number") return new Uint8Array(v);
  if (typeof v === "string"){
    enc = (enc || "utf8").toLowerCase();
    if (enc === "hex") return Uint8Array.fromHex(v);
    if (enc === "base64") return Uint8Array.fromBase64(v);
    if (enc === "base64url") return Uint8Array.fromBase64(v, { alphabet: "base64url" });
    if (enc === "latin1" || enc === "binary" || enc === "ascii"){ var u = new Uint8Array(v.length); for (var i = 0; i < v.length; i++) u[i] = v.charCodeAt(i) & 255; return u; }
    return __enc.encode(v);
  }
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return new Uint8Array(v);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (v && v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength);
  return new Uint8Array(0);
}
class Buf extends Uint8Array {
  toString(enc, start, end){
    var u = (start || end != null) ? this.subarray(start || 0, end == null ? this.length : end) : this;
    enc = (enc || "utf8").toLowerCase();
    if (enc === "hex") return u.toHex();
    if (enc === "base64") return u.toBase64();
    if (enc === "base64url"){ var b = u.toBase64({ alphabet: "base64url" }); var p = b.indexOf("="); return p < 0 ? b : b.slice(0, p); }
    if (enc === "latin1" || enc === "binary" || enc === "ascii"){ var s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i] & 255); return s; }
    return __dec.decode(u);
  }
  copy(target, ts, ss, se){ ts = ts || 0; ss = ss || 0; se = se == null ? this.length : se; var n = 0; for (var i = ss; i < se && (ts + n) < target.length; i++){ target[ts + n] = this[i]; n++; } return n; }
  equals(o){ if (!o || o.length !== this.length) return false; for (var i = 0; i < this.length; i++) if (this[i] !== o[i]) return false; return true; }
  slice(a, b){ return __mk(this.subarray(a, b)); }
  write(str, off){ off = off || 0; var b = __toBytes(str, "utf8"); var n = 0; for (var i = 0; i < b.length && (off + n) < this.length; i++){ this[off + n] = b[i]; n++; } return n; }
  readUInt8(o){ return this[o]; }
  writeUInt8(v, o){ this[o] = v & 255; return o + 1; }
  readUInt16BE(o){ return (this[o] << 8) | this[o + 1]; }
  readUInt16LE(o){ return this[o] | (this[o + 1] << 8); }
  readUInt32BE(o){ return (this[o] * 16777216) + (this[o + 1] << 16) + (this[o + 2] << 8) + this[o + 3]; }
  readUInt32LE(o){ return this[o] + (this[o + 1] << 8) + (this[o + 2] << 16) + (this[o + 3] * 16777216); }
  writeUInt32BE(v, o){ this[o] = (v >>> 24) & 255; this[o + 1] = (v >>> 16) & 255; this[o + 2] = (v >>> 8) & 255; this[o + 3] = v & 255; return o + 4; }
}
function __mk(u){ var b = new Buf(u.length); b.set(u); return b; }
var Buffer = {
  from: function(v, enc){ return __mk(__toBytes(v, enc)); },
  of: function(){ return __mk(new Uint8Array(Array.prototype.slice.call(arguments))); },
  alloc: function(n, fill){ var b = new Buf(n); if (fill != null){ var f = typeof fill === "number" ? fill : __toBytes(fill)[0]; for (var i = 0; i < n; i++) b[i] = f; } return b; },
  allocUnsafe: function(n){ return new Buf(n); },
  isBuffer: function(b){ return b instanceof Uint8Array; },
  isEncoding: function(e){ e = String(e).toLowerCase(); return e === "utf8" || e === "utf-8" || e === "hex" || e === "base64" || e === "base64url" || e === "latin1" || e === "binary" || e === "ascii"; },
  byteLength: function(s, enc){ return typeof s === "string" ? __toBytes(s, enc).length : (s ? s.length : 0); },
  compare: function(a, b){ var n = Math.min(a.length, b.length); for (var i = 0; i < n; i++){ if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; } return a.length === b.length ? 0 : (a.length < b.length ? -1 : 1); },
  concat: function(list, total){
    var len = 0, i;
    if (total == null){ for (i = 0; i < list.length; i++) len += list[i].length; } else { len = total; }
    var out = new Buf(len), off = 0;
    for (i = 0; i < list.length; i++){ var s = list[i]; for (var j = 0; j < s.length && off < len; j++){ out[off++] = s[j]; } }
    return out;
  }
};
Buffer.Buffer = Buffer;
module.exports = { Buffer: Buffer };
module.exports.Buffer = Buffer;
module.exports.default = { Buffer: Buffer };`,

  events: `function EventEmitter(){ this._e = Object.create(null); }
EventEmitter.prototype.on = function(t, f){ (this._e[t] || (this._e[t] = [])).push(f); return this; };
EventEmitter.prototype.addListener = EventEmitter.prototype.on;
EventEmitter.prototype.prependListener = EventEmitter.prototype.on;
EventEmitter.prototype.once = function(t, f){ var self = this; function g(){ self.off(t, g); f.apply(null, arguments); } return this.on(t, g); };
EventEmitter.prototype.off = function(t, f){ var l = this._e[t]; if (l){ var i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } return this; };
EventEmitter.prototype.removeListener = EventEmitter.prototype.off;
EventEmitter.prototype.removeAllListeners = function(t){ if (t) delete this._e[t]; else this._e = Object.create(null); return this; };
EventEmitter.prototype.emit = function(t){ var l = this._e[t]; if (!l || !l.length) return false; var a = Array.prototype.slice.call(arguments, 1); var c = l.slice(); for (var i = 0; i < c.length; i++) c[i].apply(null, a); return true; };
EventEmitter.prototype.listeners = function(t){ return (this._e[t] || []).slice(); };
EventEmitter.prototype.listenerCount = function(t){ return (this._e[t] || []).length; };
EventEmitter.prototype.setMaxListeners = function(){ return this; };
EventEmitter.prototype.getMaxListeners = function(){ return 10; };
EventEmitter.defaultMaxListeners = 10;
EventEmitter.EventEmitter = EventEmitter;
module.exports = EventEmitter;
module.exports.default = EventEmitter;`,

  util: `function inherits(ctor, superCtor){ ctor.super_ = superCtor; ctor.prototype = Object.create(superCtor.prototype, { constructor: { value: ctor, enumerable: false, writable: true, configurable: true } }); }
function inspect(x){ try { return JSON.stringify(x); } catch (e) { return String(x); } }
function format(){ var a = Array.prototype.slice.call(arguments); return a.map(function(x){ return typeof x === "string" ? x : inspect(x); }).join(" "); }
function promisify(fn){ return function(){ var args = Array.prototype.slice.call(arguments); var self = this; return new Promise(function(res, rej){ args.push(function(err, val){ if (err) rej(err); else res(val); }); fn.apply(self, args); }); }; }
var util = { inherits: inherits, inspect: inspect, format: format, promisify: promisify, deprecate: function(fn){ return fn; }, isArray: Array.isArray, isBuffer: function(b){ return b instanceof Uint8Array; }, isDate: function(x){ return x instanceof Date; }, types: { isDate: function(x){ return x instanceof Date; }, isRegExp: function(x){ return x instanceof RegExp; } }, TextEncoder: TextEncoder, TextDecoder: TextDecoder };
module.exports = util;
module.exports.default = util;`,

  path: `function clean(parts){ var out = []; for (var i = 0; i < parts.length; i++){ if (parts[i]) out.push(parts[i]); } return out; }
var path = {
  sep: "/", delimiter: ":",
  join: function(){ return clean(Array.prototype.slice.call(arguments)).join("/"); },
  resolve: function(){ var r = clean(Array.prototype.slice.call(arguments)).join("/"); return r.charAt(0) === "/" ? r : "/" + r; },
  normalize: function(p){ var lead = p.charAt(0) === "/" ? "/" : ""; return lead + clean(p.split("/")).join("/"); },
  basename: function(p, ext){ var b = p.split("/").pop() || ""; if (ext && b.length >= ext.length && b.slice(b.length - ext.length) === ext) b = b.slice(0, b.length - ext.length); return b; },
  dirname: function(p){ var i = p.lastIndexOf("/"); if (i < 0) return "."; if (i === 0) return "/"; return p.slice(0, i); },
  extname: function(p){ var b = p.split("/").pop() || ""; var i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; },
  isAbsolute: function(p){ return p.charAt(0) === "/"; },
  relative: function(from, to){ var f = clean(String(from).split("/")); var t = clean(String(to).split("/")); var i = 0; while (i < f.length && i < t.length && f[i] === t[i]) i++; var up = []; for (var j = i; j < f.length; j++) up.push(".."); return up.concat(t.slice(i)).join("/"); },
  parse: function(p){ var dir = path.dirname(p); var base = path.basename(p); var ext = path.extname(p); return { root: p.charAt(0) === "/" ? "/" : "", dir: dir, base: base, ext: ext, name: ext ? base.slice(0, base.length - ext.length) : base }; },
  format: function(o){ o = o || {}; var dir = o.dir || o.root || ""; var base = o.base || ((o.name || "") + (o.ext || "")); return dir ? (dir.charAt(dir.length - 1) === "/" ? dir + base : dir + "/" + base) : base; }
};
path.posix = path;
module.exports = path;
module.exports.default = path;`,

  querystring: `var qs = {
  parse: function(s){ var o = {}; var sp = new URLSearchParams(s || ""); sp.forEach(function(v, k){ o[k] = v; }); return o; },
  stringify: function(o){ var sp = new URLSearchParams(); for (var k in o){ if (Object.prototype.hasOwnProperty.call(o, k)) sp.set(k, o[k]); } return sp.toString(); },
  escape: encodeURIComponent, unescape: decodeURIComponent
};
module.exports = qs;
module.exports.default = qs;`,

  string_decoder: `function StringDecoder(){ this._d = new TextDecoder(); }
StringDecoder.prototype.write = function(b){ return this._d.decode(b, { stream: true }); };
StringDecoder.prototype.end = function(b){ return b ? this._d.decode(b) : ""; };
module.exports = { StringDecoder: StringDecoder };
module.exports.default = { StringDecoder: StringDecoder };`,

  assert: `function assert(v, m){ if (!v) throw new Error(m || "assertion failed"); }
assert.ok = assert;
assert.equal = function(a, b, m){ if (a != b) throw new Error(m || "equal failed"); };
assert.strictEqual = function(a, b, m){ if (a !== b) throw new Error(m || "strictEqual failed"); };
assert.notEqual = function(a, b, m){ if (a == b) throw new Error(m || "notEqual failed"); };
assert.notStrictEqual = function(a, b, m){ if (a === b) throw new Error(m || "notStrictEqual failed"); };
assert.deepEqual = function(a, b, m){ if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m || "deepEqual failed"); };
assert.deepStrictEqual = assert.deepEqual;
assert.notDeepEqual = function(a, b, m){ if (JSON.stringify(a) === JSON.stringify(b)) throw new Error(m || "notDeepEqual failed"); };
assert.notDeepStrictEqual = assert.notDeepEqual;
assert.ifError = function(e){ if (e) throw e; };
assert.throws = function(fn, m){ try { fn(); } catch (e) { return; } throw new Error(m || "missing expected exception"); };
assert.doesNotThrow = function(fn){ fn(); };
assert.fail = function(m){ throw new Error(m || "failed"); };
module.exports = assert;
module.exports.default = assert;`,

  os: `var os = {
  EOL: String.fromCharCode(10),
  platform: function(){ return "wasi"; },
  arch: function(){ return "wasm32"; },
  type: function(){ return "Wasm"; },
  release: function(){ return "1.0.0"; },
  hostname: function(){ return "sandbox"; },
  cpus: function(){ return []; },
  totalmem: function(){ return 0; },
  freemem: function(){ return 0; },
  homedir: function(){ return "/"; },
  tmpdir: function(){ return "/tmp"; },
  endianness: function(){ return "LE"; }
};
module.exports = os;
module.exports.default = os;`,

  crypto: `var __wc = (typeof globalThis !== "undefined" && globalThis.crypto) ? globalThis.crypto : null;
var crypto = {
  randomBytes: function(n){ var a = new Uint8Array(n); if (__wc && __wc.getRandomValues) __wc.getRandomValues(a); return a; },
  getRandomValues: function(a){ if (__wc && __wc.getRandomValues) return __wc.getRandomValues(a); return a; },
  randomUUID: function(){ if (__wc && __wc.randomUUID) return __wc.randomUUID(); return "00000000-0000-4000-8000-000000000000"; },
  webcrypto: __wc, subtle: __wc ? __wc.subtle : undefined
};
module.exports = crypto;
module.exports.default = crypto;`,

  url: `function parse(u){ try { var x = new URL(u); return { href: x.href, protocol: x.protocol, host: x.host, hostname: x.hostname, port: x.port, pathname: x.pathname, path: x.pathname + x.search, search: x.search, hash: x.hash, query: x.search.charAt(0) === "?" ? x.search.slice(1) : x.search }; } catch (e) { return { href: u, pathname: u, path: u }; } }
function fileURLToPath(u){ var s = String(u); return s.indexOf("file://") === 0 ? s.slice(7) : s; }
function pathToFileURL(p){ return new URL("file://" + p); }
var mod = { URL: URL, URLSearchParams: URLSearchParams, parse: parse, format: function(o){ return o && o.href ? o.href : String(o); }, fileURLToPath: fileURLToPath, pathToFileURL: pathToFileURL, resolve: function(from, to){ try { return new URL(to, from).href; } catch (e) { return to; } } };
module.exports = mod;
module.exports.default = mod;`,

  stream: `function S(){ this._l = Object.create(null); }
S.prototype.on = function(t, f){ (this._l[t] || (this._l[t] = [])).push(f); return this; };
S.prototype.once = function(t, f){ return this.on(t, f); };
S.prototype.addListener = S.prototype.on;
S.prototype.removeListener = function(){ return this; };
S.prototype.emit = function(t){ var l = this._l[t]; if (!l) return false; var a = Array.prototype.slice.call(arguments, 1); l.slice().forEach(function(f){ f.apply(null, a); }); return true; };
S.prototype.pipe = function(d){ return d; };
S.prototype.write = function(){ return true; };
S.prototype.end = function(){ this.emit("finish"); this.emit("end"); return this; };
S.prototype.destroy = function(){ return this; };
S.prototype.setEncoding = function(){ return this; };
S.prototype.read = function(){ return null; };
var mod = { Readable: S, Writable: S, Duplex: S, Transform: S, PassThrough: S, Stream: S };
mod.default = mod;
module.exports = mod;`,

  tty: `function noop(){}
var mod = { isatty: function(){ return false; }, ReadStream: noop, WriteStream: noop };
module.exports = mod;
module.exports.default = mod;`,
};

// Generic stub for uncovered Node builtins: compiles cleanly, throws only if actually called.
function genericStub(name: string): string {
  return (
    'var __err = function(){ throw new Error("[bundler] node builtin " + ' +
    JSON.stringify(name) +
    ' + " is not available in the sandbox"); };\n' +
    'module.exports = new Proxy(function(){}, { get: function(){ return __err; }, apply: __err });'
  );
}

// If `url` is an esm.sh Node polyfill (/node/<name>.mjs), return CJS shim source; else null.
export function resolveShim(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = /^\/node\/(.+?)\.m?js$/.exec(pathname);
  if (!m) return null;
  const name = m[1];
  return SHIMS[name] || genericStub(name);
}
