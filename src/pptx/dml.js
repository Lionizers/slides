/**
 * Small helpers that write DrawingML / PresentationML.
 * All positions and sizes are in CSS pixels of the 1280 × 720 slide.
 */

/** CSS px → EMU (1280 px = 13.333 in = 12192000 EMU). */
export const emu = (px) => Math.round(px * 9525);
/** CSS px → hundredths of a point (font sizes). */
export const sz = (px) => Math.round(px * 75);
/** CSS px → points × 100 (spcPts). */
export const pts = (px) => Math.round(px * 75);

export const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function attrs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
}

/**
 * Colour: "RRGGBB", a scheme name ("tx1", "bg1", "accent1", …),
 * or { c: <one of these>, alpha: 0..1 }.
 */
export function clr(c) {
  if (c == null) return '';
  const { c: value, alpha } = typeof c === 'object' ? c : { c };
  const tag = /^[0-9A-F]{6}$/i.test(value) ? 'srgbClr' : 'schemeClr';
  const mods = alpha != null && alpha < 1 ? `<a:alpha val="${Math.round(alpha * 100000)}"/>` : '';
  return `<a:${tag} val="${value}">${mods}</a:${tag}>`;
}

export const solid = (c) => (c == null ? '' : `<a:solidFill>${clr(c)}</a:solidFill>`);

/** Linear gradient. CSS angle (deg) → DrawingML angle. */
export function gradient(from, to, cssAngle = 135) {
  const ang = (((cssAngle - 90) % 360) + 360) % 360;
  return (
    `<a:gradFill rotWithShape="1"><a:gsLst>` +
    `<a:gs pos="0">${clr(from)}</a:gs><a:gs pos="100000">${clr(to)}</a:gs>` +
    `</a:gsLst><a:lin ang="${ang * 60000}" scaled="0"/></a:gradFill>`
  );
}

/**
 * Character properties (a:defRPr or a:rPr).
 * @param {object} r { font, size (px), color, bold, italic, caps, spacing (em), tag }
 */
export function rPr(r = {}, tag = 'a:defRPr') {
  const a = attrs({
    lang: tag === 'a:rPr' ? (r.lang ?? 'en-US') : undefined,
    sz: r.size != null ? sz(r.size) : undefined,
    b: r.bold != null ? (r.bold ? 1 : 0) : undefined,
    i: r.italic != null ? (r.italic ? 1 : 0) : undefined,
    cap: r.caps ? 'all' : undefined,
    spc: r.spacing != null && r.size != null ? Math.round(r.spacing * r.size * 75) : undefined,
    baseline: r.baseline,
    dirty: tag === 'a:rPr' ? 0 : undefined,
  });
  const font = r.font
    ? `<a:latin typeface="${esc(r.font)}"/><a:ea typeface="${esc(r.font)}"/><a:cs typeface="${esc(r.font)}"/>`
    : '';
  const highlight = r.highlight ? `<a:highlight>${clr(r.highlight)}</a:highlight>` : '';
  const inner = solid(r.color) + highlight + font;
  return inner ? `<${tag}${a}>${inner}</${tag}>` : `<${tag}${a}/>`;
}

/**
 * Paragraph properties (a:lvlNpPr or a:pPr).
 * @param {object} p { marL, indent (px), align, line: {pct}|{px}, before, after (px),
 *   bullet: false | { char, color, font, sizePct } | { autoNum, color, font, sizePct }, run: rPr props }
 */
export function pPr(p = {}, tag = 'a:pPr') {
  const a = attrs({
    lvl: p.lvl || undefined,
    marL: p.marL != null ? emu(p.marL) : undefined,
    indent: p.indent != null ? emu(p.indent) : undefined,
    algn: p.align,
    eaLnBrk: tag === 'a:pPr' ? undefined : 1,
    hangingPunct: tag === 'a:pPr' ? undefined : 1,
  });
  let inner = '';
  if (p.line?.pct) inner += `<a:lnSpc><a:spcPct val="${Math.round(p.line.pct * 1000)}"/></a:lnSpc>`;
  if (p.line?.px) inner += `<a:lnSpc><a:spcPts val="${pts(p.line.px)}"/></a:lnSpc>`;
  if (p.before != null) inner += `<a:spcBef><a:spcPts val="${pts(p.before)}"/></a:spcBef>`;
  if (p.after != null) inner += `<a:spcAft><a:spcPts val="${pts(p.after)}"/></a:spcAft>`;
  if (p.bullet === false) inner += '<a:buNone/>';
  else if (p.bullet) {
    const b = p.bullet;
    if (b.color) inner += `<a:buClr>${clr(b.color)}</a:buClr>`;
    if (b.sizePct) inner += `<a:buSzPct val="${Math.round(b.sizePct * 1000)}"/>`;
    if (b.font) inner += `<a:buFont typeface="${esc(b.font)}"/>`;
    inner += b.autoNum
      ? `<a:buAutoNum type="${b.autoNum}"/>`
      : b.blip
        ? `<a:buBlip><a:blip r:embed="__BLIP_${b.blip}__"/></a:buBlip>`
        : `<a:buChar char="${esc(b.char)}"/>`;
  }
  if (p.run) inner += rPr(p.run);
  if (!inner) return a ? `<${tag}${a}/>` : '';
  return `<${tag}${a}>${inner}</${tag}>`;
}

/** List style with up to 9 levels: lstStyle([lvl1, lvl2, …]). */
export function lstStyle(levels = [], tag = 'a:lstStyle') {
  const inner = levels.map((l, i) => (l ? pPr(l, `a:lvl${i + 1}pPr`) : '')).join('');
  return inner ? `<${tag}>${inner}</${tag}>` : `<${tag}/>`;
}

/**
 * Paragraphs. Each item is a string, or { text, level, runs: [{ text, ...rPr }], pPr }.
 */
export function paras(items = [], defaults = {}) {
  if (!items.length) return `<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>`;
  return items
    .map((it) => {
      const p = typeof it === 'string' ? { text: it } : it;
      const runs = p.runs ?? [{ text: p.text ?? '' }];
      const pprXml = pPr({ lvl: p.level, ...(p.pPr ?? {}) });
      const r = runs
        .map((run) =>
          run.br
            ? `<a:br>${rPr({ ...defaults, ...run }, 'a:rPr')}</a:br>`
            : run.field
            ? `<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="${run.field}">${rPr({ ...defaults, ...run }, 'a:rPr')}<a:t>${esc(run.text ?? '‹#›')}</a:t></a:fld>`
            : `<a:r>${rPr({ ...defaults, ...run }, 'a:rPr')}<a:t>${esc(run.text)}</a:t></a:r>`,
        )
        .join('');
      return `<a:p>${pprXml}${r}</a:p>`;
    })
    .join('');
}

/** a:bodyPr. insets in px (default 0), anchor t|ctr|b, fit: none|shrink|shape. */
export function bodyPr({ anchor = 't', insets = [0, 0, 0, 0], fit = 'none', wrap = 'square', cols, colGap } = {}) {
  const [t, r, b, l] = insets;
  const fitXml = { none: '<a:noAutofit/>', shrink: '<a:normAutofit/>', shape: '<a:spAutoFit/>' }[fit];
  return `<a:bodyPr${attrs({ wrap, lIns: emu(l), tIns: emu(t), rIns: emu(r), bIns: emu(b), numCol: cols, spcCol: colGap != null ? emu(colGap) : undefined, anchor, rtlCol: 0 })}>${fitXml}</a:bodyPr>`;
}

export const xfrm = ({ x, y, w, h }, tag = 'a:xfrm') =>
  `<${tag}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></${tag}>`;

/**
 * Geometry: a preset name ("rect", "chevron", …) with optional adjust values,
 * or "leftBar": a shape that is filled like a rectangle but has a line only on the
 * left side. It grows with the text, so the bar always has the height of the text.
 */
export function geometry(geom = 'rect', adj = {}, box) {
  if (geom && typeof geom === 'object' && geom.sides) {
    // Borders on some sides only (CSS borders lie inside the box): one fill path, one line per side.
    const W = emu(box.w);
    const H = emu(box.h);
    const o = emu(geom.width / 2);
    const seg = { t: [[0, o], [W, o]], b: [[0, H - o], [W, H - o]], l: [[o, 0], [o, H]], r: [[W - o, 0], [W - o, H]] };
    const pt = ([x, y]) => `<a:pt x="${x}" y="${y}"/>`;
    const fill = geom.fill
      ? `<a:path w="${W}" h="${H}" stroke="0"><a:moveTo>${pt([0, 0])}</a:moveTo><a:lnTo>${pt([W, 0])}</a:lnTo><a:lnTo>${pt([W, H])}</a:lnTo><a:lnTo>${pt([0, H])}</a:lnTo><a:close/></a:path>`
      : '';
    const lines = geom.sides
      .map((s) => `<a:path w="${W}" h="${H}" fill="none"><a:moveTo>${pt(seg[s][0])}</a:moveTo><a:lnTo>${pt(seg[s][1])}</a:lnTo></a:path>`)
      .join('');
    return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>${fill}${lines}</a:pathLst></a:custGeom>`;
  }
  if (Array.isArray(geom)) {
    // Polygon, points in px relative to the shape box.
    const [first, ...rest] = geom;
    const pt = ([x, y]) => `<a:pt x="${emu(x)}" y="${emu(y)}"/>`;
    return (
      `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>` +
      `<a:path w="${emu(box.w)}" h="${emu(box.h)}"><a:moveTo>${pt(first)}</a:moveTo>` +
      rest.map((p) => `<a:lnTo>${pt(p)}</a:lnTo>`).join('') +
      `<a:close/></a:path></a:pathLst></a:custGeom>`
    );
  }
  if (geom === 'leftBar') {
    return (
      '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>' +
      '<a:path w="100" h="100" stroke="0"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="0"/></a:lnTo>' +
      '<a:lnTo><a:pt x="100" y="100"/></a:lnTo><a:lnTo><a:pt x="0" y="100"/></a:lnTo><a:close/></a:path>' +
      '<a:path w="100" h="100" fill="none"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="0" y="100"/></a:lnTo></a:path>' +
      '</a:pathLst></a:custGeom>'
    );
  }
  const av = Object.entries(adj)
    .map(([k, v]) => `<a:gd name="${k}" fmla="val ${Math.round(v)}"/>`)
    .join('');
  return `<a:prstGeom prst="${geom}"><a:avLst>${av}</a:avLst></a:prstGeom>`;
}

export function line(l) {
  if (l === undefined) return '';
  if (l === null || l === false) return '<a:ln><a:noFill/></a:ln>';
  return `<a:ln w="${emu(l.width ?? 1)}" cap="flat">${solid(l.color)}</a:ln>`;
}

/**
 * A shape (p:sp): placeholder, text box or plain shape.
 * @param {object} s { id, name, ph: { type, idx, sz, hasCustomPrompt }, box: {x,y,w,h},
 *   geom, adj, fill, ln, body: bodyPr opts, levels: lstStyle levels, text: paras items, textbox }
 */
export function shape(s) {
  const ph = s.ph
    ? `<p:nvPr><p:ph${attrs({ type: s.ph.type, idx: s.ph.idx, sz: s.ph.sz, hasCustomPrompt: s.ph.prompt ? 1 : undefined })}/></p:nvPr>`
    : '<p:nvPr/>';
  const cNv = s.ph ? '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' : `<p:cNvSpPr${s.textbox ? ' txBox="1"' : ''}/>`;
  const fill = s.fill === undefined ? '' : s.fill === null ? '<a:noFill/>' : s.fill.startsWith?.('<') ? s.fill : solid(s.fill);
  const spPr =
    (s.box ? xfrm(s.box) : '') +
    (s.box && (s.geom || !s.ph) ? geometry(s.geom, s.adj, s.box) : '') +
    fill +
    line(s.ln);
  const hasText = s.ph || s.text || s.textbox || s.body;
  const tx = !hasText
    ? ''
    : s.inherit
      ? `<p:txBody><a:bodyPr/><a:lstStyle/>${paras(s.text ?? [])}</p:txBody>`
      : `<p:txBody>${bodyPr(s.body)}${lstStyle(s.levels)}${paras(s.text ?? [])}</p:txBody>`;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${s.id}" name="${esc(s.name)}"/>${cNv}${ph}</p:nvSpPr>` +
    `<p:spPr>${spPr}</p:spPr>${tx}</p:sp>`
  );
}

/** A picture. blip: { png: rId, svg: rId } */
export function picture({ id, name, box, png, svg, descr = '', crop, userDrawn = true }) {
  const svgExt = svg
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svg}"/></a:ext></a:extLst>`
    : '';
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}" descr="${esc(descr)}"/>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr${userDrawn ? ' userDrawn="1"' : ''}/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${png}">${svgExt}</a:blip>${srcRect(crop)}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

/** Crop of a picture, fractions of each side: { l, t, r, b }. */
function srcRect(crop) {
  if (!crop) return '';
  const v = (k) => (crop[k] ? Math.round(crop[k] * 100000) : undefined);
  return `<a:srcRect${attrs({ l: v('l'), t: v('t'), r: v('r'), b: v('b') })}/>`;
}

/** A group of shapes. */
export function group({ id, name, box, children }) {
  const x = xfrm(box);
  const grp = x.replace('</a:xfrm>', `<a:chOff x="${emu(box.x)}" y="${emu(box.y)}"/><a:chExt cx="${emu(box.w)}" cy="${emu(box.h)}"/></a:xfrm>`);
  return (
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr>${grp}</p:grpSpPr>${children.join('')}</p:grpSp>`
  );
}

export function spTree(children) {
  return (
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    children.join('') +
    '</p:spTree>'
  );
}

export function background(fillXml) {
  return fillXml ? `<p:bg><p:bgPr>${fillXml}<a:effectLst/></p:bgPr></p:bg>` : '';
}
