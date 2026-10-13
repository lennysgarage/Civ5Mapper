import { Inflate, Z_SYNC_FLUSH } from "pako";
import * as p from "./compat.js";
export class Reader {
  private view: DataView;
  constructor(
    public data: Uint8Array,
    public pos = 0,
  ) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  take(count: number) {
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      this.pos + count > this.data.length
    )
      throw new p.ParseError(
        `truncated field at byte ${this.pos} (needs ${count} bytes)`,
      );
    const value = this.data.subarray(this.pos, this.pos + count);
    this.pos += count;
    return value;
  }
  unpack(fmt: string) {
    const sizes: any = { I: 4, i: 4, H: 2, h: 2, B: 1, b: 1 };
    const size = sizes[fmt];
    if (!size)
      return p.struct.unpack("<" + fmt, this.take(p.struct.calcsize(fmt)))[0];
    const offset = this.pos;
    if (offset + size > this.data.length)
      throw new p.ParseError(
        `truncated field at byte ${offset} (needs ${size} bytes)`,
      );
    this.pos += size;
    switch (fmt) {
      case "I":
        return this.view.getUint32(offset, true);
      case "i":
        return this.view.getInt32(offset, true);
      case "H":
        return this.view.getUint16(offset, true);
      case "h":
        return this.view.getInt16(offset, true);
      case "B":
        return this.view.getUint8(offset);
      default:
        return this.view.getInt8(offset);
    }
  }
  string() {
    const size = this.unpack("I");
    if (size > 1_000_000)
      throw new p.ParseError(`string too large at byte ${this.pos - 4}`);
    const start = this.pos,
      bytes = this.take(size);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new p.ParseError(`invalid UTF-8 at byte ${start}`);
    }
  }
  count(limit = 4096) {
    const count = this.unpack("I");
    if (count > limit)
      throw new p.ParseError(`array count ${count} exceeds ${limit}`);
    return count;
  }
  strings() {
    return Array.from({ length: this.count() }, () => this.string());
  }
  ints() {
    return Array.from({ length: this.count() }, () => this.unpack("i"));
  }
}
export function inflate(
  data: Uint8Array,
  start: number,
  maxOutput = 128 * 1024 * 1024,
) {
  const decoder = new Inflate({ windowBits: 15, chunkSize: 64 * 1024 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  decoder.onData = (chunk: Uint8Array) => {
    size += chunk.length;
    if (size > maxOutput)
      throw new p.ParseError(`decompressed data exceeds ${maxOutput} bytes`);
    chunks.push(chunk.slice());
  };
  decoder.push(data.subarray(start), Z_SYNC_FLUSH);
  if (decoder.err)
    throw new p.ParseError(
      `invalid compressed data at byte ${start}: ${decoder.msg}`,
    );
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return [
    output,
    decoder.ended,
    decoder.ended ? (decoder as any).strm.avail_in : 0,
  ];
}
