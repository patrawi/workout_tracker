// Precompress build assets to .gz and .br so the server can ship them directly.
// Runs after `vite build`. Assets are content-hashed + immutable-cached, so the
// one-time brotli-11 cost at build is paid once and reused for every request.
import { readdir } from "node:fs/promises";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const DIR = "dist/assets";
const COMPRESSIBLE = [".js", ".css", ".svg", ".json"];
const MIN_BYTES = 1024;

const files = await readdir(DIR);
let n = 0;
for (const name of files) {
    if (!COMPRESSIBLE.some((e) => name.endsWith(e))) continue;
    const path = `${DIR}/${name}`;
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    if (bytes.byteLength < MIN_BYTES) continue;
    await Bun.write(`${path}.gz`, gzipSync(bytes, { level: 9 }));
    await Bun.write(`${path}.br`, brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }));
    n++;
}
console.log(`precompressed ${n} assets (.gz + .br)`);
