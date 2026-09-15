// Bundles electron main + preload to dist-electron (CommonJS, external native modules).
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'better-sqlite3', 'sqlite-vec', '@huggingface/transformers', 'onnxruntime-node'],
  sourcemap: true,
  outdir: 'dist-electron',
};

await build({ ...common, entryPoints: ['electron/main.ts'] });
await build({ ...common, entryPoints: ['electron/preload.ts'], sourcemap: false });

console.log('[build-electron] main.js + preload.js written to dist-electron/');
