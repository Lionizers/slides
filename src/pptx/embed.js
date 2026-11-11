/**
 * Embeds the static fonts (fonts/*.ttf) into a package, so the file looks right on computers
 * without them, and in PowerPoint for the web. PowerPoint takes plain TrueType files as
 * embedded font parts (checked). All fonts are OFL and allow embedding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RT } from './package.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');

/** Family (name ID 1) and style (name ID 2) of a TrueType file, from its Windows names. */
function names(buf) {
  const tables = buf.readUInt16BE(4);
  let name = 0;
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'name') name = buf.readUInt32BE(rec + 8);
  }
  const count = buf.readUInt16BE(name + 2);
  const strings = name + buf.readUInt16BE(name + 4);
  const out = {};
  for (let i = 0; i < count; i++) {
    const r = name + 6 + i * 12;
    const [platform, , lang, id, len, off] = [0, 2, 4, 6, 8, 10].map((o) => buf.readUInt16BE(r + o));
    if (platform !== 3 || lang !== 0x409 || (id !== 1 && id !== 2) || out[id]) continue;
    const raw = buf.subarray(strings + off, strings + off + len);
    out[id] = Buffer.from(raw).swap16().toString('utf16le');
  }
  return { family: out[1], style: out[2] };
}

const SLOT = { Regular: 'regular', Bold: 'bold', Italic: 'italic', 'Bold Italic': 'boldItalic' };

/** The fonts by family: { family: { regular: file, bold: file, … } }. */
let catalog;
function fonts() {
  if (catalog) return catalog;
  catalog = {};
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.ttf')).sort()) {
    const { family, style } = names(fs.readFileSync(path.join(DIR, file)));
    if (family && SLOT[style]) (catalog[family] ??= {})[SLOT[style]] = file;
  }
  return catalog;
}

/**
 * Adds the fonts that the package uses (any typeface="…" in its parts) and returns the
 * <p:embeddedFontLst> for presentation.xml.
 * @param {import('./package.js').Package} pkg
 */
export function embedFonts(pkg, presPath = 'ppt/presentation.xml') {
  const used = new Set();
  for (const content of pkg.files.values()) {
    if (typeof content !== 'string') continue;
    for (const m of content.matchAll(/typeface="([^"]+)"/g)) used.add(m[1]);
  }
  const all = fonts();
  let n = 0;
  const list = [];
  for (const family of Object.keys(all).filter((f) => used.has(f))) {
    const slots = Object.entries(all[family])
      .sort(([a], [b]) => ['regular', 'bold', 'italic', 'boldItalic'].indexOf(a) - ['regular', 'bold', 'italic', 'boldItalic'].indexOf(b))
      .map(([slot, file]) => {
        const part = `ppt/fonts/font${++n}.fntdata`;
        pkg.add(part, fs.readFileSync(path.join(DIR, file)));
        return `<p:${slot} r:id="${pkg.rel(presPath, RT.font, part)}"/>`;
      });
    list.push(`<p:embeddedFont><p:font typeface="${family}"/>${slots.join('')}</p:embeddedFont>`);
  }
  return list.length ? `<p:embeddedFontLst>${list.join('')}</p:embeddedFontLst>` : '';
}
