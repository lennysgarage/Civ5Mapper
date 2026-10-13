import { initWasm, Resvg } from "@resvg/resvg-wasm";
import * as gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = (gifenc as any).GIFEncoder
  ? gifenc
  : (gifenc as any).default;
import {
  replaySteps,
  renderSvg,
  captionText,
  ParseError,
  type World,
  type ReplayOptions,
  type Style,
} from "./index.js";
let initialized = false,
  fonts: Uint8Array[] = [];
export async function initRaster(wasm: Uint8Array, fontBuffers: Uint8Array[]) {
  if (!initialized) {
    await initWasm(wasm as any);
    initialized = true;
  }
  fonts = fontBuffers;
}
export function rasterize(svg: string, scale = 1) {
  if (!initialized)
    throw new ParseError("SVG rasterizer has not been initialized");
  const r = new Resvg(svg, {
    font: {
      fontBuffers: fonts,
      defaultFontFamily: "DejaVu Serif",
      serifFamily: "DejaVu Serif",
      sansSerifFamily: "DejaVu Sans",
    },
    fitTo: { mode: "zoom", value: scale },
  });
  try {
    const image = r.render();
    try {
      return {
        png: image.asPng().slice(),
        pixels: image.pixels.slice(),
        width: image.width,
        height: image.height,
      };
    } finally {
      image.free();
    }
  } finally {
    r.free();
  }
}
export interface ReplayExportOptions extends ReplayOptions {
  mode?: string;
  captions?: boolean;
  duration?: number;
  scale?: number;
  style?: Style;
  format?: "gif" | "svg";
  progress?: (n: number) => void;
}
export function exportReplay(
  replay: any,
  base: World | null,
  options: ReplayExportOptions = {},
) {
  const mode = options.mode ?? "political",
    scale = options.scale ?? 0.5,
    duration = options.duration ?? 1000;
  if (mode === "army")
    throw new ParseError(
      "historical unit positions are unavailable; army mode supports current saves/world JSON only",
    );
  if (!["political", "physical"].includes(mode))
    throw new ParseError("unsupported replay mode");
  if (!Number.isInteger(duration) || duration < 10 || duration > 60000)
    throw new ParseError("duration must be 10–60000 ms");
  if (!Number.isFinite(scale) || scale < 0.25 || scale > 2)
    throw new ParseError("replay scale must be 0.25–2");
  const frames: any[] = [],
    metadata: any[] = [];
  let pixels = 0,
    lastSvg = "",
    warnings = [];
  for (const step of replaySteps(replay, base, options)) {
    const captions = options.captions
      ? captionText(step.notes, step.world, options.style)
      : null;
    lastSvg = renderSvg(step.world, options.style, { mode, captions });
    warnings = step.world.extraction.warnings;
    if (options.format !== "svg") {
      const box = lastSvg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
      const count =
        Math.ceil(Number(box[1]) * scale) * Math.ceil(Number(box[2]) * scale);
      if (count > 20_000_000 || pixels + count > 150_000_000)
        throw new ParseError(
          "GIF frame memory budget exceeded; lower --scale or --maxturns",
        );
      const f = rasterize(lastSvg, scale);
      pixels += f.width * f.height;
      frames.push(f);
    }
    const info: any = {
      turn: step.world.game.turn,
      cities: step.world.cities.length,
      ownedTiles: step.world.tiles.filter((t) => t.owner !== null).length,
    };
    if (captions) info.captions = captions;
    metadata.push(info);
    options.progress?.(metadata.length);
  }
  if (!metadata.length) throw new ParseError("replay has no frames");
  if (options.format === "svg")
    return {
      data: new TextEncoder().encode(lastSvg),
      frames: metadata,
      warnings,
    };
  const sample = new Uint8Array(64 * 64 * frames.length * 4);
  frames.forEach((f, index) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const src =
          (Math.min(f.height - 1, Math.floor(((y + 0.5) * f.height) / 64)) *
            f.width +
            Math.min(f.width - 1, Math.floor(((x + 0.5) * f.width) / 64))) *
          4;
        sample.set(
          f.pixels.subarray(src, src + 4),
          (index * 4096 + y * 64 + x) * 4,
        );
      }
  });
  const palette = quantize(sample, 256),
    gif = GIFEncoder();
  for (const f of frames)
    gif.writeFrame(applyPalette(f.pixels, palette), f.width, f.height, {
      palette,
      delay: duration,
      repeat: 0,
      dispose: 2,
    });
  gif.finish();
  return { data: gif.bytes().slice(), frames: metadata, warnings };
}
