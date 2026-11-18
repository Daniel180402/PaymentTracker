// Writes .br and .gz next to every compressible file of the build, so the
// server can send them as they are instead of compressing on each request.
// Usage: node scripts/compress.mjs dist
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".svg", ".json", ".webmanifest", ".txt"]);
const MIN_SIZE = 1024;

let before = 0;
let after = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      walk(file);
      continue;
    }
    if (!COMPRESSIBLE.has(extname(name))) continue;
    const raw = readFileSync(file);
    if (raw.length < MIN_SIZE) continue;
    const br = brotliCompressSync(raw, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    });
    const gz = gzipSync(raw, { level: 9 });
    if (br.length < raw.length) writeFileSync(file + ".br", br);
    if (gz.length < raw.length) writeFileSync(file + ".gz", gz);
    before += raw.length;
    after += Math.min(br.length, raw.length);
  }
}

walk(process.argv[2] ?? "dist");
console.log(`compressed ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB (brotli)`);
