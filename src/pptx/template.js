/**
 * The Lionizers PowerPoint template: one slide master, one layout per layout of
 * Lionizers Slides (all dark: the CI is built on dark slides) and a table style.
 *
 * All measures are CSS px of the 1280 × 720 slide and come from theme.css / layouts.tsx.
 */
import {
  NS, XML_HEAD, esc, rPr, shape, picture, spTree, background, gradient, lstStyle, solid, clr,
} from './dml.js';
import { FONT, BARLOW_LINE } from './fonts.js';
import { themeXml } from './theme.js';
import { Package, RT, coreXml, appXml, presPropsXml, viewPropsXml } from './package.js';

/** JetBrains Mono has `size-adjust: 92.3%` in theme.css. */
const MONO = 0.923;
const W = 1280;
const H = 720;
const PAD = { top: 64, right: 80, bottom: 72, left: 80 };
const INNER_W = W - PAD.left - PAD.right; // 1120
const HUE_ORDER = ['steel', 'teal', 'violet', 'olive', 'gold', 'blue', 'orange', 'green', 'red'];
export const TABLE_STYLE_ID = '{5A1E7C2B-3D4F-4B6A-9C8D-7E6F5A4B3C2D}';

const alpha = (a, c = 'tx1') => ({ c, alpha: a });
const pct = (cssLineHeight) => ({ pct: (cssLineHeight / BARLOW_LINE) * 100 });

export function styles(ci) {
  const gold = ci.hues.gold;
  const mono = (size) => ({ font: FONT.mono, size: size * MONO, caps: true, spacing: 0.05 });
  return {
    // The ">>" picture bullet, measured in PowerPoint (Mac): it puts the bottom of the picture on
    // the baseline, at 100 % the picture is 0.89 cap heights high. The slides show the ">>"
    // 0.72 cap heights high and 0.09 above the baseline (KICKER_PAD in assets.js), the text 2.61 cap heights after its start.
    kicker: {
      marL: 22.5, indent: -22.5, line: { px: 20 }, before: 0,
      bullet: { blip: 'kicker', sizePct: 93 },
      run: { ...mono(13), color: alpha(0.7) },
    },
    title: { marL: 0, indent: 0, line: { px: 52.5 }, before: 0, bullet: false, run: { font: FONT.condensed, size: 50, color: 'tx1' } },
    hero: (size) => ({ marL: 0, indent: 0, line: { px: size }, before: 0, bullet: false, run: { font: FONT.heroBold, size, color: 'tx1' } }),
    lead: { marL: 0, indent: 0, line: { px: 28 * 1.3 }, before: 0, bullet: false, run: { font: FONT.condensed, size: 28, color: alpha(0.7) } },
    label: (color = gold.ink, size = 16) => ({ marL: 0, indent: 0, line: { px: size * 1.3 }, before: 0, bullet: false, run: { ...mono(size), color } }),
    footer: { marL: 0, indent: 0, bullet: false, run: { ...mono(11), color: alpha(0.45) } },
    text: (size, a = 0.7, extra = {}) => ({ marL: 0, indent: 0, line: pct(1.35), before: 0, bullet: false, run: { font: FONT.condensed, size, color: alpha(a), ...extra } }),
    /** Body levels: 1 = paragraph, 2 = bullet (amber dash), 3+ = nested bullets. */
    body: (size = 27) => {
      const em = size;
      const item = (level, a) => ({
        marL: 1.6 * em * level, indent: -1.6 * em, line: pct(1.35), before: 0.6 * em,
        bullet: { char: '—', color: ci.primary, font: FONT.condensed },
        run: { font: FONT.condensed, size, color: alpha(a) },
      });
      return [
        { marL: 0, indent: 0, line: pct(1.35), before: 0.6 * em, bullet: false, run: { font: FONT.condensed, size, color: alpha(0.7) } },
        item(1, 0.85),
        item(2, 0.7),
        item(3, 0.7),
        item(4, 0.7),
        item(5, 0.7),
        item(6, 0.7),
        item(7, 0.7),
        item(8, 0.7),
      ];
    },
  };
}

/* ------------------------------------------------------------------ */
/* Layout specs                                                         */
/* ------------------------------------------------------------------ */

/**
 * A layout is { name, bg, logo: 'small' | 'large' | false, footer: {…} | false, elements }.
 * Elements: { key, ph, box, levels, prompt, body, geom, fill, ln } (placeholders and static
 * shapes) or { raw: (part) => xml }.
 * Placeholder keys are used by the export to fill them.
 */
export function layouts(ci) {
  const st = styles(ci);
  const sec = ci.hues.secondary;
  const LOGO = { x: W - PAD.right - 112, y: 60 + (20 - 112 / 6.11) / 2, w: 112, h: 112 / 6.11 };
  const footer = (left = PAD.left, right = W - PAD.right) => ({ left, right });

  const kicker = (x = PAD.left, y = PAD.top, w = 900, prompt = 'Kicker') => ({
    key: 'kicker', ph: { type: 'body', idx: 13 }, box: { x, y, w, h: 20 }, levels: [st.kicker], prompt: [prompt], body: { anchor: 't' },
  });
  const title = (x = PAD.left, y = 108, w = 1040, h = 56) => ({
    key: 'title', ph: { type: 'title' }, box: { x, y, w, h }, levels: [st.title], prompt: ['Title of the slide'], body: { anchor: 't', fit: 'shrink' },
  });
  const header = () => [kicker(), title()];
  const content = (box, prompt, idx = 1, sz) => ({
    key: idx === 1 ? 'body' : `body${idx}`, ph: { idx, sz }, box, levels: st.body(), prompt,
  });
  const bodyPrompt = ['Text. Press Tab for a bullet point.', { text: 'Bullet point', level: 1 }, { text: 'Second level', level: 2 }];
  const gradientOf = (h) => gradient(h['surface-deep'], h.surface, 135);

  // Hero stack of the gradient slides: from the bottom (padding-bottom 136) upwards.
  const heroStack = ({ heroSize, heroWidth, leadSize, leadLines, leadWidth, gap }) => {
    const bottom = H - 136;
    const leadH = leadSize * (leadSize === 28 ? 1.3 : 1.35) * leadLines;
    const leadY = bottom - leadH;
    const heroBottom = leadY - gap;
    const heroH = heroSize * 2;
    return { leadY, leadH, heroY: heroBottom - heroH, heroH, heroWidth, leadWidth };
  };

  const list = [];

  /* Title */
  {
    const s = heroStack({ heroSize: 68, leadSize: 28, leadLines: 2, gap: 44 });
    list.push({
      name: 'Title', bg: gradientOf(sec), logo: 'small', footer: false,
      elements: [
        { ...kicker(PAD.left, s.heroY - 24 - 20, 780, 'Workshop · Date'), levels: [{ ...st.kicker, run: { ...st.kicker.run, color: alpha(0.8) } }] },
        { key: 'title', ph: { type: 'ctrTitle' }, box: { x: PAD.left, y: s.heroY, w: 780, h: s.heroH }, levels: [st.hero(68)], prompt: ['Title of the talk'], body: { anchor: 'b', fit: 'shrink' } },
        { key: 'subtitle', ph: { type: 'subTitle', idx: 1 }, box: { x: PAD.left, y: s.leadY, w: 520, h: s.leadH }, levels: [st.lead], prompt: ['One sentence that says what this is about.'] },
      ],
    });
  }

  /* Section */
  {
    const s = heroStack({ heroSize: 64, leadSize: 28, leadLines: 2, gap: 44 });
    list.push({
      name: 'Section', bg: gradientOf(sec), logo: 'small', footer: footer(),
      elements: [
        { key: 'number', ph: { type: 'body', idx: 13 }, box: { x: PAD.left - 6, y: s.heroY + 64 - 16 - 140, w: 400, h: 140 }, body: { anchor: 'b' },
          levels: [{ marL: 0, indent: 0, line: { px: 140 }, before: 0, bullet: false, run: { font: FONT.condensedLight, size: 140, color: ci.primary } }], prompt: ['01'] },
        { key: 'title', ph: { type: 'title' }, box: { x: PAD.left, y: s.heroY + 64, w: 1000, h: 64 }, levels: [st.hero(64)], prompt: ['Chapter title'], body: { anchor: 'b', fit: 'shrink' } },
        { key: 'subtitle', ph: { type: 'body', idx: 14 }, box: { x: PAD.left, y: s.leadY, w: 520, h: s.leadH }, levels: [st.lead], prompt: ['What this chapter is about'] },
      ],
    });
  }

  /* Content */
  const contentLayout = () => ({
    name: 'Content', logo: 'small', footer: footer(),
    elements: [...header(), content({ x: PAD.left, y: 192, w: INNER_W, h: H - PAD.bottom - 192 }, bodyPrompt)],
  });
  list.push(contentLayout());

  /* Columns */
  const columnsLayout = (n) => {
    const gap = 56;
    const w = (INNER_W - gap * (n - 1)) / n;
    const els = [...header()];
    for (let i = 0; i < n; i++) {
      const x = PAD.left + i * (w + gap);
      els.push({ key: `label${i + 1}`, ph: { type: 'body', idx: 20 + i * 2, sz: 'quarter' }, box: { x, y: 192, w, h: 21 }, levels: [st.label()], prompt: [`Column ${i + 1}`] });
      els.push({ key: `col${i + 1}`, ph: { idx: 21 + i * 2, sz: n === 2 ? 'half' : 'quarter' }, box: { x, y: 231, w, h: H - PAD.bottom - 231 }, levels: st.body(), prompt: bodyPrompt });
    }
    return { name: n === 2 ? 'Two Columns' : 'Three Columns', logo: 'small', footer: footer(), elements: els };
  };
  list.push(columnsLayout(2), columnsLayout(3));

  /* Statement */
  const statementLayout = () => {
    const lineH = 54 * 1.12;
    return {
      name: 'Statement', logo: 'small', footer: footer(),
      elements: [
        kicker(),
        { key: 'statement', ph: { type: 'body', idx: 14 }, box: { x: PAD.left, y: H / 2 - lineH / 2, w: 24 * 0.444 * 54 + 31, h: lineH },
          geom: 'leftBar', fill: null, ln: { width: 3, color: ci.primary }, body: { anchor: 'ctr', insets: [0, 0, 0, 28], fit: 'shape' },
          levels: [{ marL: 0, indent: 0, line: { px: lineH }, before: 0, bullet: false, run: { font: FONT.condensedLight, size: 54, color: 'tx1' } }],
          prompt: ['One sentence, large.'] },
      ],
    };
  };
  list.push(statementLayout());

  /* Quote */
  const quoteLayout = () => {
    const qH = 48 * 3;
    const blockH = qH + 28 + 30 * 2;
    const y = (H - blockH) / 2;
    const inset = 3 + 0.9 * 27;
    const w = 34 * 0.444 * 40 + inset + 10;
    const bar = { geom: 'leftBar', fill: null, ln: { width: 3, color: ci.primary } };
    return {
      name: 'Quote', logo: 'small', footer: footer(),
      elements: [
        kicker(),
        { key: 'quote', ph: { type: 'body', idx: 14 }, box: { x: PAD.left, y, w, h: qH }, ...bar, body: { anchor: 'b', insets: [0, 0, 0, inset] },
          levels: [{ marL: 0, indent: 0, line: { px: 48 }, before: 0, bullet: false, run: { font: FONT.condensedLight, size: 40, italic: true, color: 'tx1' } }],
          prompt: ['«A short quote in one or two sentences.»'] },
        { key: 'by', ph: { type: 'body', idx: 15 }, box: { x: PAD.left, y: y + qH, w, h: 58 }, ...bar, body: { anchor: 'b', insets: [0, 0, 0, inset] }, levels: [st.text(22, 1, { font: FONT.condensedSemiBold, color: 'tx1' })], prompt: ['First name Last name'] },
        { key: 'role', ph: { type: 'body', idx: 16 }, box: { x: PAD.left, y: y + qH + 58, w, h: 30 }, ...bar, body: { anchor: 't', insets: [0, 0, 0, inset] }, levels: [st.text(22, 0.7)], prompt: ['Role, company'] },
      ],
    };
  };
  list.push(quoteLayout());

  /* Feature */
  {
    const s = heroStack({ heroSize: 56, leadSize: 26, leadLines: 3, gap: 24 });
    list.push({
      name: 'Feature', bg: gradientOf(ci.hues.steel), logo: 'small', footer: footer(),
      elements: [
        kicker(PAD.left, s.heroY - 24 - 20, 700),
        { key: 'title', ph: { type: 'title' }, box: { x: PAD.left, y: s.heroY, w: 18 * 0.571 * 56 + 10, h: s.heroH }, levels: [st.hero(56)], prompt: ['One key message'], body: { anchor: 'b', fit: 'shrink' } },
        { key: 'text', ph: { type: 'body', idx: 14 }, box: { x: PAD.left, y: s.leadY, w: 46 * 0.444 * 26 + 10, h: s.leadH }, levels: [st.text(26, 0.7)], prompt: ['Two or three sentences that explain it.'] },
      ],
    });
  }

  /* Media */
  for (const side of ['left', 'right']) {
    const imgW = W * 0.46;
    const imgX = side === 'left' ? 0 : W - imgW;
    const textX = side === 'left' ? imgW + 64 : PAD.left;
    const textW = W - imgW - 64 - 80;
    list.push({
      name: side === 'left' ? 'Media' : 'Media Right', logo: 'small',
      footer: side === 'left' ? footer(textX) : footer(PAD.left, textX + textW),
      elements: [
        { key: 'image', ph: { type: 'pic', idx: 17 }, box: { x: imgX, y: 0, w: imgW, h: H }, geom: 'rect', fill: gradientOf(sec), body: { anchor: 'ctr' },
          levels: [{ ...st.label(alpha(0.7), 13), align: 'ctr' }], prompt: ['Picture'] },
        kicker(textX, 200, textW),
        title(textX, 244, textW, 106),
        content({ x: textX, y: 382, w: textW, h: H - PAD.bottom - 382 }, bodyPrompt),
      ],
    });
  }

  /* Stats */
  const statsLayout = (n) => {
    const gap = 24;
    const w = (INNER_W - gap * (n - 1)) / n;
    const els = [...header()];
    for (let i = 0; i < n; i++) {
      const hue = ci.hues[HUE_ORDER[i]];
      const x = PAD.left + i * (w + gap);
      els.push({ name: `Card ${i + 1}`, box: { x, y: 192, w, h: 244 }, geom: 'leftBar', fill: ci.card, ln: { width: 3, color: hue.button } });
      els.push({ key: `label${i + 1}`, ph: { type: 'body', idx: 20 + i * 3, sz: 'quarter' }, box: { x: x + 32, y: 220, w: w - 64, h: 21 }, levels: [st.label(hue.ink)], prompt: ['Label'] });
      els.push({ key: `value${i + 1}`, ph: { type: 'body', idx: 21 + i * 3, sz: 'quarter' }, box: { x: x + 32, y: 259, w: w - 64, h: 76 },
        levels: [{ marL: 0, indent: 0, line: { px: 76 }, before: 0, bullet: false, run: { font: FONT.heroBold, size: 76, color: 'tx1' } }], prompt: ['42'] });
      els.push({ key: `text${i + 1}`, ph: { type: 'body', idx: 22 + i * 3, sz: 'quarter' }, box: { x: x + 32, y: 351, w: w - 64, h: 56 }, levels: [st.text(21, 0.7)], prompt: ['What the figure means'] });
    }
    return { name: n === 3 ? 'Stats' : 'Stats (4)', logo: 'small', footer: footer(), elements: els };
  };
  list.push(statsLayout(3), statsLayout(4));

  /* Agenda */
  list.push({
    name: 'Agenda', logo: 'small', footer: footer(),
    elements: [
      kicker(),
      { ...title(), prompt: ['Agenda'] },
      { key: 'body', ph: { type: 'body', idx: 1 }, box: { x: PAD.left, y: 236, w: INNER_W, h: 360 }, body: { anchor: 'ctr', cols: 2, colGap: 56 },
        levels: [{ marL: 86, indent: -86, line: pct(1.2), before: 32, bullet: { autoNum: 'arabicPlain', color: ci.primary, font: FONT.condensedLight, sizePct: (44 / 30) * 100 },
          run: { font: FONT.condensedMedium, size: 30, color: 'tx1' } }],
        prompt: ['First chapter', 'Second chapter', 'Third chapter', 'Fourth chapter'] },
    ],
  });

  /* Title Only, Blank */
  const titleOnly = () => ({ name: 'Title Only', logo: 'small', footer: footer(), elements: header() });
  list.push(titleOnly());
  list.push({ name: 'Blank', logo: 'small', footer: footer(), elements: [] });

  /* End */
  const endLayout = () => {
    const cols = [['E-Mail', 'moin@lionizers.com'], ['Phone', '+49 40 32 50 84 23'], ['Web', 'lionizers.com']];
    return {
      name: 'End', logo: 'large', footer: false,
      elements: [
        { key: 'title', ph: { type: 'title' }, box: { x: PAD.left, y: H / 2 - 64, w: INNER_W, h: 128 }, levels: [st.hero(64)], prompt: ['Thank you.'], body: { anchor: 'ctr' } },
        ...cols.map(([label, value], i) => ({
          name: `Contact ${label}`, textbox: true, box: { x: PAD.left + i * 240, y: H - 64 - 27 - 22, w: 220, h: 49 }, fill: null,
          body: { anchor: 'b' },
          text: [
            { runs: [{ text: label, ...st.label(alpha(0.45)).run }], pPr: { line: { px: 20 }, after: 2 } },
            { runs: [{ text: value, font: FONT.condensed, size: 20, color: alpha(0.85) }], pPr: { line: { px: 27 } } },
          ],
        })),
      ],
    };
  };
  list.push(endLayout());

  // Logo and footer
  for (const l of list) {
    l.logoBox = l.logo === 'large' ? { x: PAD.left, y: PAD.top, w: 220, h: 220 / 6.11 } : LOGO;
    if (l.footer) {
      const { left, right } = l.footer;
      const mid = (left + right) / 2;
      l.elements.push(
        { key: 'footer', ph: { type: 'ftr', idx: 11, sz: 'quarter' }, box: { x: left, y: H - 32 - 15, w: mid - left, h: 15 }, levels: [st.footer], body: { anchor: 'b' } },
        { key: 'slideNumber', ph: { type: 'sldNum', idx: 12, sz: 'quarter' }, box: { x: mid, y: H - 32 - 15, w: right - mid, h: 15 }, levels: [{ ...st.footer, align: 'r' }], body: { anchor: 'b' },
          slideNumber: true },
      );
    }
  }
  return list;
}

const rPrInline = (run) => rPr(run, 'a:rPr');

/* ------------------------------------------------------------------ */
/* Parts                                                                */
/* ------------------------------------------------------------------ */

export class Part {
  constructor(pkg, path) {
    this.pkg = pkg;
    this.path = path;
    this.next = 2;
  }
  id() {
    return this.next++;
  }
  /** Adds an image once per package. media: { png | jpeg, svg?, key? }. Returns rIds { png, svg }. */
  image(media, name = media.key) {
    const ext = media.jpeg ? 'jpeg' : 'png';
    const raster = `ppt/media/${name}.${ext}`;
    const svg = `ppt/media/${name}.svg`;
    if (!this.pkg.files.has(raster)) {
      this.pkg.add(raster, media.jpeg ?? media.png);
      if (media.svg) this.pkg.add(svg, media.svg);
    }
    return {
      png: this.pkg.rel(this.path, RT.image, raster),
      svg: media.svg ? this.pkg.rel(this.path, RT.image, svg) : undefined,
    };
  }
}

/** Colour map of the notes pages (dark text on white). */
const LIGHT_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
const DARK_MAP = 'bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

function elementXml(part, el) {
  if (el.raw) return el.raw(part);
  const prompt = el.prompt ?? (el.slideNumber ? [] : undefined);
  let text = el.text ?? prompt;
  if (el.slideNumber) text = [{ runs: [{ field: 'slidenum', text: '‹#›' }] }];
  return shape({
    id: part.id(),
    name: el.name ?? (el.ph ? `${el.key} placeholder` : el.key),
    ph: el.ph ? { ...el.ph, prompt: !!el.prompt } : undefined,
    box: el.box,
    geom: el.geom,
    fill: el.fill === undefined ? undefined : el.fill === null ? null : typeof el.fill === 'string' && el.fill.startsWith('<') ? el.fill : solid(el.fill),
    ln: el.ln,
    body: el.body,
    levels: el.levels,
    text,
    textbox: el.textbox,
  });
}

function layoutXml(part, layout, assets) {
  const kickerBullet = part.image(assets.kicker, 'kicker-bullet');
  const logo = part.image(assets.logoOnDark, 'logo-on-dark');
  const children = [];
  if (layout.logo) children.push(picture({ id: part.id(), name: 'Logo', box: layout.logoBox, png: logo.png, svg: logo.svg, descr: 'Lionizers' }));
  for (const el of layout.elements) children.push(elementXml(part, el));
  const bg = layout.bg ? background(layout.bg) : '';
  const clrMap = '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>';
  const xml =
    XML_HEAD +
    `<p:sldLayout ${NS} preserve="1" userDrawn="1" showMasterSp="0"><p:cSld name="${esc(layout.name)}">${bg}${spTree(children)}</p:cSld>${clrMap}</p:sldLayout>`;
  return xml.replaceAll('__BLIP_kicker__', kickerBullet.png);
}

function masterXml(part, ci, layoutRefs) {
  const st = styles(ci);
  const body = st.body();
  const children = [
    shape({ id: part.id(), name: 'Title', ph: { type: 'title' }, box: { x: PAD.left, y: 108, w: 1040, h: 56 }, body: { anchor: 't', fit: 'shrink' }, text: ['Title of the slide'] }),
    shape({ id: part.id(), name: 'Text', ph: { type: 'body', idx: 1 }, box: { x: PAD.left, y: 192, w: INNER_W, h: H - PAD.bottom - 192 }, text: ['Text', { text: 'Bullet point', level: 1 }, { text: 'Second level', level: 2 }] }),
    shape({ id: part.id(), name: 'Footer', ph: { type: 'ftr', idx: 11, sz: 'quarter' }, box: { x: PAD.left, y: H - 47, w: 560, h: 15 }, body: { anchor: 'b' }, levels: [st.footer] }),
    shape({ id: part.id(), name: 'Slide number', ph: { type: 'sldNum', idx: 12, sz: 'quarter' }, box: { x: 640, y: H - 47, w: 560, h: 15 }, body: { anchor: 'b' }, levels: [{ ...st.footer, align: 'r' }],
      text: [{ runs: [{ field: 'slidenum', text: '‹#›' }] }] }),
  ];
  const titleStyle = lstStyle([st.title], 'p:titleStyle');
  const bodyStyle = lstStyle(body, 'p:bodyStyle');
  const other = { marL: 0, indent: 0, run: { font: FONT.condensed, size: 20, color: 'tx1' } };
  const otherStyle = lstStyle(Array(9).fill(other), 'p:otherStyle');
  const ids = layoutRefs.map((r) => `<p:sldLayoutId id="${r.id}" r:id="${r.rId}"/>`).join('');
  return (
    XML_HEAD +
    `<p:sldMaster ${NS}><p:cSld>${background(solid('bg1'))}${spTree(children)}</p:cSld>` +
    `<p:clrMap ${DARK_MAP}/><p:sldLayoutIdLst>${ids}</p:sldLayoutIdLst>` +
    `<p:hf hdr="0" dt="0"/><p:txStyles>${titleStyle}${bodyStyle}${otherStyle}</p:txStyles></p:sldMaster>`
  );
}

function tableStylesXml(ci) {
  const none = '<a:ln><a:noFill/></a:ln>';
  const lineOf = (a) => `<a:ln w="9525" cmpd="sng"><a:solidFill>${clr({ c: 'tx1', alpha: a })}</a:solidFill></a:ln>`;
  return (
    XML_HEAD +
    `<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="${TABLE_STYLE_ID}">` +
    `<a:tblStyle styleId="${TABLE_STYLE_ID}" styleName="Lionizers">` +
    `<a:wholeTbl><a:tcTxStyle><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="tx1"/></a:tcTxStyle>` +
    `<a:tcStyle><a:tcBdr><a:left>${none}</a:left><a:right>${none}</a:right><a:top>${none}</a:top><a:bottom>${none}</a:bottom>` +
    `<a:insideH>${lineOf(0.1)}</a:insideH><a:insideV>${none}</a:insideV></a:tcBdr>` +
    `<a:fill><a:solidFill>${clr(ci.card)}</a:solidFill></a:fill></a:tcStyle></a:wholeTbl>` +
    `<a:firstRow><a:tcTxStyle><a:font><a:latin typeface="${FONT.mono}"/><a:ea typeface=""/><a:cs typeface=""/></a:font><a:srgbClr val="${ci.hues.gold.ink}"/></a:tcTxStyle>` +
    `<a:tcStyle><a:tcBdr><a:bottom>${lineOf(0.2)}</a:bottom></a:tcBdr></a:tcStyle></a:firstRow>` +
    `</a:tblStyle></a:tblStyleLst>`
  );
}

/**
 * Placeholders of a layout, filled. `fill` maps placeholder keys to paragraphs,
 * `boxes` to positions that differ from the layout. Footer and slide number are added.
 */
export function placeholders(part, layout, { fill = {}, boxes = {}, footer, index, bare = false }) {
  const out = [];
  out.ids = {};
  for (const el of layout.elements) {
    if (!el.ph) continue;
    if (bare && (el.key === 'footer' || el.slideNumber)) continue;
    let items = fill[el.key];
    if (el.key === 'footer' && footer) items = [footer];
    if (el.slideNumber) items = [{ runs: [{ field: 'slidenum', text: String(index + 1) }] }];
    if (!items) continue;
    const id = part.id();
    out.ids[el.key] = id;
    out.push(
      shape({
        id, name: el.name ?? el.key, ph: { type: el.ph.type, idx: el.ph.idx, sz: el.ph.sz }, inherit: true,
        box: boxes[el.key],
        text: items.map((it) => (typeof it === 'string' ? { runs: [{ text: it }] } : it)),
      }),
    );
  }
  return out;
}

function slideXml(children, bg) {
  return (
    XML_HEAD +
    `<p:sld ${NS}><p:cSld>${bg ? background(bg) : ''}${spTree(children)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${children.tail ?? ''}</p:sld>`
  );
}

/* ---------- Speaker notes ---------- */

const NOTES_W = 6858000;
const NOTES_H = 9144000;

function notesMasterXml() {
  const img = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>`;
  const body = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Notes</a:t></a:r></a:p></p:txBody></p:sp>`;
  const lvl = (i) => `<a:lvl${i}pPr marL="${(i - 1) * 228600}" algn="l" rtl="0"><a:defRPr sz="1400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="${FONT.condensed}"/></a:defRPr></a:lvl${i}pPr>`;
  return (
    XML_HEAD +
    `<p:notesMaster ${NS}><p:cSld>${background(solid('bg1'))}${spTree([img, body])}</p:cSld>` +
    `<p:clrMap ${LIGHT_MAP}/><p:notesStyle>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl).join('')}</p:notesStyle></p:notesMaster>`
  );
}

/** notes: [{ text, bullet }] */
function notesSlideXml(notes) {
  const paras = notes
    .map((n) =>
      n.bullet
        ? `<a:p><a:pPr marL="228600" indent="-228600"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(n.text)}</a:t></a:r></a:p>`
        : `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(n.text)}</a:t></a:r></a:p>`,
    )
    .join('');
  const img = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>`;
  const body = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
  return XML_HEAD + `<p:notes ${NS}><p:cSld>${spTree([img, body])}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

/**
 * Builds the package.
 * @param {object} ci from loadCI()
 * @param {object} assets { logoOnDark: { png, svg }, logoOnLight: { png, svg } }
 * @param {{ kind: 'template' | 'deck', title?: string, slides?: object[] }} opts
 *   slides (kind 'deck'): [{ layout: name, build(part, layoutSpec, index) → xml[], bg?: fill xml, notes?: [{ text, bullet }] }]
 */
export function buildPackage(ci, assets, { kind = 'template', title = 'Lionizers', slides } = {}) {
  const pkg = new Package();
  pkg.add('docProps/core.xml', coreXml(title), 'core');
  pkg.add('docProps/app.xml', appXml(), 'app');
  pkg.rel('', RT.officeDocument, 'ppt/presentation.xml');
  pkg.rel('', RT.core, 'docProps/core.xml');
  pkg.rel('', RT.app, 'docProps/app.xml');

  const pres = 'ppt/presentation.xml';
  const masterPath = 'ppt/slideMasters/slideMaster1.xml';
  const themePath = 'ppt/theme/theme1.xml';
  const masterRId = pkg.rel(pres, RT.slideMaster, masterPath);
  pkg.add(themePath, themeXml(ci), 'theme');
  pkg.rel(masterPath, RT.theme, themePath);
  pkg.rel(pres, RT.theme, themePath);

  const specs = layouts(ci);
  const layoutRefs = [];
  const layoutPathByName = new Map();
  specs.forEach((layout, i) => {
    const path = `ppt/slideLayouts/slideLayout${i + 1}.xml`;
    const part = new Part(pkg, path);
    pkg.rel(path, RT.slideMaster, masterPath);
    pkg.add(path, layoutXml(part, layout, assets), 'slideLayout');
    layoutRefs.push({ id: 2147483649 + i, rId: pkg.rel(masterPath, RT.slideLayout, path) });
    layoutPathByName.set(layout.name, { path, layout });
  });
  pkg.add(masterPath, masterXml(new Part(pkg, masterPath), ci, layoutRefs), 'slideMaster');

  const slideIds = [];
  const list = kind === 'deck' ? slides : [];
  let notesMasterRId;
  list.forEach((slide, i) => {
    const ref = layoutPathByName.get(slide.layout);
    if (!ref) throw new Error(`Unknown layout ${slide.layout}`);
    const path = `ppt/slides/slide${i + 1}.xml`;
    const part = new Part(pkg, path);
    pkg.rel(path, RT.slideLayout, ref.path);
    pkg.add(path, slideXml(slide.build(part, ref.layout, i), slide.bg), 'slide');
    slideIds.push(`<p:sldId id="${256 + i}" r:id="${pkg.rel(pres, RT.slide, path)}"/>`);
    if (slide.notes?.length) {
      const nmPath = 'ppt/notesMasters/notesMaster1.xml';
      if (!notesMasterRId) {
        pkg.add(nmPath, notesMasterXml(), 'notesMaster');
        pkg.add('ppt/theme/theme2.xml', themeXml(ci), 'theme');
        pkg.rel(nmPath, RT.theme, 'ppt/theme/theme2.xml');
        notesMasterRId = pkg.rel(pres, RT.notesMaster, nmPath);
      }
      const nPath = `ppt/notesSlides/notesSlide${i + 1}.xml`;
      pkg.add(nPath, notesSlideXml(slide.notes), 'notesSlide');
      pkg.rel(nPath, RT.notesMaster, nmPath);
      pkg.rel(nPath, RT.slide, path);
      pkg.rel(path, RT.notesSlide, nPath);
    }
  });

  pkg.add('ppt/presProps.xml', presPropsXml(), 'presProps');
  pkg.add('ppt/viewProps.xml', viewPropsXml(), 'viewProps');
  pkg.add('ppt/tableStyles.xml', tableStylesXml(ci), 'tableStyles');
  pkg.rel(pres, RT.presProps, 'ppt/presProps.xml');
  pkg.rel(pres, RT.viewProps, 'ppt/viewProps.xml');
  pkg.rel(pres, RT.tableStyles, 'ppt/tableStyles.xml');

  const defaultTextStyle = lstStyle(Array(9).fill({ marL: 0, indent: 0, run: { font: FONT.condensed, size: 24, color: 'tx1' } }), 'p:defaultTextStyle');
  pkg.add(
    pres,
    XML_HEAD +
      `<p:presentation ${NS} saveSubsetFonts="1">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${masterRId}"/></p:sldMasterIdLst>` +
      (notesMasterRId ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRId}"/></p:notesMasterIdLst>` : '') +
      (slideIds.length ? `<p:sldIdLst>${slideIds.join('')}</p:sldIdLst>` : '') +
      `<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>${defaultTextStyle}</p:presentation>`,
    kind === 'template' ? 'template' : 'presentation',
  );
  return pkg;
}
