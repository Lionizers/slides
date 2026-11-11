/**
 * Turns the slide model from browser/extract.js into PowerPoint slides on the
 * Lionizers template. Known parts (kicker, title, text, columns, stats, …) go into
 * the placeholders of the matching layout, so they stay editable. Everything else
 * becomes shapes, text boxes, pictures and tables at the same position as in the browser.
 */
import crypto from 'node:crypto';
import { esc, emu, rPr, shape, picture, group, gradient, solid, clr, attrs, paras as parasXml } from './dml.js';
import { smartArtXml } from './smartart.js';
import { timingXml, MORPH_TRANSITION } from './animation.js';
import { placeholders } from './template.js';
import { pptFont } from './fonts.js';

const W = 1280;
const H = 720;
const NO_TABLE_STYLE = '{2D5ABB26-0587-4C30-8999-92F81FD0307C}';

/* ---------- Text ---------- */

const col = (c) => (c ? { c: c.hex, alpha: c.alpha } : undefined);

function runProps(r) {
  const f = pptFont(r);
  const size = /JetBrains/i.test(r.family) ? r.size * 0.923 : r.size;
  return {
    text: r.text,
    font: f.font,
    bold: f.bold,
    italic: r.italic || undefined,
    size,
    color: col(r.color),
    caps: r.caps || undefined,
    spacing: r.spacing ? r.spacing / size : undefined,
    // PowerPoint highlights have no transparency: mix the colour with the canvas instead.
    highlight: r.highlight ? r.highlight.hex : undefined,
  };
}

/** One paragraph of the model → a paras() item with explicit formatting. */
function para(p) {
  const runs = [];
  if (p.number) runs.push(runProps(p.number), { ...runProps({ ...p.runs[0], text: '\t' }) });
  for (const r of p.runs) runs.push(r.br ? { br: true, ...runProps({ ...r, ...(p.runs.find((x) => !x.br) ?? {}), text: '' }) } : runProps(r));
  const pPr = {
    align: p.align !== 'l' ? p.align : undefined,
    line: { px: p.lineHeight },
    before: p.spaceBefore ?? 0,
    // Indent and bullet only for list items: other paragraphs keep those of the layout
    // (the kicker gets its ">>" from there).
    marL: p.marL,
    indent: p.indent,
    bullet: p.bullet ? { char: '—', color: col(p.bullet.color), font: 'Barlow Condensed' } : p.number ? false : undefined,
  };
  return { runs, level: p.level || undefined, pPr };
}

const paras = (list) => list.map(para);

/**
 * Text box position. PowerPoint measures text a bit differently than Chrome, so the box
 * gets some room to the side the text grows to; otherwise it would wrap earlier.
 */
function slack(b, p) {
  const extra = Math.max(4, b.w * 0.03);
  if (p?.align === 'ctr') return { ...b, x: b.x - extra / 2, w: b.w + extra };
  if (p?.align === 'r') return { ...b, x: b.x - extra, w: b.w + extra };
  return { ...b, w: b.w + extra };
}

/* ---------- Pictures ---------- */

const hash = (data) => crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);

/** PNG fallbacks of all SVGs, rendered in Chrome before the slides are built (see svgsOf). */
let pngs = new Map();

function svgMedia(svg) {
  const png = pngs.get(svg);
  if (!png) throw new Error('SVG without PNG fallback');
  return { svg: Buffer.from(svg), png, key: `img-${hash(svg)}` };
}

/** All SVGs of the slides, so their PNG fallbacks can be rendered first. */
export function svgsOf(model) {
  const out = [];
  const visit = (shapes) => {
    for (const s of shapes ?? []) {
      if (s.type === 'svg') out.push(s.svg);
      if (s.type === 'image' && s.mime.includes('svg')) out.push(Buffer.from(s.data, 'base64').toString('utf8'));
      visit(s.shapes);
      for (const n of s.nodes ?? []) visit(n.shapes);
    }
  };
  for (const slide of model) {
    visit(slide.shapes);
    if (slide.parts.image) visit([slide.parts.image]);
  }
  return out;
}

function imageMedia(img) {
  const data = Buffer.from(img.data, 'base64');
  if (img.mime.includes('svg')) return svgMedia(data.toString('utf8'));
  if (img.mime.includes('jpeg') || img.mime.includes('jpg')) return { jpeg: data, key: `img-${hash(data)}` };
  if (img.mime.includes('png')) return { png: data, key: `img-${hash(data)}` };
  throw new Error(`Image type not supported yet: ${img.mime}`);
}

/** Crop a picture box to the slide, as the browser does (overflow: hidden). */
function clipToSlide(box, crop) {
  crop ??= {};
  const c = { l: crop.l ?? 0, t: crop.t ?? 0, r: crop.r ?? 0, b: crop.b ?? 0 };
  const sw = box.w / (1 - c.l - c.r);
  const sh = box.h / (1 - c.t - c.b);
  const out = { ...box };
  if (box.x < 0) { c.l += -box.x / sw; out.w += box.x; out.x = 0; }
  if (box.y < 0) { c.t += -box.y / sh; out.h += box.y; out.y = 0; }
  if (out.x + out.w > W) { c.r += (out.x + out.w - W) / sw; out.w = W - out.x; }
  if (out.y + out.h > H) { c.b += (out.y + out.h - H) / sh; out.h = H - out.y; }
  const any = c.l || c.t || c.r || c.b;
  return { box: out, crop: any ? c : undefined };
}

function pictureXml(part, media, b, crop, name = 'Picture', descr = '') {
  const clipped = clipToSlide(b, crop);
  if (clipped.box.w <= 0 || clipped.box.h <= 0) return '';
  const { png, svg } = part.image(media);
  return picture({ id: part.id(), name, box: clipped.box, png, svg, crop: clipped.crop, descr, userDrawn: false });
}

/** Picture in a picture placeholder (Media layout). */
function picPlaceholderXml(part, media, b, crop, idx) {
  const { png, svg } = part.image(media);
  const svgExt = svg
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svg}"/></a:ext></a:extLst>`
    : '';
  const src = crop ? `<a:srcRect${attrs({ l: pct(crop.l), t: pct(crop.t), r: pct(crop.r), b: pct(crop.b) })}/>` : '';
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${part.id()}" name="Picture"/><p:cNvPicPr><a:picLocks noGrp="1" noChangeAspect="1"/></p:cNvPicPr><p:nvPr><p:ph type="pic" idx="${idx}"/></p:nvPr></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${png}">${svgExt}</a:blip>${src}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${emu(b.x)}" y="${emu(b.y)}"/><a:ext cx="${emu(b.w)}" cy="${emu(b.h)}"/></a:xfrm></p:spPr></p:pic>`
  );
}
const pct = (v) => (v ? Math.round(v * 100000) : undefined);

/* ---------- Shapes ---------- */

function boxXml(part, s) {
  const out = [];
  const fill = s.gradient?.from && s.gradient?.to ? gradient(s.gradient.from.hex, s.gradient.to.hex, s.gradient.angle) : s.fill ? solid(col(s.fill)) : '<a:noFill/>';
  const hasFill = !!(s.gradient || s.fill);
  const sides = Object.entries(s.sides);
  if (s.poly) {
    out.push(shape({ id: part.id(), name: 'Shape', box: s.box, geom: s.poly, fill, ln: null }));
    return out;
  }
  const same = sides.length === 4 && sides.every(([, v]) => v.width === sides[0][1].width && v.color.hex === sides[0][1].color.hex && v.color.alpha === sides[0][1].color.alpha);
  if (same) {
    const w = sides[0][1].width;
    const b = { x: s.box.x + w / 2, y: s.box.y + w / 2, w: s.box.w - w, h: s.box.h - w };
    const round = s.radius >= 4;
    out.push(shape({
      id: part.id(), name: 'Box', box: b, geom: round ? 'roundRect' : 'rect', adj: round ? { adj: (s.radius / Math.min(b.w, b.h)) * 100000 } : {},
      fill, ln: { width: w, color: col(sides[0][1].color) },
    }));
    return out;
  }
  // Fill, then one shape per border colour.
  const groups = new Map();
  for (const [side, v] of sides) {
    const k = `${v.width}|${v.color.hex}|${v.color.alpha}`;
    if (!groups.has(k)) groups.set(k, { width: v.width, color: v.color, sides: [] });
    groups.get(k).sides.push(side);
  }
  const list = [...groups.values()];
  if (!list.length) {
    out.push(shape({ id: part.id(), name: 'Box', box: s.box, geom: s.radius >= 4 ? 'roundRect' : 'rect', adj: s.radius >= 4 ? { adj: (s.radius / Math.min(s.box.w, s.box.h)) * 100000 } : {}, fill, ln: null }));
    return out;
  }
  list.forEach((g, i) => {
    const withFill = i === 0 && hasFill;
    out.push(shape({
      id: part.id(), name: i === 0 ? 'Box' : 'Border', box: s.box, geom: { sides: g.sides, width: g.width, fill: withFill },
      fill: withFill ? fill : '<a:noFill/>', ln: { width: g.width, color: col(g.color) },
    }));
  });
  return out;
}

function textXml(part, s) {
  const first = s.paras[0];
  const nowrap = s.paras.every((p) => p.nowrap);
  return shape({
    id: part.id(), name: 'Text', textbox: true, box: nowrap ? { ...s.box, w: s.box.w + 8 } : slack(s.box, first), fill: null,
    body: { anchor: 't', wrap: nowrap ? 'none' : 'square' }, text: paras(s.paras),
  });
}

function tableXml(part, t) {
  const line = (tag, b) => (b ? `<a:${tag} w="${emu(b.width)}"><a:solidFill>${clr(col(b.color))}</a:solidFill></a:${tag}>` : `<a:${tag}><a:noFill/></a:${tag}>`);
  const rows = t.rows
    .map((row) => {
      const cells = [];
      for (const c of row.cells) {
        const p = para(c.para);
        const body = `<a:txBody><a:bodyPr/><a:lstStyle/>${paragraphXml(p)}</a:txBody>`;
        const [pt, pr, pb, pl] = c.pad;
        const tcPr =
          `<a:tcPr marL="${emu(pl)}" marR="${emu(pr)}" marT="${emu(pt)}" marB="${emu(pb)}" anchor="${c.valign}">` +
          line('lnL', c.borders.l) + line('lnR', c.borders.r) + line('lnT', c.borders.t) + line('lnB', c.borders.b) +
          (c.fill ? solid(col(c.fill)) : '<a:noFill/>') + '</a:tcPr>';
        cells.push(`<a:tc${c.span > 1 ? ` gridSpan="${c.span}"` : ''}>${body}${tcPr}</a:tc>`);
        for (let i = 1; i < c.span; i++) cells.push(`<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc>`);
      }
      return `<a:tr h="${emu(row.h)}">${cells.join('')}</a:tr>`;
    })
    .join('');
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${part.id()}" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${emu(t.box.x)}" y="${emu(t.box.y)}"/><a:ext cx="${emu(t.box.w)}" cy="${emu(t.box.h)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr><a:tableStyleId>${NO_TABLE_STYLE}</a:tableStyleId></a:tblPr>` +
    `<a:tblGrid>${t.cols.map((w) => `<a:gridCol w="${emu(w)}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  );
}

/** A single paragraph as XML, for table cells. */
function paragraphXml(p) {
  const runs = p.runs
    .map((r) => (r.br ? `<a:br>${rPr(r, 'a:rPr')}</a:br>` : `<a:r>${rPr(r, 'a:rPr')}<a:t>${esc(r.text)}</a:t></a:r>`))
    .join('');
  const pPr = `<a:pPr${p.pPr.align ? ` algn="${p.pPr.align}"` : ''}><a:lnSpc><a:spcPts val="${Math.round(p.pPr.line.px * 75)}"/></a:lnSpc><a:buNone/></a:pPr>`;
  return `<a:p>${pPr}${runs}</a:p>`;
}

/**
 * Shapes of one model shape, and the animation targets for its step (or the steps of its
 * paragraphs). `shown` is the step on which the parent already appears.
 */
function emit(part, s, targets, shown = 0) {
  const first = part.next;
  if (s.type === 'group') {
    const children = s.shapes.flatMap((c) => emit(part, c, targets, Math.max(shown, s.step ?? 0)));
    const id = part.id();
    if (s.step > shown) targets.push({ spid: id, step: s.step });
    return [group({ id, name: `!!${s.morph}`, box: s.box, children })];
  }
  const xml = shapeXml(part, s);
  const isSp = s.type === 'text' || s.type === 'box';
  const step = s.step ?? 0;
  const paraSteps = s.type === 'text' ? s.paras.map((p) => Math.max(p.step ?? 0, step)) : [];
  if (s.type === 'text' && new Set(paraSteps).size > 1) {
    paraSteps.forEach((st, i) => st > shown && targets.push({ spid: first, step: st, para: i, text: true }));
  } else if (step > shown) {
    for (let id = first; id < part.next; id++) targets.push({ spid: id, step, text: isSp });
  }
  return xml;
}

/** Paragraph targets of a placeholder whose paragraphs appear step by step. */
function placeholderTargets(spid, paras, targets) {
  const steps = paras.map((p) => p.step ?? 0);
  if (!steps.some((x) => x > 0)) return;
  if (new Set(steps).size === 1) targets.push({ spid, step: steps[0], text: true });
  else steps.forEach((st, i) => st > 0 && targets.push({ spid, step: st, para: i, text: true }));
}

/** All text of a SmartArt node, in order, as paras() items. */
function nodeParagraphs(node) {
  const out = [];
  const visit = (list) => {
    for (const s of list) {
      // Only what the SmartArt layout cannot give: font and weight. Size, colour and place
      // come from the layout per level. PowerPoint copies the formatting of a line when you
      // press Enter in the text pane, so anything else here would end up in the wrong level.
      // No fixed line breaks: PowerPoint wraps when it lays the graphic out.
      if (s.type === 'text') {
        out.push(...paras(s.paras).map((p) => ({
          runs: p.runs.map((r) => ({ text: r.br ? ' ' : r.text, font: r.font, bold: r.bold, italic: r.italic, caps: r.caps })),
          pPr: { bullet: false },
        })));
      }
      if (s.shapes) visit(s.shapes);
    }
  };
  visit(node.shapes);
  return out;
}

function shapeXml(part, s) {
  switch (s.type) {
    case 'box':
      return boxXml(part, s);
    case 'text':
      return [textXml(part, s)];
    case 'svg':
      return [pictureXml(part, svgMedia(s.svg), s.box, null, 'Graphic')];
    case 'image':
      return [pictureXml(part, imageMedia(s), s.box, s.crop, 'Picture', s.alt)];
    case 'table':
      return [tableXml(part, s)];
    case 'smartart':
    {
      const card = s.nodes[0]?.shapes.find((x) => x.type === 'box')?.fill?.hex ?? '252524';
      const xml = smartArtXml(part, s, { shapeXml, nodeParagraphs, parasXml, card });
      // Kinds without a SmartArt layout yet stay plain shapes.
      return xml ? [xml] : s.nodes.flatMap((n) => n.shapes.flatMap((sh) => shapeXml(part, sh)));
    }
    default:
      return [];
  }
}

/* ---------- Agenda ---------- */

function agendaXml(part, a) {
  const rowH = a.items.length ? a.items[0].box.h : 0;
  const numW = a.items[0] ? 1.4 * a.items[0].numberStyle.size + 24 : 86;
  const cell = (run, extraTop) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr><a:r>${rPr(run, 'a:rPr')}<a:t>${esc(run.text)}</a:t></a:r></a:p></a:txBody>` +
    `<a:tcPr marL="0" marR="0" marT="${emu(16)}" marB="${emu(16)}" anchor="ctr"><a:lnL><a:noFill/></a:lnL><a:lnR><a:noFill/></a:lnR>` +
    `${extraTop}<a:lnB><a:noFill/></a:lnB><a:noFill/></a:tcPr></a:tc>`;
  const top = a.line ? `<a:lnT w="9525"><a:solidFill>${clr(col(a.line))}</a:solidFill></a:lnT>` : '<a:lnT><a:noFill/></a:lnT>';
  const rows = a.items
    .map((it, i) => {
      const num = runProps({ ...it.numberStyle, text: String(i + 1).padStart(2, '0') });
      const text = runProps({ ...it.textStyle, text: it.text });
      return `<a:tr h="${emu(it.box.h)}">${cell(num, top)}${cell(text, top)}</a:tr>`;
    })
    .join('');
  const w = a.items[0]?.box.w ?? 680;
  const b = { x: a.items[0]?.box.x ?? a.box.x, y: a.items[0]?.box.y ?? a.box.y, w, h: rowH * a.items.length };
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${part.id()}" name="Agenda"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${emu(b.x)}" y="${emu(b.y)}"/><a:ext cx="${emu(b.w)}" cy="${emu(b.h)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr><a:tableStyleId>${NO_TABLE_STYLE}</a:tableStyleId></a:tblPr>` +
    `<a:tblGrid><a:gridCol w="${emu(numW)}"/><a:gridCol w="${emu(w - numW)}"/></a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  );
}

/* ---------- Slides ---------- */

const HUE_ORDER = ['steel', 'teal', 'violet', 'olive'];

function chooseLayout(s, names) {
  const pick = (name) => (names.has(name) ? name : null);
  const fallback = pick('Title Only');
  switch (s.variant) {
    case 'title': return 'Title';
    case 'section': return 'Section';
    case 'feature': return 'Feature';
    case 'agenda': return pick('Agenda') ?? fallback;
    case 'end': return pick('End') ?? 'End';
    case 'statement': return pick('Statement') ?? fallback;
    case 'quote': return pick('Quote') ?? fallback;
    case 'media': return pick(s.side === 'right' ? 'Media Right' : 'Media') ?? fallback;
    case 'columns': {
      const n = s.parts.columns?.length;
      return (n === 2 && pick('Two Columns')) || (n === 3 && pick('Three Columns')) || fallback;
    }
    case 'stats': {
      const n = s.parts.stats?.length;
      return (n === 3 && pick('Stats')) || (n === 4 && pick('Stats (4)')) || fallback;
    }
    default:
      return pick('Content') ?? fallback;
  }
}

/** Placeholder fill and boxes of a slide, by the keys of the layout placeholders. */
function phContent(s) {
  const fill = {};
  const boxes = {};
  const set = (key, p, box, withSlack = true) => {
    if (!p) return;
    box ??= p.box;
    fill[key] = paras(p.paras);
    boxes[key] = withSlack ? slack(box, p.paras[0]) : box;
  };
  const P = s.parts;
  set('kicker', P.kicker);
  set('title', P.title);
  set('subtitle', P.subtitle);
  set('number', P.number);
  set('statement', P.statement, P.statement?.box, false);
  set('text', P.text);
  set('body', P.body);
  set('quote', P.quote, P.quote?.box, false);
  set('by', P.by, P.by?.box, false);
  set('role', P.role, P.role?.box, false);
  P.columns?.forEach((c, i) => {
    set(`label${i + 1}`, c.label);
    set(`col${i + 1}`, c.body);
  });
  P.stats?.forEach((c, i) => {
    set(`label${i + 1}`, c.label);
    set(`value${i + 1}`, c.value, c.value?.box && { ...c.value.box, w: c.value.box.w + 40 }, false);
    set(`text${i + 1}`, c.text);
  });
  return { fill, boxes };
}

/**
 * @param {object[]} model from browser/extract.js
 * @returns slides for buildPackage({ kind: 'deck' })
 */
/** Morph names on a slide. */
function morphNames(shapes, out = new Set()) {
  for (const s of shapes) if (s.type === 'group') out.add(s.morph);
  return out;
}

export function deckSlides(model, layoutNames, svgPngs) {
  pngs = svgPngs;
  const morphs = model.map((s) => morphNames(s.shapes));
  return model.map((s, si) => {
    s.index = si;
    const morph = si > 0 && [...morphs[si]].some((n) => morphs[si - 1].has(n));
    const layout = chooseLayout(s, layoutNames);
    const gradientBg = s.gradient?.from && s.gradient?.to ? gradient(s.gradient.from.hex, s.gradient.to.hex, 135) : undefined;
    return {
      layout,
      bg: gradientBg,
      notes: s.notes,
      build(part, layoutSpec, index) {
        const out = [];
        const targets = [];
        for (const sh of s.shapes) out.push(...emit(part, sh, targets));
        if (s.parts.agenda) out.push(agendaXml(part, s.parts.agenda));

        const { fill, boxes } = phContent(s);
        const phKeys = new Set(layoutSpec.elements.filter((e) => e.ph).map((e) => e.key));
        // Parts without a placeholder in the chosen layout become text boxes.
        for (const key of Object.keys(fill)) {
          if (phKeys.has(key)) continue;
          out.push(shape({ id: part.id(), name: key, textbox: true, box: boxes[key], fill: null, body: { anchor: 't' }, text: fill[key] }));
          delete fill[key];
        }
        if (s.parts.image) {
          const img = s.parts.image;
          const media = imageMedia(img);
          out.push(phKeys.has('image') ? picPlaceholderXml(part, media, img.box, img.crop, 17) : pictureXml(part, media, img.box, img.crop));
        }
        const phs = placeholders(part, layoutSpec, { fill, boxes, footer: s.footer, index, bare: s.bare });
        out.push(...phs);
        const paraOf = { body: s.parts.body, text: s.parts.text };
        s.parts.columns?.forEach((c, i) => (paraOf[`col${i + 1}`] = c.body));
        for (const [key, p] of Object.entries(paraOf)) if (p && phs.ids[key]) placeholderTargets(phs.ids[key], p.paras, targets);
        const result = out.filter(Boolean);
        result.tail = (morph ? MORPH_TRANSITION : '') + timingXml(targets);
        return result;
      },
    };
  });
}
