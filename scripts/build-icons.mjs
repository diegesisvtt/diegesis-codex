import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(root, 'build');
const svg = await readFile(path.join(buildDir, 'icon.svg'));

async function png(size) {
  return sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
}

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dirs = entries.map(({ size, data }) => {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0);
    dir.writeUInt8(size >= 256 ? 0 : size, 1);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(data.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += data.length;
    return dir;
  });
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.data)]);
}

function buildIcns(entries) {
  const parts = entries.map(({ type, data }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

await mkdir(buildDir, { recursive: true });
await mkdir(path.join(root, 'public'), { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = new Map();
for (const size of sizes) pngs.set(size, await png(size));

await writeFile(path.join(buildDir, 'icon.png'), pngs.get(1024));
await writeFile(path.join(root, 'public', 'icon.png'), pngs.get(512));

const ico = buildIco([16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, data: pngs.get(s) })));
await writeFile(path.join(buildDir, 'icon.ico'), ico);

const icns = buildIcns([
  { type: 'icp4', data: pngs.get(16) },
  { type: 'icp5', data: pngs.get(32) },
  { type: 'icp6', data: pngs.get(64) },
  { type: 'ic07', data: pngs.get(128) },
  { type: 'ic08', data: pngs.get(256) },
  { type: 'ic09', data: pngs.get(512) },
  { type: 'ic10', data: pngs.get(1024) },
]);
await writeFile(path.join(buildDir, 'icon.icns'), icns);

console.log('icons: build/icon.png (1024), build/icon.ico, build/icon.icns, public/icon.png (512)');
