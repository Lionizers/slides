/**
 * Assembles the parts of a .pptx / .potx file: content types, relationships, zip.
 */
import zlib from 'node:zlib';
import { XML_HEAD, NS, esc } from './dml.js';

const strToU8 = (s) => Buffer.from(s, 'utf8');

/** CRC-32 of a buffer (zlib.crc32 is not in every Node 20). */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A ZIP file (deflate) from { path: Buffer }, in the order of the object. */
function zipSync(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 6 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt32LE(0, 10); // time, date
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, nameBuf, packed);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(0, 12);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + packed.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dirBuf, end]);
}

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const RT = {
  officeDocument: `${REL}/officeDocument`,
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  app: `${REL}/extended-properties`,
  slideMaster: `${REL}/slideMaster`,
  slideLayout: `${REL}/slideLayout`,
  slide: `${REL}/slide`,
  theme: `${REL}/theme`,
  image: `${REL}/image`,
  presProps: `${REL}/presProps`,
  viewProps: `${REL}/viewProps`,
  tableStyles: `${REL}/tableStyles`,
  notesMaster: `${REL}/notesMaster`,
  notesSlide: `${REL}/notesSlide`,
};

const CT = {
  presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  template: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml',
  slideMaster: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  slideLayout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  notesMaster: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  presProps: 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml',
  viewProps: 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml',
  tableStyles: 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
};

/** A package under construction. Paths are without leading slash. */
export class Package {
  constructor() {
    this.files = new Map(); // path → string | Uint8Array
    this.rels = new Map(); // source path → [{ id, type, target }]
    this.overrides = new Map(); // path → content type
  }

  add(path, content, contentType) {
    this.files.set(path, content);
    if (contentType) this.overrides.set(path, CT[contentType] ?? contentType);
  }

  /** Adds a relationship from `source` to `target` (both package paths). Returns the rId. */
  rel(source, type, target) {
    const list = this.rels.get(source) ?? [];
    this.rels.set(source, list);
    const existing = list.find((r) => r.type === type && r.target === target);
    if (existing) return existing.id;
    const id = `rId${list.length + 1}`;
    list.push({ id, type, target });
    return id;
  }

  toZip() {
    const out = {};
    for (const [path, content] of this.files) out[path] = typeof content === 'string' ? strToU8(content) : content;

    for (const [source, list] of this.rels) {
      const dir = source.includes('/') ? source.slice(0, source.lastIndexOf('/')) : '';
      const name = source.slice(source.lastIndexOf('/') + 1);
      const relPath = `${dir ? `${dir}/` : ''}_rels/${name}.rels`;
      const body = list
        .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(relative(dir, r.target))}"/>`)
        .join('');
      out[relPath] = strToU8(`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`);
    }

    const defaults = {
      rels: 'application/vnd.openxmlformats-package.relationships+xml',
      xml: 'application/xml',
      png: 'image/png',
      svg: 'image/svg+xml',
      jpeg: 'image/jpeg',
    };
    const types =
      Object.entries(defaults).map(([e, t]) => `<Default Extension="${e}" ContentType="${t}"/>`).join('') +
      [...this.overrides].map(([p, t]) => `<Override PartName="/${p}" ContentType="${t}"/>`).join('');
    out['[Content_Types].xml'] = strToU8(`${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${types}</Types>`);

    // [Content_Types].xml first, as Office expects.
    const ordered = { '[Content_Types].xml': out['[Content_Types].xml'], ...out };
    return zipSync(ordered);
  }
}

/** Relative path from directory `fromDir` to `to` (both package paths). */
function relative(fromDir, to) {
  if (fromDir === '') return to;
  const a = fromDir.split('/');
  const b = to.split('/');
  while (a.length && b.length > 1 && a[0] === b[0]) {
    a.shift();
    b.shift();
  }
  return [...a.map(() => '..'), ...b].join('/');
}

export function coreXml(title) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return (
    XML_HEAD +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(title)}</dc:title><dc:creator>Lionizers</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    `</cp:coreProperties>`
  );
}

export function appXml() {
  return (
    XML_HEAD +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Microsoft Office PowerPoint</Application><PresentationFormat>Widescreen</PresentationFormat><AppVersion>16.0000</AppVersion></Properties>`
  );
}

export const presPropsXml = () => `${XML_HEAD}<p:presentationPr ${NS}/>`;
export const viewPropsXml = () =>
  `${XML_HEAD}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`;
