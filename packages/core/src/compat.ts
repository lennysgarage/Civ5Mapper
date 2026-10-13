/** Collection and numeric helpers for the direct binary-algorithm port.
 * No interpreter or Python runtime; exported core boundaries use plain JS data.
 */
import { sha256 as hash } from "@noble/hashes/sha2.js";
export class ParseError extends Error {}
const keyCode = (k: any) =>
  typeof k === "string"
    ? "s:" + k
    : typeof k === "number"
      ? "n:" + k
      : JSON.stringify(k);
export class Dictionary extends Map<any, any> {
  private originals = new Map<string, any>();
  constructor(entries: any[] = []) {
    super();
    for (const [k, v] of entries) this.set(k, v);
  }
  set(k: any, v: any) {
    const encoded = keyCode(k);
    this.originals.set(encoded, k);
    return super.set(encoded, v);
  }
  get(k: any) {
    return super.get(keyCode(k));
  }
  has(k: any) {
    return super.has(keyCode(k));
  }
  delete(k: any) {
    this.originals.delete(keyCode(k));
    return super.delete(keyCode(k));
  }
  *keys(): any {
    for (const k of super.keys()) yield this.originals.get(k);
  }
  *entries(): any {
    for (const [k, v] of super.entries()) yield [this.originals.get(k), v];
  }
  [Symbol.iterator](): any {
    return this.entries();
  }
}
export function dict(entries: any = [], extra: any = null): any {
  if (extra) {
    const result = dict(entries);
    update(result, extra);
    return result;
  }
  if (entries instanceof Dictionary) return new Dictionary([...entries]);
  if (!Array.isArray(entries)) return new Dictionary(Object.entries(entries));
  return new Dictionary(entries);
}
export function wrapJson(v: any): any {
  if (Array.isArray(v)) return v.map(wrapJson);
  if (v && typeof v === "object" && !(v instanceof Uint8Array))
    return dict(Object.entries(v).map(([k, v]) => [k, wrapJson(v)]));
  return v;
}
export function unwrap(v: any): any {
  if (v instanceof Dictionary)
    return Object.fromEntries([...v].map(([k, v]) => [String(k), unwrap(v)]));
  if (v instanceof Set) return [...v].map(unwrap);
  if (Array.isArray(v)) return v.map(unwrap);
  if (v instanceof Uint8Array) return [...v];
  return v;
}
export function clone(v: any): any {
  if (v instanceof Dictionary)
    return dict([...v].map(([k, v]) => [k, clone(v)]));
  if (Array.isArray(v)) return v.map(clone);
  if (v instanceof Uint8Array) return v.slice();
  if (v instanceof Set) return set([...v].map(clone));
  return v;
}
export const truth = (v: any): boolean =>
  v != null &&
  v !== false &&
  v !== 0 &&
  v !== 0n &&
  v !== "" &&
  (!(v instanceof Map || v instanceof Set) || v.size > 0) &&
  ((!Array.isArray(v) && !(v instanceof Uint8Array)) || v.length > 0);
export const and = (a: any, b: any) => {
  const v = a();
  return truth(v) ? b() : v;
};
export const or = (a: any, b: any) => {
  const v = a();
  return truth(v) ? v : b();
};
export function iter(v: any): any[] {
  if (v instanceof Dictionary) return [...v.keys()];
  if (v instanceof Map) return [...v.keys()];
  if (v == null) throw new ParseError("not iterable");
  return [...v];
}
export const len = (v: any) =>
  v instanceof Map || v instanceof Set ? v.size : v.length;
export const eq = (a: any, b: any): boolean =>
  a === b ||
  (a instanceof Set &&
    b instanceof Set &&
    a.size === b.size &&
    [...a].every((v) => has(b, v))) ||
  (a instanceof Dictionary &&
    b instanceof Dictionary &&
    a.size === b.size &&
    [...a].every(([k, v]) => b.has(k) && eq(v, b.get(k)))) ||
  (Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, i) => eq(v, b[i]))) ||
  (a instanceof Uint8Array &&
    b instanceof Uint8Array &&
    a.length === b.length &&
    a.every((v, i) => v === b[i]));
export function compare(a: any, b: any): number {
  if (eq(a, b)) return 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = compare(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  return a < b ? -1 : 1;
}
export function get(v: any, k: any, fallback?: any): any {
  if (v instanceof Dictionary) {
    if (v.has(k)) return v.get(k);
    if (arguments.length > 2) return fallback;
    if ((v as any).factory) {
      const value = (v as any).factory();
      v.set(k, value);
      return value;
    }
    throw new ParseError("missing key " + str(k));
  }
  if (Array.isArray(v) || v instanceof Uint8Array || typeof v === "string") {
    const i = k < 0 ? v.length + k : k;
    if (i < 0 || i >= v.length) throw new ParseError("index outside array");
    return v[i];
  }
  if (v != null && Object.hasOwn(v, k)) return v[k];
  if (arguments.length > 2) return fallback;
  throw new ParseError("missing key " + k);
}
export const put = (v: any, k: any, value: any) => {
  if (v instanceof Dictionary) v.set(k, value);
  else v[k] = value;
};
export function slice(
  v: any,
  start: any = null,
  end: any = null,
  step: any = null,
) {
  const length = v.length;
  let s = start == null ? 0 : start < 0 ? Math.max(0, length + start) : start,
    e = end == null ? length : end < 0 ? Math.max(0, length + end) : end;
  if (step == null || step === 1) return v.slice(s, e);
  let result = [];
  for (let i = s; i < e; i += step) result.push(v[i]);
  return typeof v === "string" ? result.join("") : result;
}
export function has(v: any, k: any): boolean {
  if (v instanceof Dictionary) return v.has(k);
  if (v instanceof Set) return [...v].some((x) => eq(x, k));
  if (typeof v === "string") return v.includes(k);
  return iter(v).some((x) => eq(x, k));
}
export const set = (a: any = []) =>
  new Set(iter(a).filter((v, i, all) => all.findIndex((x) => eq(x, v)) === i));
export function add(v: any, k: any): any {
  if (v instanceof Set) {
    if (!has(v, k)) v.add(k);
    return null;
  }
  if (Array.isArray(v)) return [...v, ...k];
  return v + k;
}
export function sub(a: any, b: any): any {
  if (a instanceof Set) return set([...a].filter((k) => !has(b, k)));
  return a - b;
}
export function mul(a: any, b: any): any {
  if (typeof a === "string") return a.repeat(b);
  if (Array.isArray(a)) return Array.from({ length: b }, () => a).flat();
  return a * b;
}
export const div = (a: any, b: any) => a / b,
  floorDiv = (a: any, b: any) => Math.floor(a / b),
  mod = (a: any, b: any) => ((a % b) + b) % b,
  pow = (a: any, b: any) => a ** b;
function integerResult(v: bigint): any {
  return v >= BigInt(Number.MIN_SAFE_INTEGER) &&
    v <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(v)
    : v;
}
export const bitAnd = (a: any, b: any) => integerResult(BigInt(a) & BigInt(b)),
  bitOr = (a: any, b: any) => integerResult(BigInt(a) | BigInt(b)),
  bitXor = (a: any, b: any) => integerResult(BigInt(a) ^ BigInt(b)),
  shiftLeft = (a: any, b: any) => integerResult(BigInt(a) << BigInt(b)),
  shiftRight = (a: any, b: any) => integerResult(BigInt(a) >> BigInt(b)),
  invert = (a: any) => integerResult(~BigInt(a));
export const range = (a: any, b?: any, c = 1) => {
  if (b === undefined) {
    b = a;
    a = 0;
  }
  let result = [];
  for (let i = a; c > 0 ? i < b : i > b; i += c) result.push(i);
  return result;
};
export const enumerate = (a: any) => iter(a).map((v, i) => [i, v]);
export const zip = (...arrays: any[]) =>
  range(Math.min(...arrays.map(len))).map((i) => arrays.map((a) => get(a, i)));
export const sum = (a: any) => iter(a).reduce((n, v) => n + Number(v), 0),
  all = (a: any) => iter(a).every(truth),
  any = (a: any) => iter(a).some(truth);
export function sorted(a: any, opts: any = null): any[] {
  const key = opts ? get(opts, "key", null) : null,
    rev = opts ? get(opts, "reverse", false) : false;
  return iter(a).sort(
    (a, b) => compare(key ? key(a) : a, key ? key(b) : b) * (rev ? -1 : 1),
  );
}
export function min(...args: any[]): any {
  let opts =
    args.length > 1 && args.at(-1) instanceof Dictionary ? args.pop() : null;
  const a = args.length === 1 ? iter(args[0]) : args;
  return sorted(a, opts)[0];
}
export function max(...args: any[]): any {
  let opts =
    args.length > 1 && args.at(-1) instanceof Dictionary ? args.pop() : null;
  const a = args.length === 1 ? iter(args[0]) : args;
  return sorted(a, opts).at(-1);
}
export const list = (v: any = []) => iter(v),
  tuple = list,
  memoryview = (v: any) => v;
export function str(v: any): string {
  if (v instanceof Error) return v.message;
  if (v === null) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  return String(v);
}
export const int = (v: any, base = 10) =>
    typeof v === "string" ? parseInt(v, base) : Math.trunc(v),
  float = (v: any) => Number(v),
  bool = truth,
  abs = Math.abs;
export const type = (v: any) =>
  typeof v === "boolean"
    ? bool
    : typeof v === "string"
      ? str
      : typeof v === "number" && Number.isInteger(v)
        ? int
        : float;
export function isinstance(v: any, t: any): boolean {
  if (Array.isArray(t)) return t.some((x) => isinstance(v, x));
  return t === str
    ? typeof v === "string"
    : t === int
      ? Number.isInteger(v)
      : t === bool
        ? typeof v === "boolean"
        : t === dict
          ? v instanceof Dictionary
          : t === list || t === tuple
            ? Array.isArray(v)
            : v instanceof t;
}
export function round(v: any, d = 0) {
  const p = 10 ** d,
    n = v * p,
    base = Math.floor(n);
  return (n - base === 0.5 ? (base % 2 ? base + 1 : base) : Math.round(n)) / p;
}
export function next(v: any) {
  return iter(v)[0];
}
export function Counter(v: any = []) {
  const d = dict();
  for (const k of iter(v)) d.set(k, (d.get(k) || 0) + 1);
  (d as any).factory = () => 0;
  (d as any).counter = true;
  return d;
}
export function defaultdict(factory: any) {
  const d = dict();
  (d as any).factory = factory;
  return d;
}
export const items = (v: any) => [...v.entries()],
  values = (v: any) => [...v.values()],
  keys = (v: any) => [...v.keys()];
export const append = (v: any, a: any) => {
    v.push(a);
  },
  extend = (v: any, a: any) => {
    v.push(...iter(a));
  };
export function update(v: any, ...sources: any[]) {
  if (v.counter) {
    for (const source of sources) {
      if (source instanceof Dictionary) {
        for (const [k, n] of source) v.set(k, (v.get(k) || 0) + n);
      } else for (const key of iter(source)) v.set(key, (v.get(key) || 0) + 1);
    }
    return;
  }
  for (const source of sources)
    for (const [k, value] of items(source)) v.set(k, value);
}
export function pop(v: any, k?: any, fallback?: any): any {
  if (v instanceof Set) {
    const first = v.values().next();
    if (first.done) throw new ParseError("empty set");
    v.delete(first.value);
    return first.value;
  }
  if (v instanceof Dictionary) {
    if (!v.has(k)) {
      if (arguments.length > 2) return fallback;
      throw new ParseError("missing key " + str(k));
    }
    const a = v.get(k);
    v.delete(k);
    return a;
  }
  return k === undefined ? v.pop() : v.splice(k < 0 ? v.length + k : k, 1)[0];
}
export function setdefault(v: any, k: any, value: any = null) {
  if (!v.has(k)) v.set(k, value);
  return v.get(k);
}
export function del(v: any, k: any) {
  v.delete(k);
}
export function remove(v: any, k: any) {
  if (v instanceof Set) {
    for (const x of v)
      if (eq(x, k)) {
        v.delete(x);
        return;
      }
  } else {
    const i = v.findIndex((x) => eq(x, k));
    if (i >= 0) {
      v.splice(i, 1);
      return;
    }
  }
  throw new ParseError("missing element");
}
export function discard(v: any, k: any) {
  if (has(v, k)) remove(v, k);
}
export const join = (sep: any, a: any): any =>
    sep instanceof Uint8Array
      ? concat(iter(a), sep)
      : iter(a).map(str).join(sep),
  replace = (v: any, a: any, b: any) => v.split(a).join(b),
  split = (v: any, a: any = undefined, limit = -1) => splitValue(v, a, limit),
  startswith = (v: any, a: any) =>
    Array.isArray(a) ? a.some((x) => v.startsWith(x)) : v.startsWith(a),
  endswith = (v: any, a: any) => v.endsWith(a),
  removesuffix = (v: any, a: any) =>
    v.endsWith(a) ? v.slice(0, -a.length) : v,
  casefold = (v: any) => v.toLowerCase(),
  lower = casefold,
  strip = (v: any) => v.trim(),
  rfind = (v: any, a: any) => v.lastIndexOf(a),
  isprintable = (v: any) =>
    !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(v) &&
    (!/\p{Zs}/u.test(v) || !v.replaceAll(" ", "").match(/\p{Zs}/u));
export function sort(v: any, opts: any = null) {
  const sortedValues = sorted(v, opts);
  v.splice(0, v.length, ...sortedValues);
}
export function find(v: any, needle: any, start = 0, end = v.length) {
  if (typeof v === "string") return v.indexOf(needle, start);
  const length = Math.min(end, v.length) - needle.length;
  let i = start;
  while (i <= length) {
    i = v.indexOf(needle[0], i);
    if (i < 0 || i > length) return -1;
    let j = 1;
    for (; j < needle.length; j++) if (v[i + j] !== needle[j]) break;
    if (j === needle.length) return i;
    i++;
  }
  return -1;
}
export const bytes = (v: any) =>
    typeof v === "string" ? new TextEncoder().encode(v) : Uint8Array.from(v),
  encode = (v: any) => bytes(v),
  decode = (v: any, encoding = "utf-8") => decodeValue(v, encoding),
  hex = (v: any) =>
    Array.from(v, (n: any) => n.toString(16).padStart(2, "0")).join("");
export const sha256 = (v: any) => ({ hexdigest: () => hex(hash(v)) }),
  hexdigest = (v: any) => v.hexdigest();
export function crc32(data: any) {
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function fromBytes(v: any, order: any) {
  let n = 0n;
  const a = order === "little" ? [...v].reverse() : [...v];
  for (const b of a) n = (n << 8n) | BigInt(b);
  return integerResult(n);
}
export function format(v: any, spec = "") {
  if (!spec) return str(v);
  if (/[xX]$/.test(spec)) {
    const text = Number(v)
      .toString(16)
      .padStart(parseInt(spec) || 0, "0");
    return spec.endsWith("X") ? text.toUpperCase() : text;
  }
  if (spec.endsWith("f"))
    return Number(v).toFixed(parseInt(spec.split(".")[1]) || 0);
  return str(v);
}
export function escape(v: string, opts: any = null) {
  let r = v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  if (!opts || get(opts, "quote", true))
    r = r.replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
  return r;
}
export function wrap(s: string, width = 70) {
  const words = s.trim().split(/\s+/).filter(Boolean);
  let lines = [],
    line = "";
  for (let word of words) {
    while (word.length > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
export function PurePosixPath(s: string) {
  return {
    stem: s
      .split("/")
      .at(-1)
      .replace(/\.[^.]*$/, ""),
  };
}
export const struct = {
  calcsize(fmt: string) {
    let n = 0;
    for (const m of fmt.replace(/[<>]/g, "").matchAll(/(\d*)([bBhHiIfdQq])/g))
      n +=
        (Number(m[1]) || 1) *
        ({ b: 1, B: 1, h: 2, H: 2, i: 4, I: 4, f: 4, d: 8, Q: 8, q: 8 } as any)[
          m[2]
        ];
    return n;
  },
  unpack(fmt: string, bytes: Uint8Array) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      le = !fmt.startsWith(">");
    let off = 0,
      result = [];
    for (const m of fmt.replace(/[<>]/g, "").matchAll(/(\d*)([bBhHiIfdQq])/g))
      for (let i = 0; i < (Number(m[1]) || 1); i++) {
        const code = m[2],
          sizes: any = {
            b: 1,
            B: 1,
            h: 2,
            H: 2,
            i: 4,
            I: 4,
            f: 4,
            d: 8,
            Q: 8,
            q: 8,
          },
          method: any = {
            b: "getInt8",
            B: "getUint8",
            h: "getInt16",
            H: "getUint16",
            i: "getInt32",
            I: "getUint32",
            f: "getFloat32",
            d: "getFloat64",
            Q: "getBigUint64",
            q: "getBigInt64",
          };
        if (off + sizes[code] > bytes.length)
          throw new ParseError("truncated scalar");
        result.push((dv as any)[method[code]](off, le));
        off += sizes[code];
      }
    return result;
  },
  unpack_from(fmt: string, bytes: Uint8Array, offset = 0) {
    return this.unpack(fmt, bytes.subarray(offset));
  },
  pack(fmt: string, ...values: any[]) {
    const bytes = new Uint8Array(this.calcsize(fmt)),
      dv = new DataView(bytes.buffer),
      le = !fmt.startsWith(">");
    let off = 0,
      index = 0;
    for (const m of fmt.replace(/[<>]/g, "").matchAll(/(\d*)([bBhHiIfdQq])/g))
      for (let i = 0; i < (Number(m[1]) || 1); i++) {
        const code = m[2],
          sizes: any = {
            b: 1,
            B: 1,
            h: 2,
            H: 2,
            i: 4,
            I: 4,
            f: 4,
            d: 8,
            Q: 8,
            q: 8,
          },
          method: any = {
            b: "setInt8",
            B: "setUint8",
            h: "setInt16",
            H: "setUint16",
            i: "setInt32",
            I: "setUint32",
            f: "setFloat32",
            d: "setFloat64",
            Q: "setBigUint64",
            q: "setBigInt64",
          };
        (dv as any)[method[code]](off, values[index++], le);
        off += sizes[code];
      }
    return bytes;
  },
};
export const chr = (n: number) => String.fromCodePoint(n);
export const capitalize = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
export const isdigit = (s: string) => /^\d+$/.test(s);
export const insert = (a: any[], i: number, v: any) => a.splice(i, 0, v);
export const fullmatch = (pattern: string, s: string) =>
  new RegExp("^(?:" + pattern + ")$").exec(s);
export function concat(
  chunks: Uint8Array[],
  sep: Uint8Array = new Uint8Array(),
) {
  const size =
    chunks.reduce((n, c) => n + c.length, 0) +
    Math.max(0, chunks.length - 1) * sep.length;
  const output = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((c, i) => {
    if (i) {
      output.set(sep, offset);
      offset += sep.length;
    }
    output.set(c, offset);
    offset += c.length;
  });
  return output;
}
function decodeValue(v: Uint8Array, encoding: string) {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(v);
  } catch {
    throw new ParseError("invalid UTF-8");
  }
}
function splitValue(v: any, a: any, limit: number) {
  if (v instanceof Uint8Array) {
    let start = 0,
      parts = [],
      pos;
    while (
      (pos = find(v, a, start)) >= 0 &&
      (limit < 0 || parts.length < limit)
    ) {
      parts.push(v.slice(start, pos));
      start = pos + a.length;
    }
    parts.push(v.slice(start));
    return parts;
  }
  if (a === undefined) return v.trim().split(/\s+/);
  if (limit < 0) return v.split(a);
  const parts = v.split(a);
  return [...parts.slice(0, limit), parts.slice(limit).join(a)];
}
