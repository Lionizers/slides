/**
 * Process and timeline as SmartArt.
 *
 * - Data model: one node per phase or step; its text keeps the formatting of the slide.
 * - Drawing (the cache that viewers show): the shapes exactly as rendered in the browser.
 * - Layout, colours and style: own definitions, made from the measures of the rendered
 *   graphic. PowerPoint always lays SmartArt out again when it opens a file, so these
 *   decide the look.
 */
import { emu, esc } from './dml.js';


/**
 * Own layout ids: for a Microsoft id PowerPoint uses its built-in layout and ignores the
 * definition in the file.
 */
const KINDS = {
  process: { id: 'urn:lionizers.com/smartart/layout/process', cat: 'process', layout: processLayout, colors: processColors },
  timeline: { id: 'urn:lionizers.com/smartart/layout/timeline', cat: 'process', layout: timelineLayout, colors: timelineColors },
};
const STYLE_ID = 'urn:lionizers.com/smartart/style/flat';

/**
 * Units of layout constraints, measured in PowerPoint: text margins and font sizes are in
 * points, positions and sizes (l, t, w, h) in millimetres.
 */
const pt = (px) => +(px * 0.75).toFixed(3);
const mm = (px) => +(px * 0.264583).toFixed(3);
const num = (v) => +v.toFixed(4);

/**
 * Measures of a process: size of a phase, gap, tip of the chevrons, and for each text level
 * (label, title, description) its box in the phase, font size and colour.
 */
function processMetrics(s) {
  const phase = (n) => {
    const shape = n.shapes.find((x) => x.type === 'box');
    const b = shape.box;
    const tip = shape.poly ? b.w - Math.max(...shape.poly.filter(([, y]) => y === 0).map(([x]) => x)) : 0;
    return { b, tip, levels: textLevels(n.shapes, b) };
  };
  const a = phase(s.nodes[0]);
  const b = s.nodes[1] ? phase(s.nodes[1]) : a;
  return {
    w: a.b.w,
    h: a.b.h,
    ratio: a.b.h / a.b.w,
    gap: s.nodes[1] ? (b.b.x - a.b.x - a.b.w) / a.b.w : 0,
    tip: a.tip / Math.min(a.b.w, a.b.h),
    first: a.levels,
    other: b.levels,
  };
}

const LEVELS = [
  { name: 'label', axis: 'self', ptType: 'node' },
  { name: 'title', axis: 'ch', ptType: 'node' },
  { name: 'text', axis: 'ch ch', ptType: 'node node' },
];

/**
 * Layout definition of a chevron process in the look of the slides (.lz-process).
 * Each phase is a composite: the chevron and one text area per level (label, title,
 * description), as PowerPoint's own process layouts do it. So each level has its own place,
 * size and colour, also in phases that are added in PowerPoint.
 */
const constr = (type, name, v) => `<dgm:constr type="${type}" for="ch" forName="${name}" val="${v}"/>`;

/**
 * Place and font size of the text area of each level. Widths are relative to the phase or
 * step: with more of them in PowerPoint they get narrower, and a fixed width would make
 * PowerPoint widen the step (gaps in the timeline, text beyond the arrow). The last level
 * reaches to the bottom.
 */
function levelPlaces(levels, width, height) {
  const rel = (type, name, ref, fact) => `<dgm:constr type="${type}" for="ch" forName="${name}" refType="${ref}" fact="${num(fact)}"/>`;
  return LEVELS.map((l, i) => {
    const v = levels[i] ?? levels.at(-1);
    const last = i === LEVELS.length - 1;
    return constr('l', l.name, mm(v.x)) + constr('t', l.name, mm(v.y)) +
      rel('w', l.name, 'w', Math.min((v.w + 4) / width, 1 - v.x / width)) +
      (last ? rel('h', l.name, 'h', (height - v.y) / height) : constr('h', l.name, mm(v.h))) +
      `<dgm:constr type="primFontSz" for="ch" forName="${l.name}" op="equ" val="${pt(v.size)}"/>`;
  }).join('');
}

/** The text areas of the levels (label, title, description), each with its own style label. */
function levelNodes() {
  // PowerPoint sets the first line 3 px higher in its line than the browser (measured).
  const text = (l, i) =>
    `<dgm:layoutNode name="${l.name}" styleLbl="lvl${i + 1}"><dgm:varLst><dgm:bulletEnabled val="0"/></dgm:varLst>` +
    `<dgm:alg type="tx"><dgm:param type="parTxLTRAlign" val="l"/><dgm:param type="parTxRTLAlign" val="r"/><dgm:param type="txAnchorVert" val="t"/></dgm:alg>` +
    `<dgm:shape type="rect" r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf axis="${l.axis}" ptType="${l.ptType}"/>` +
    `<dgm:constrLst><dgm:constr type="tMarg" val="${pt(3)}"/><dgm:constr type="lMarg" val="0"/><dgm:constr type="rMarg" val="0"/><dgm:constr type="bMarg" val="0"/></dgm:constrLst><dgm:ruleLst/></dgm:layoutNode>`;
  return LEVELS.map(text).join('');
}

/** Text colours of the levels, opaque on `under`. */
function levelColors(levels, under) {
  const on = (c) => (c ? mixHex(c.hex, under, c.alpha ?? 1) : 'F5F5F0');
  return Object.fromEntries(LEVELS.map((l, i) => [`lvl${i + 1}`, { fill: null, line: null, text: on(levels[i]?.color) }]));
}

/** Levels of a step or phase: box relative to `b`, font size and colour of each text block. */
function textLevels(shapes, b) {
  return shapes
    .filter((x) => x.type === 'text')
    .slice(0, 3)
    .map((x) => {
      const run = x.paras[0]?.runs.find((r) => r.text?.trim()) ?? {};
      const size = run.size ?? 18;
      // PowerPoint uses its single line height (1.2 em for Barlow) where the slides set their own:
      // move the area by half the difference, so the text stays in place.
      const shift = (1.2 * size - (x.paras[0]?.lineHeight ?? 1.2 * size)) / 2;
      return { x: x.box.x - b.x, y: x.box.y - b.y - shift, w: x.box.w, h: x.box.h, size, color: run.color };
    });
}

function processLayout(id, s) {
  const m = processMetrics(s);
  const c = constr;
  const places = (levels) =>
    `<dgm:constrLst>` +
    c('l', 'arrow', 0) + c('t', 'arrow', 0) + `<dgm:constr type="w" for="ch" forName="arrow" refType="w"/><dgm:constr type="h" for="ch" forName="arrow" refType="h"/>` +
    levelPlaces(levels, m.w, m.h) +
    `</dgm:constrLst>`;
  const arrow = (shape) => `<dgm:shape type="${shape}" r:blip=""><dgm:adjLst><dgm:adj idx="1" val="${num(m.tip)}"/></dgm:adjLst></dgm:shape>`;
  const first = `axis="precedSib" ptType="node" func="cnt" op="equ" val="0"`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dgm:layoutDef ${NS_DGM} uniqueId="${id}">` +
    `<dgm:title val="Lionizers process"/><dgm:desc val=""/><dgm:catLst><dgm:cat type="process" pri="100000"/></dgm:catLst>` +
    `<dgm:layoutNode name="diagram"><dgm:varLst><dgm:dir/><dgm:resizeHandles val="exact"/></dgm:varLst>` +
    `<dgm:alg type="lin"><dgm:param type="linDir" val="fromL"/><dgm:param type="nodeVertAlign" val="t"/></dgm:alg>` +
    `<dgm:shape r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf/>` +
    `<dgm:constrLst><dgm:constr type="w" for="ch" forName="phase" refType="w"/>` +
    `<dgm:constr type="h" for="ch" forName="phase" refType="w" refFor="ch" refForName="phase" fact="${num(m.ratio)}"/>` +
    `<dgm:constr type="w" for="ch" forName="space" refType="w" refFor="ch" refForName="phase" fact="${num(m.gap)}"/></dgm:constrLst><dgm:ruleLst/>` +
    `<dgm:forEach name="phases" axis="ch" ptType="node"><dgm:layoutNode name="phase"><dgm:alg type="composite"/><dgm:shape r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf/>` +
    `<dgm:choose name="places"><dgm:if name="firstPlaces" ${first}>${places(m.first)}</dgm:if><dgm:else name="otherPlaces">${places(m.other)}</dgm:else></dgm:choose><dgm:ruleLst/>` +
    `<dgm:layoutNode name="arrow" styleLbl="node1"><dgm:alg type="sp"/>` +
    `<dgm:choose name="shape"><dgm:if name="firstShape" ${first}>${arrow('homePlate')}</dgm:if><dgm:else name="otherShape">${arrow('chevron')}</dgm:else></dgm:choose>` +
    `<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/></dgm:layoutNode>` +
    levelNodes() +
    `</dgm:layoutNode>` +
    `<dgm:forEach name="sibling" axis="followSib" ptType="sibTrans" cnt="1"><dgm:layoutNode name="space"><dgm:alg type="sp"/><dgm:shape r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf/><dgm:constrLst/><dgm:ruleLst/></dgm:layoutNode></dgm:forEach>` +
    `</dgm:forEach></dgm:layoutNode></dgm:layoutDef>`
  );
}

/** Measures of a timeline step: dot, line to the next step, font sizes. */
function timelineMetrics(s) {
  const [a, b] = s.nodes;
  const boxes = a.shapes.filter((x) => x.type === 'box');
  const dot = boxes.find((x) => x.radius >= x.box.w / 2 - 1) ?? boxes[0];
  const line = boxes.find((x) => x !== dot && x.box.h <= 3);
  const border = Object.values(dot.sides)[0];
  // A step reaches to the next one (its line must, and PowerPoint clips the parts of a
  // composite node to it); the text keeps the width of the step in the slides.
  const gapPx = b ? b.box.x - a.box.x - a.box.w : 0;
  const w = a.box.w + gapPx;
  return {
    gapPx,
    ratio: a.box.h / w,
    text: a.box.w / w,
    dot: { y: dot.box.y - a.box.y, size: dot.box.w, fill: dot.fill?.hex, line: border?.color.hex, width: border?.width ?? 2 },
    line: line && { y: line.box.y - a.box.y, h: line.box.h, w: Math.min(1, line.box.w / w), color: line.fill?.hex },
    w,
    h: a.box.h,
    levels: textLevels(a.shapes, a.box),
  };
}

/**
 * Layout definition of a timeline (Timeline.tsx): per step a line to the next step, a dot
 * and the text (label, title, description) on top of each other.
 */
function timelineLayout(id, s) {
  const m = timelineMetrics(s);
  const c = (type, name, v) => `<dgm:constr type="${type}" for="ch" forName="${name}" val="${v}"/>`;
  const line = m.line
    ? `<dgm:choose name="next"><dgm:if name="hasNext" axis="followSib" ptType="node" func="cnt" op="gte" val="1">` +
      `<dgm:layoutNode name="line" styleLbl="line"><dgm:alg type="sp"/><dgm:shape type="rect" r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf/><dgm:constrLst/><dgm:ruleLst/></dgm:layoutNode>` +
      `</dgm:if><dgm:else name="last">` +
      // The last step gets an invisible line: PowerPoint fits what it draws into the frame,
      // so all steps must be equally wide.
      `<dgm:layoutNode name="lineEnd" styleLbl="txt"><dgm:alg type="sp"/><dgm:shape type="rect" r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf/><dgm:constrLst/><dgm:ruleLst/></dgm:layoutNode>` +
      `</dgm:else></dgm:choose>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dgm:layoutDef ${NS_DGM} uniqueId="${id}">` +
    `<dgm:title val="Lionizers timeline"/><dgm:desc val=""/><dgm:catLst><dgm:cat type="process" pri="100100"/></dgm:catLst>` +
    `<dgm:layoutNode name="diagram"><dgm:varLst><dgm:dir/><dgm:resizeHandles val="exact"/></dgm:varLst>` +
    `<dgm:alg type="lin"><dgm:param type="linDir" val="fromL"/><dgm:param type="nodeVertAlign" val="t"/></dgm:alg>` +
    `<dgm:shape r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf/>` +
    `<dgm:constrLst><dgm:constr type="w" for="ch" forName="step" refType="w"/>` +
    `<dgm:constr type="h" for="ch" forName="step" refType="w" refFor="ch" refForName="step" fact="${num(m.ratio)}"/>` +
    `</dgm:constrLst><dgm:ruleLst/>` +
    `<dgm:forEach name="steps" axis="ch" ptType="node"><dgm:layoutNode name="step"><dgm:alg type="composite"/><dgm:shape r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf/>` +
    `<dgm:constrLst>` +
    (m.line
      ? ['line', 'lineEnd'].map((n) => c('l', n, 0) + c('t', n, mm(m.line.y)) + `<dgm:constr type="w" for="ch" forName="${n}" refType="w" fact="${num(m.line.w)}"/>` + c('h', n, mm(m.line.h))).join('')
      : '') +
    // PowerPoint draws the outline on the edge, CSS inside the box: the ellipse is smaller by its width.
    c('l', 'dot', mm(m.dot.width / 2)) + c('t', 'dot', mm(m.dot.y + m.dot.width / 2)) + c('w', 'dot', mm(m.dot.size - m.dot.width)) + c('h', 'dot', mm(m.dot.size - m.dot.width)) +
    levelPlaces(m.levels, m.w, m.h) +
    `</dgm:constrLst><dgm:ruleLst/>` +
    line +
    `<dgm:layoutNode name="dot" styleLbl="dot"><dgm:alg type="sp"/><dgm:shape type="ellipse" r:blip=""><dgm:adjLst/></dgm:shape><dgm:presOf/><dgm:constrLst/><dgm:ruleLst/></dgm:layoutNode>` +
    levelNodes() +
    `</dgm:layoutNode>` +
    `</dgm:forEach></dgm:layoutNode></dgm:layoutDef>`
  );
}

/**
 * Style labels: fill, outline (null: none) and outline width in px. Text is in the text colour.
 * These apply when PowerPoint lays the graphic out, which it always does.
 */
function processColors(s, card) {
  return { node1: { fill: card, line: null }, ...levelColors(processMetrics(s).first, card) };
}

function mixHex(a, b, alpha) {
  const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return [0, 2, 4].map((i) => Math.round(ch(a, i) * alpha + ch(b, i) * (1 - alpha)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function timelineColors(s) {
  const m = timelineMetrics(s);
  return {
    txt: { fill: null, line: null },
    ...levelColors(m.levels, '1A1A1A'),
    dot: { fill: m.dot.fill ?? '1A1A1A', line: m.dot.line ?? 'C77B00', width: m.dot.width },
    line: { fill: m.line?.color ?? '7C7C7A', line: null },
  };
}

const clrOrNone = (hex) => (hex ? `<a:srgbClr val="${hex}"/>` : '<a:srgbClr val="000000"><a:alpha val="0"/></a:srgbClr>');

function colorsXml(id, labels) {
  const lbl = ([name, l]) =>
    `<dgm:styleLbl name="${name}"><dgm:fillClrLst meth="repeat">${clrOrNone(l.fill)}</dgm:fillClrLst><dgm:linClrLst meth="repeat">${clrOrNone(l.line)}</dgm:linClrLst>` +
    `<dgm:effectClrLst/><dgm:txLinClrLst/><dgm:txFillClrLst meth="repeat">${l.text ? `<a:srgbClr val="${l.text}"/>` : '<a:schemeClr val="tx1"/>'}</dgm:txFillClrLst><dgm:txEffectClrLst/></dgm:styleLbl>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dgm:colorsDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uniqueId="${id}">` +
    `<dgm:title val="Lionizers"/><dgm:desc val=""/><dgm:catLst><dgm:cat type="accent0" pri="10000"/></dgm:catLst>${Object.entries(labels).map(lbl).join('')}</dgm:colorsDef>`
  );
}

/** Quick style: flat, outline width from the theme's line styles (1: 1 px, 2: 2 px, 3: 3 px). */
function styleXml(labels) {
  const scene = '<dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d>';
  const ref = (tag, idx) => `<a:${tag} idx="${idx}"><a:scrgbClr r="0" g="0" b="0"/></a:${tag}>`;
  const lbl = ([name, l]) =>
    `<dgm:styleLbl name="${name}">${scene}<dgm:sp3d/><dgm:txPr/><dgm:style>${ref('lnRef', l.line ? Math.min(3, Math.max(1, Math.round(l.width ?? 1))) : 0)}${ref('fillRef', 1)}${ref('effectRef', 0)}` +
    `<a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></dgm:style></dgm:styleLbl>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dgm:styleDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uniqueId="${STYLE_ID}">` +
    `<dgm:title val="Lionizers flat"/><dgm:desc val=""/><dgm:catLst><dgm:cat type="simple" pri="10100"/></dgm:catLst>${scene}${Object.entries(labels).map(lbl).join('')}</dgm:styleDef>`
  );
}

const REL = {
  data: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData',
  layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout',
  style: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle',
  colors: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors',
  drawing: 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing',
};
const CT = {
  data: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml',
  layout: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml',
  style: 'application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml',
  colors: 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml',
  drawing: 'application/vnd.ms-office.drawingml.diagramDrawing+xml',
};

const NS_DGM = 'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** Model ids: GUIDs that are stable within one diagram. */
const guid = (diagram, n) => `{5A1E${String(diagram).padStart(4, '0')}-0000-4000-8000-${n.toString(16).toUpperCase().padStart(12, '0')}}`;

/** A model shape with its position moved by (dx, dy). */
function shift(s, dx, dy) {
  const out = { ...s, box: s.box && { ...s.box, x: s.box.x - dx, y: s.box.y - dy } };
  if (s.shapes) out.shapes = s.shapes.map((c) => shift(c, dx, dy));
  return out;
}

/** p:sp → dsp:sp (the drawing part uses its own namespace for the shape elements). */
function toDsp(xml, modelId) {
  return xml
    .replace(/<p:sp>/g, `<dsp:sp modelId="${modelId}">`)
    .replace(/<\/p:sp>/g, '</dsp:sp>')
    .replace(/<p:nvPr\/>/g, '')
    .replace(/<(\/?)p:(nvSpPr|cNvPr|cNvSpPr|spPr|txBody)/g, '<$1dsp:$2');
}

/**
 * @param part the slide part (Part from template.js)
 * @param s smartart model shape { kind, box, nodes: [{ box, shapes }] }
 * @param helpers { shapeXml(part, shape) → xml[], paragraphs(shape) → paras items, parasXml(items) → xml }
 * @returns graphicFrame xml
 */
export function smartArtXml(part, s, { shapeXml, nodeParagraphs, parasXml, card }) {
  const kind = KINDS[s.kind];
  if (!kind?.layout) return null;
  const pkg = part.pkg;
  const labels = kind.colors(s, card);
  const colorsId = `urn:lionizers.com/smartart/colors/${s.kind}-${Object.values(labels).map((l) => `${l.fill}${l.line}${l.text ?? ''}`).join('').toLowerCase()}`;
  pkg.diagrams = (pkg.diagrams ?? 0) + 1;
  const n = pkg.diagrams;
  const p = (name) => `ppt/diagrams/${name}${n}.xml`;

  // Data model: the document point, one node per child, connections in order.
  let next = 0;
  const doc = guid(n, next++);
  const pts = [];
  const cxns = [];
  /**
   * A point with its connection to `parent` (as PowerPoint writes it: a connection plus a
   * parent and a sibling transition point). Returns the id of the point.
   */
  const point = (parent, order, paragraph, custom = false) => {
    const id = guid(n, next++);
    const par = guid(n, next++);
    const sib = guid(n, next++);
    const cxn = guid(n, next++);
    const empty = '<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t>';
    pts.push(`<dgm:pt modelId="${id}"><dgm:prSet phldrT="[Text]"${custom ? ' custT="1"' : ''}/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/>${parasXml([paragraph])}</dgm:t></dgm:pt>`);
    pts.push(`<dgm:pt modelId="${par}" type="parTrans" cxnId="${cxn}"><dgm:prSet/><dgm:spPr/>${empty}</dgm:pt>`);
    pts.push(`<dgm:pt modelId="${sib}" type="sibTrans" cxnId="${cxn}"><dgm:prSet/><dgm:spPr/>${empty}</dgm:pt>`);
    cxns.push(`<dgm:cxn modelId="${cxn}" srcId="${parent}" destId="${id}" srcOrd="${order}" destOrd="0" parTransId="${par}" sibTransId="${sib}"/>`);
    return id;
  };
  // One shape per phase, in three levels as in the text pane of PowerPoint:
  // label (level 1), title (level 2), description (level 3, below the title).
  s.nodes.forEach((node, i) => {
    const [label, title, ...text] = nodeParagraphs(node);
    if (!label) return;
    const id = point(doc, i, label);
    if (!title) return;
    const titleId = point(id, 0, title);
    text.forEach((p, j) => point(titleId, j, p));
  });
  if (process.env.LZ_SMARTART_TEST_NODE) {
    // For checks in PowerPoint: one more node without formatting, as PowerPoint adds one.
    const id = point(doc, s.nodes.length, { runs: [{ text: 'Month 6' }] }, false);
    const titleId = point(id, 0, { runs: [{ text: 'New phase' }] }, false);
    point(titleId, 0, { runs: [{ text: 'Added in PowerPoint, without formatting.' }] }, false);
  }
  // relId of the drawing is the id of the slide's relationship to it (as PowerPoint writes it).
  const drawingRel = pkg.rel(part.path, REL.drawing, p('drawing'));
  const data =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dgm:dataModel ${NS_DGM}><dgm:ptLst>` +
    `<dgm:pt modelId="${doc}" type="doc"><dgm:prSet loTypeId="${kind.id}" loCatId="${kind.cat}" qsTypeId="${STYLE_ID}" qsCatId="simple" csTypeId="${colorsId}" csCatId="accent0" phldr="1"/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t></dgm:pt>` +
    pts.join('') +
    `</dgm:ptLst><dgm:cxnLst>${cxns.join('')}</dgm:cxnLst><dgm:bg/><dgm:whole/>` +
    `<dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="${drawingRel}" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst></dgm:dataModel>`;

  // Drawing: the rendered shapes of each node, relative to the frame.
  const shapes = [];
  s.nodes.forEach((node, i) => {
    for (const sh of node.shapes) {
      for (const xml of shapeXml(part, shift(sh, s.box.x, s.box.y))) {
        if (xml.startsWith('<p:sp>')) shapes.push(toDsp(xml, guid(n, 0x1000 + i * 64 + shapes.length)));
      }
    }
  });
  const drawing =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dsp:drawing xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>${shapes.join('')}</dsp:spTree></dsp:drawing>`;

  pkg.add(p('data'), data, CT.data);
  pkg.add(p('layout'), kind.layout(kind.id, s), CT.layout);
  pkg.add(p('quickStyle'), styleXml(labels), CT.style);
  pkg.add(p('colors'), colorsXml(colorsId, labels), CT.colors);
  pkg.add(p('drawing'), drawing, CT.drawing);
  const rel = (type, target) => pkg.rel(part.path, type, target);
  const ids = {
    dm: rel(REL.data, p('data')),
    lo: rel(REL.layout, p('layout')),
    qs: rel(REL.style, p('quickStyle')),
    cs: rel(REL.colors, p('colors')),
  };

  // PowerPoint scales what it draws to the frame. A timeline step reaches to the next one, and
  // the last step has an invisible line of the same length: the frame is one gap wider.
  const b = s.kind === 'timeline' ? { ...s.box, w: s.box.w + timelineMetrics(s).gapPx } : s.box;
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${part.id()}" name="${esc(s.kind === 'process' ? 'Process' : 'Timeline')}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${emu(b.x)}" y="${emu(b.y)}"/><a:ext cx="${emu(b.w)}" cy="${emu(b.h)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">` +
    `<dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="${ids.dm}" r:lo="${ids.lo}" r:qs="${ids.qs}" r:cs="${ids.cs}"/>` +
    `</a:graphicData></a:graphic></p:graphicFrame>`
  );
}
