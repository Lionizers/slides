#!/usr/bin/env node
/**
 * Renders every slide of a .pptx to PNG with DeckCraft, for a quick visual check
 * during development. Start DeckCraft first:
 *   /Applications/DeckCraft.app/Contents/MacOS/DeckCraft --control 7990
 * Usage: node tools/render.js FILE.pptx OUTDIR [--edit] [--port 7990]
 * DeckCraft is not PowerPoint: the final check must happen in PowerPoint.
 */
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const [file, outDir] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const port = Number(opt('--port', 7990));
if (!file || !outDir) {
  console.error('Usage: node tools/render.js FILE.pptx OUTDIR [--edit] [--port 7990]');
  process.exit(1);
}

const sock = net.connect(port, '127.0.0.1');
let buf = '';
const waiting = [];
sock.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    waiting.shift()?.(JSON.parse(line));
  }
});
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    waiting.push((r) => (r.ok ? resolve(r.result ?? r) : reject(new Error(`${method}: ${r.error}`))));
    sock.write(`${JSON.stringify({ method, params })}\n`);
  });

await new Promise((r, j) => (sock.once('connect', r), sock.once('error', j)));
await call('app.open', { path: path.resolve(file) });
const doc = await call('document.inspect');
const count = (doc.slides ?? doc.result?.slides ?? []).length;
fs.mkdirSync(outDir, { recursive: true });
for (let i = 0; i < count; i++) {
  const out = path.resolve(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
  await call('ui.render', { slide: i, scale: 4 / 3, edit: flag('--edit'), path: out });
  console.log(out);
}
sock.end();
