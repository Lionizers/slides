/**
 * Runs in the print view of Lionizers Slides (?print&notes). Reads every slide into a
 * plain model: the layout, the parts that go into placeholders, and all other content
 * as positioned boxes, texts, images and tables. Positions are CSS px of the 1280 × 720 slide.
 *
 * Defines window.__lzExtract(): Promise<Slide[]>.
 */
(() => {
  /* ---------- Colours ---------- */

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  /** Any CSS colour → { hex, alpha } or null (transparent). */
  function color(str) {
    if (!str || str === 'transparent' || str === 'none') return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = str;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return null;
    const hex = [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, alpha: Math.round((a / 255) * 1000) / 1000 };
  }

  /** Colour `c` (with alpha) on top of an opaque colour `under`, as one opaque colour. */
  function over(c, under) {
    if (!c) return null;
    const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
    const mix = [0, 2, 4].map((i) => Math.round(ch(c.hex, i) * c.alpha + ch(under.hex, i) * (1 - c.alpha)));
    return { hex: mix.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(), alpha: 1 };
  }
  let canvasColor = { hex: '1A1A1A', alpha: 1 };
  const onCanvas = (c) => over(c, canvasColor);

  /**
   * The opaque colour behind an element: the slide colour with the backgrounds of all
   * ancestors on top. Boxes get opaque fills, so they do not shine through each other
   * (PowerPoint's Morph shows that while they move).
   */
  function backdrop(el) {
    const chain = [];
    for (let e = el.parentElement; e && !e.classList.contains('lz'); e = e.parentElement) chain.unshift(e);
    let c = canvasColor;
    for (const e of chain) {
      const bg = color(getComputedStyle(e).backgroundColor);
      if (bg) c = over(bg, c);
    }
    return c;
  }

  /* ---------- Geometry ---------- */

  let origin = { left: 0, top: 0 };
  const round = (v) => Math.round(v * 100) / 100;
  function rectOf(r) {
    return { x: round(r.left - origin.left), y: round(r.top - origin.top), w: round(r.width), h: round(r.height) };
  }
  const box = (el) => rectOf(el.getBoundingClientRect());
  /** Content box: border box minus border and padding. */
  function contentBox(el, cs = getComputedStyle(el)) {
    const b = box(el);
    const px = (p) => parseFloat(cs[p]) || 0;
    const l = px('borderLeftWidth') + px('paddingLeft');
    const t = px('borderTopWidth') + px('paddingTop');
    const r = px('borderRightWidth') + px('paddingRight');
    const btm = px('borderBottomWidth') + px('paddingBottom');
    return { x: b.x + l, y: b.y + t, w: b.w - l - r, h: b.h - t - btm };
  }

  /* ---------- Text ---------- */

  function runStyle(el) {
    const cs = getComputedStyle(el);
    const wdth = cs.fontVariationSettings.match(/"wdth"\s+([\d.]+)/);
    const ls = parseFloat(cs.letterSpacing);
    return {
      family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      weight: Number(cs.fontWeight),
      wdth: wdth ? Number(wdth[1]) : 100,
      italic: cs.fontStyle === 'italic',
      size: parseFloat(cs.fontSize),
      color: color(cs.color),
      caps: cs.textTransform === 'uppercase',
      spacing: Number.isFinite(ls) ? ls : 0,
      underline: cs.textDecorationLine.includes('underline'),
      highlight: cs.display.startsWith('inline') ? onCanvas(color(cs.backgroundColor)) : null,
    };
  }

  function lineHeight(el) {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight);
    return Number.isFinite(lh) ? lh : parseFloat(cs.fontSize) * 1.2;
  }

  /** Text of ::before / ::after when it is a plain string. */
  function pseudoText(el, which) {
    const cs = getComputedStyle(el, which);
    if (cs.display === 'none' || cs.position === 'absolute') return null;
    const m = cs.content.match(/^"(.*)"$/);
    return m && m[1] ? m[1] : null;
  }

  const isAbsolute = (el) => ['absolute', 'fixed'].includes(getComputedStyle(el).position);
  const isHidden = (el) => {
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
  };
  const isMedia = (el) => el.tagName === 'svg' || el.tagName === 'IMG';

  /** Elements whose display makes them blocks inside a parent (not text). */
  function isBlockChild(el) {
    if (isHidden(el) || isAbsolute(el)) return false;
    if (el.tagName === 'BR' || isMedia(el)) return false;
    const d = getComputedStyle(el).display;
    if (d === 'contents') return [...el.children].some(isBlockChild);
    return !d.startsWith('inline');
  }

  function hasDirectText(el) {
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
  }

  /** A block whose children are all inline: one paragraph of text. */
  function isTextBlock(el) {
    if (!el.textContent.trim() && !pseudoText(el, '::before')) return false;
    return ![...el.children].some(isBlockChild);
  }

  /**
   * Line breaks the browser made in `el` (text-wrap: balance cannot be reproduced by
   * PowerPoint): a Set of [textNode, offset] where a new line starts.
   */
  function lineStarts(el) {
    const starts = new Map();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    // A word starts a new line when it begins clearly below the top of the current line.
    // The line height is that of its largest word (smaller text sits lower on the baseline).
    let lineTop = null;
    let lineH = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const re = /\S+/g;
      let m;
      while ((m = re.exec(n.data))) {
        range.setStart(n, m.index);
        range.setEnd(n, m.index + 1);
        const r = range.getClientRects()[0];
        if (!r) continue;
        if (lineTop !== null && r.top > lineTop + lineH * 0.6) {
          if (!starts.has(n)) starts.set(n, []);
          starts.get(n).push(m.index);
          lineTop = r.top;
          lineH = r.height;
        } else if (lineTop === null) {
          lineTop = r.top;
          lineH = r.height;
        } else {
          lineTop = Math.min(lineTop, r.top);
          lineH = Math.max(lineH, r.height);
        }
      }
    }
    return starts;
  }

  /**
   * Runs of an inline subtree. Inline images become a spacer run plus an image in `media`.
   * `skip(el)` leaves out elements (nested lists).
   */
  function runsOf(el, { media = [], skip = () => false, breaks = null, pre = false } = {}) {
    const runs = [];
    const before = pseudoText(el, '::before');
    if (before) runs.push({ text: before, ...runStyle(el) });
    const visit = (node) => {
      // Gap between the items of an inline flex row (value and unit of a stat).
      const ncs = node.nodeType === 1 ? getComputedStyle(node) : null;
      const gap = ncs && ncs.display.includes('flex') ? parseFloat(ncs.columnGap) || 0 : 0;
      let first = true;
      for (const n of node.childNodes) {
        if (gap && n.nodeType === 1 && !first) runs.push({ text: '\u2003', ...runStyle(node), size: gap, spacer: true });
        if (n.nodeType === 1 || (n.nodeType === 3 && n.data.trim())) first = false;
        if (n.nodeType === 3) {
          let text = n.data;
          if (!pre) text = text.replace(/\s+/g, ' ');
          if (!text) continue;
          const style = runStyle(n.parentElement);
          const cuts = breaks?.get(n);
          if (cuts) {
            let last = 0;
            for (const c of cuts) {
              const part = n.data.slice(last, c).replace(/\s+/g, ' ');
              if (part) runs.push({ text: part, ...style });
              runs.push({ br: true });
              last = c;
            }
            const rest = n.data.slice(last).replace(/\s+/g, ' ');
            if (rest) runs.push({ text: rest, ...style });
          } else {
            runs.push({ text, ...style });
          }
          continue;
        }
        if (n.nodeType !== 1 || isHidden(n) || skip(n)) continue;
        if (n.tagName === 'BR') {
          runs.push({ br: true });
          continue;
        }
        if (isMedia(n)) {
          media.push(n);
          if (!isAbsolute(n)) {
            // Keep the room of the inline icon: an em space as wide as the icon.
            const r = n.getBoundingClientRect();
            const ms = parseFloat(getComputedStyle(n).marginRight) || 0;
            runs.push({ text: ' ', ...runStyle(node.nodeType === 1 ? node : el), size: r.width + ms, spacer: true });
          }
          continue;
        }
        if (isAbsolute(n)) {
          media.push(n);
          continue;
        }
        const b = pseudoText(n, '::before');
        if (b) runs.push({ text: b, ...runStyle(n) });
        visit(n);
        const a = pseudoText(n, '::after');
        if (a) runs.push({ text: a, ...runStyle(n) });
      }
    };
    visit(el);
    const after = pseudoText(el, '::after');
    if (after) runs.push({ text: after, ...runStyle(el) });
    if (!pre) {
      // Collapse whitespace across runs and trim the ends of the paragraph and of each line.
      let prevSpace = true;
      for (const r of runs) {
        if (r.br) {
          prevSpace = true;
          continue;
        }
        if (r.spacer) {
          prevSpace = false;
          continue;
        }
        if (prevSpace) r.text = r.text.replace(/^ /, '');
        prevSpace = r.text.endsWith(' ');
      }
      for (let i = 0; i < runs.length; i++) {
        const next = runs.slice(i + 1).find((r) => r.br || r.text);
        if (runs[i].text && (!next || next.br)) runs[i].text = runs[i].text.replace(/ $/, '');
      }
    }
    // No line break at the start, none twice in a row.
    const out = [];
    for (const r of runs.filter((x) => x.br || x.text)) {
      if (r.br && (!out.length || out.at(-1).br)) continue;
      out.push(r);
    }
    while (out.length && out.at(-1).br) out.pop();
    return out;
  }

  function paragraph(el, opts = {}) {
    const cs = getComputedStyle(el);
    // The browser's line breaks are kept: Barlow GX and the static Barlow of PowerPoint
    // differ a little in width, and text-wrap: balance has no equivalent.
    const pre = cs.whiteSpace.startsWith('pre');
    let runs = runsOf(el, { ...opts, breaks: pre ? null : lineStarts(el), pre });
    if (pre) {
      // Preformatted text: newlines become line breaks.
      runs = runs.flatMap((r) => {
        if (!r.text || !r.text.includes('\n')) return [r];
        return r.text.split('\n').flatMap((t, i) => (i ? [{ br: true }, ...(t ? [{ ...r, text: t }] : [])] : t ? [{ ...r, text: t }] : []));
      });
      while (runs.length && runs.at(-1).br) runs.pop();
    }
    return {
      runs,
      align: { center: 'ctr', right: 'r', end: 'r', justify: 'just' }[cs.textAlign] ?? 'l',
      lineHeight: lineHeight(el),
      nowrap: cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre',
    };
  }

  /* ---------- Lists ---------- */

  function isSimpleList(list) {
    return [...list.children].every((li) => {
      if (li.tagName !== 'LI' || isHidden(li)) return false;
      const marker = getComputedStyle(li, '::before');
      if (marker.display === 'none') return false;
      if (li.querySelector('svg, img')) return false;
      return [...li.children].every((c) => (c.tagName === 'UL' || c.tagName === 'OL' ? isSimpleList(c) : !isBlockChild(c)));
    });
  }

  /** Paragraphs of a simple list, nested lists as deeper levels. */
  function listParagraphs(list, level = 1, out = [], gapBefore = null, listLeft = list.getBoundingClientRect().left) {
    const ordered = list.tagName === 'OL';
    [...list.children].forEach((li, i) => {
      const cs = getComputedStyle(li);
      const marker = getComputedStyle(li, '::before');
      const pad = parseFloat(cs.paddingLeft) || 0;
      const p = paragraph(li, { skip: (c) => c.tagName === 'UL' || c.tagName === 'OL' });
      p.level = level;
      p.step = stepOf(li);
      p.marL = li.getBoundingClientRect().left - listLeft + pad;
      p.indent = -pad;
      p.spaceBefore = i === 0 ? (gapBefore ?? 0) : parseFloat(cs.marginTop) || 0;
      if (ordered) {
        const ms = runStyle(li);
        p.number = {
          text: String(i + 1).padStart(2, '0'),
          ...ms,
          size: parseFloat(marker.fontSize),
          weight: Number(marker.fontWeight),
          color: color(marker.color),
        };
      } else {
        p.bullet = { color: color(marker.backgroundColor) ?? color(marker.color) };
      }
      out.push(p);
      for (const c of li.children) {
        if (c.tagName === 'UL' || c.tagName === 'OL') listParagraphs(c, level + 1, out, parseFloat(getComputedStyle(c).marginTop) || 0, listLeft);
      }
    });
    return out;
  }

  /* ---------- Boxes, images, tables ---------- */

  function evalLength(expr, size) {
    const js = expr
      .replace(/calc\(/g, '(')
      .replace(/([\d.]+)%/g, (_, v) => `(${v}*${size}/100)`)
      .replace(/([\d.]+)px/g, '$1');
    if (!/^[\d.\s+\-*/()]+$/.test(js)) return 0;
    return Function(`return (${js})`)();
  }

  function clipPolygon(cs, b) {
    const m = cs.clipPath.match(/^polygon\((.*)\)$/);
    if (!m) return null;
    const pts = [];
    let depth = 0;
    let cur = '';
    for (const ch of m[1]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        pts.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    pts.push(cur.trim());
    return pts.map((p) => {
      const parts = p.match(/(calc\([^)]*\)|[^\s]+)/g);
      return [evalLength(parts[0], b.w), evalLength(parts[1], b.h)];
    });
  }

  function hasBox(el) {
    const cs = getComputedStyle(el);
    if (color(cs.backgroundColor) || cs.backgroundImage.includes('gradient')) return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
  }

  /** Background and borders of an element as a box shape, or null. */
  function boxShape(el) {
    const cs = getComputedStyle(el);
    const b = box(el);
    if (b.w < 0.5 || b.h < 0.5) return null;
    const fill = el.closest('.lz-gradient') ? color(cs.backgroundColor) : over(color(cs.backgroundColor), backdrop(el));
    let gradient = null;
    if (cs.backgroundImage.includes('gradient')) {
      gradient = {
        from: color(cs.getPropertyValue('--accent-surface-deep').trim()),
        to: color(cs.getPropertyValue('--accent-surface').trim()),
        angle: 135,
      };
    }
    const sides = {};
    for (const s of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs[`border${s}Width`]);
      if (w > 0 && cs[`border${s}Style`] !== 'none') {
        const c = color(cs[`border${s}Color`]);
        if (c) sides[s[0].toLowerCase()] = { width: w, color: c };
      }
    }
    if (!fill && !gradient && !Object.keys(sides).length) return null;
    return {
      type: 'box', box: b, fill, gradient, sides,
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      poly: cs.clipPath && cs.clipPath !== 'none' ? clipPolygon(cs, b) : null,
    };
  }

  const SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-dasharray'];

  function svgShape(svg) {
    const r = svg.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return null;
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((s, i) => {
      const cs = getComputedStyle(s);
      for (const p of SVG_PROPS) dst[i].setAttribute(p, cs.getPropertyValue(p));
      for (const p of ['fill', 'stroke']) {
        const v = cs.getPropertyValue(p);
        if (v === 'none' || v.startsWith('url(')) continue;
        const c = color(v);
        if (!c) {
          dst[i].setAttribute(p, 'none');
          continue;
        }
        dst[i].setAttribute(p, `#${c.hex}`);
        dst[i].setAttribute(`${p}-opacity`, String(c.alpha * (parseFloat(cs.getPropertyValue(`${p}-opacity`)) || 1)));
      }
      dst[i].removeAttribute('class');
      dst[i].removeAttribute('style');
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    let b = rectOf(r);
    if (!svg.getAttribute('viewBox')) {
      // Drawn in px without a viewBox (connectors): crop to what is drawn, lines may overflow.
      const bb = svg.getBBox();
      const sw = 4;
      const vb = { x: bb.x - sw, y: bb.y - sw, w: bb.width + 2 * sw, h: bb.height + 2 * sw };
      clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      b = { x: round(b.x + vb.x), y: round(b.y + vb.y), w: round(vb.w), h: round(vb.h) };
    }
    clone.setAttribute('width', b.w);
    clone.setAttribute('height', b.h);
    clone.removeAttribute('class');
    return { type: 'svg', box: b, svg: clone.outerHTML };
  }

  async function imageShape(img) {
    const cs = getComputedStyle(img);
    const b = contentBox(img, cs);
    if (b.w < 0.5 || b.h < 0.5) return null;
    const res = await fetch(img.currentSrc || img.src);
    const mime = res.headers.get('content-type') || '';
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const nw = img.naturalWidth || b.w;
    const nh = img.naturalHeight || b.h;
    let crop = null;
    let shown = b;
    if (cs.objectFit === 'cover') {
      const s = Math.max(b.w / nw, b.h / nh);
      const cw = (b.w / s) / nw;
      const ch = (b.h / s) / nh;
      crop = { l: (1 - cw) / 2, r: (1 - cw) / 2, t: (1 - ch) / 2, b: (1 - ch) / 2 };
    } else if (cs.objectFit === 'contain') {
      const s = Math.min(b.w / nw, b.h / nh);
      const w = nw * s;
      const h = nh * s;
      shown = { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
    }
    return { type: 'image', box: shown, crop, mime, data: btoa(bin), alt: img.alt || '' };
  }

  function tableShape(table) {
    const rows = [...table.rows].filter((tr) => !isHidden(tr));
    if (!rows.length) return null;
    const first = [...rows[0].cells];
    const x0 = first[0].getBoundingClientRect().left;
    const media = [];
    const out = {
      type: 'table',
      box: null,
      cols: first.map((c) => round(c.getBoundingClientRect().width)),
      rows: rows.map((tr) => ({
        h: round(tr.getBoundingClientRect().height),
        cells: [...tr.cells].map((td) => {
          const cs = getComputedStyle(td);
          const px = (p) => parseFloat(cs[p]) || 0;
          const borders = {};
          for (const s of ['Top', 'Right', 'Bottom', 'Left']) {
            const w = px(`border${s}Width`);
            if (w > 0 && cs[`border${s}Style`] !== 'none') borders[s[0].toLowerCase()] = { width: w, color: color(cs[`border${s}Color`]) };
          }
          return {
            span: td.colSpan,
            header: td.tagName === 'TH',
            pad: [px('paddingTop'), px('paddingRight'), px('paddingBottom'), px('paddingLeft')],
            valign: { top: 't', middle: 'ctr', bottom: 'b' }[cs.verticalAlign] ?? 't',
            fill: color(cs.backgroundColor),
            borders,
            para: paragraph(td, { media }),
          };
        }),
      })),
    };
    const y0 = rows[0].getBoundingClientRect().top;
    const last = rows.at(-1).getBoundingClientRect();
    const right = Math.max(...first.map((c) => c.getBoundingClientRect().right));
    out.box = rectOf({ left: x0, top: y0, width: right - x0, height: last.bottom - y0 });
    return { table: out, media };
  }

  /* ---------- Steps ---------- */

  /** Step number of each [data-step] element, as applySteps() in lionizers-slides computes it. */
  let stepNumbers = new Map();
  function computeSteps(lz) {
    stepNumbers = new Map();
    let count = 0;
    for (const el of lz.querySelectorAll('[data-step]')) {
      const fixed = /^\d+$/.test(el.dataset.step) ? Number(el.dataset.step) : 0;
      const n = fixed || count + 1;
      count = Math.max(count, n);
      stepNumbers.set(el, n);
    }
  }
  /** The click on which an element appears: the highest step of it and its ancestors (0: from the start). */
  function stepOf(el) {
    let n = 0;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (stepNumbers.has(e)) n = Math.max(n, stepNumbers.get(e));
      if (e.classList?.contains('lz')) break;
    }
    return n;
  }
  const withStep = (shape, el) => (shape ? Object.assign(shape, { step: stepOf(el) }) : shape);

  /* ---------- Generic walk ---------- */

  async function walk(el, out, skip) {
    if (el.nodeType !== 1 || skip.has(el) || isHidden(el)) return;
    if (el.dataset?.morph && !el.__lzInMorph) {
      // Everything of a morph element goes into one group, named for PowerPoint's Morph transition.
      el.__lzInMorph = true;
      const shapes = [];
      await walk(el, shapes, skip);
      delete el.__lzInMorph;
      if (shapes.length) out.push({ type: 'group', morph: el.dataset.morph, box: box(el), shapes, step: stepOf(el) });
      return;
    }
    if (window.__lzSmartArt && (el.classList.contains('lz-process') || el.dataset?.smartart)) {
      // Process and timeline as SmartArt: one node per child, with the rendered shapes as its look.
      const nodes = [];
      for (const child of el.children) {
        if (isHidden(child)) continue;
        const shapes = [];
        await walk(child, shapes, skip);
        nodes.push({ box: box(child), shapes });
      }
      out.push({ type: 'smartart', kind: el.classList.contains('lz-process') ? 'process' : el.dataset.smartart, box: box(el), nodes, step: stepOf(el) });
      return;
    }
    const tag = el.tagName;
    if (tag === 'svg') {
      const s = withStep(svgShape(el), el);
      if (s) out.push(s);
      return;
    }
    if (tag === 'IMG') {
      const s = withStep(await imageShape(el), el);
      if (s) out.push(s);
      return;
    }
    const cs = getComputedStyle(el);
    if (cs.display !== 'contents') {
      const s = withStep(boxShape(el), el);
      if (s) out.push(s);
    }
    if (tag === 'TABLE') {
      const t = tableShape(el);
      if (t) {
        out.push(withStep(t.table, el));
        for (const m of t.media) await walk(m, out, skip);
      }
      return;
    }
    if ((tag === 'UL' || tag === 'OL') && isSimpleList(el)) {
      out.push(withStep({ type: 'text', box: contentBox(el), paras: listParagraphs(el) }, el));
      return;
    }
    if (isTextBlock(el)) {
      const media = [];
      const p = paragraph(el, { media });
      if (p.runs.length) out.push(withStep({ type: 'text', box: contentBox(el), paras: [p] }, el));
      for (const m of media) await walk(m, out, skip);
      return;
    }
    for (const c of el.children) await walk(c, out, skip);
  }

  /* ---------- Placeholders ---------- */

  const BLOCK_TEXT = new Set(['P', 'H2', 'H3', 'H4']);

  /** Paragraphs of a container that holds only text blocks and simple lists, else null. */
  const textFlow = (container) => textFlowOf([...container.children]);

  function part(el, extra = {}) {
    if (!el) return null;
    return { box: box(el), paras: [paragraph(el)], ...extra };
  }

  function variantOf(lz) {
    const names = ['title', 'section', 'content', 'columns', 'statement', 'quote', 'feature', 'media', 'stats', 'agenda', 'end'];
    return names.find((n) => lz.classList.contains(n)) ?? 'content';
  }

  async function extractSlide(page) {
    const lz = page.querySelector('.lz');
    origin = lz.getBoundingClientRect();
    computeSteps(lz);
    canvasColor = color(getComputedStyle(lz).backgroundColor) ?? canvasColor;
    const variant = variantOf(lz);
    const q = (s) => lz.querySelector(s);
    const skip = new Set([...lz.querySelectorAll('.lz-logo, .lz-footer, .lz-end-logo')]);
    const parts = {};
    const take = (key, el, extra) => {
      if (!el || isHidden(el) || !el.textContent.trim()) return;
      parts[key] = part(el, extra);
      skip.add(el);
    };

    const kicker = [...lz.querySelectorAll(':scope > .lz-kicker, :scope > .lz-media-text > .lz-kicker')][0];
    if (kicker) {
      skip.add(kicker);
      if (kicker.textContent.trim()) {
        const p = paragraph(kicker);
        if (p.runs[0]?.text === pseudoText(kicker, '::before')) p.runs.shift();
        parts.kicker = { box: box(kicker), paras: [p] };
      }
    }
    take('title', q('.lz-title') ?? q('.lz-hero'));
    take('subtitle', q('.lz-lead'));
    if (variant === 'section') take('number', q('.lz-number'));
    if (variant === 'statement') take('statement', q('.lz-statement'));
    if (variant === 'feature') {
      const t = q('.lz-feature-text');
      const flow = t && textFlow(t);
      if (flow) {
        parts.text = { box: { ...box(t), w: flow.right - box(t).x }, paras: flow };
        skip.add(t);
      }
    }
    if (variant === 'quote') {
      const bq = q('.lz-quote');
      const p = bq?.querySelector('p');
      const by = bq?.querySelector('cite strong');
      const cite = bq?.querySelector('cite');
      if (p && by) {
        const b = box(bq);
        const pr = box(p);
        const byr = box(by);
        parts.quote = { box: { x: b.x, y: pr.y, w: b.w, h: pr.h }, paras: [paragraph(p)] };
        parts.by = { box: { x: b.x, y: pr.y + pr.h, w: b.w, h: byr.y + byr.h - pr.y - pr.h }, paras: [paragraph(by)] };
        const role = [...cite.childNodes].filter((n) => n !== by).map((n) => n.textContent).join('').trim();
        const cr = box(cite);
        if (role) parts.role = { box: { x: b.x, y: byr.y + byr.h, w: b.w, h: cr.y + cr.h - byr.y - byr.h }, paras: [{ ...paragraph(cite, { skip: (n) => n === by }) }] };
        skip.add(bq);
      }
    }
    if (variant === 'content' || variant === 'media') {
      const body = variant === 'media' ? q('.lz-media-text > div:last-child') : q('.lz-body');
      const flow = body && textFlow(body);
      if (flow) {
        parts.body = { box: { ...contentBox(body), w: flow.right - contentBox(body).x }, paras: flow };
        skip.add(body);
      }
    }
    const cols = [...lz.querySelectorAll('.lz-cols > .lz-col')];
    if (variant === 'columns' && (cols.length === 2 || cols.length === 3)) {
      parts.columns = cols.map((col) => {
        const label = col.querySelector(':scope > .lz-label');
        const flowEls = [...col.children].filter((c) => c !== label);
        const r = {};
        if (label) {
          r.label = part(label);
          skip.add(label);
        }
        const paras = textFlowOf(flowEls);
        if (paras) {
          const cb = box(col);
          const top = rectOf({ left: 0, top: Math.min(...flowEls.map((c) => c.getBoundingClientRect().top)), width: 0, height: 0 }).y;
          r.body = { box: { x: cb.x, y: top, w: cb.w, h: cb.y + cb.h - top }, paras };
          flowEls.forEach((c) => skip.add(c));
        }
        return r;
      });
    }
    const stats = [...lz.querySelectorAll('.lz-stats > .lz-stat')];
    const HUE_ORDER = ['steel', 'teal', 'violet', 'olive'];
    const statHue = (s) => s.closest('[data-hue]')?.dataset.hue;
    // The Stats layouts have 3 or 4 cards in fixed colours: use them only when the slide matches.
    const statsFit = (stats.length === 3 || (stats.length === 4 && !lz.classList.contains('light'))) && stats.every((s, i) => statHue(s) === HUE_ORDER[i]);
    if (variant === 'stats' && statsFit) {
      skip.add(q('.lz-stats'));
      parts.stats = stats.map((s) => ({
        hue: s.dataset.hue ?? s.closest('[data-hue]')?.dataset.hue,
        label: part(s.querySelector('.lz-label')),
        value: part(s.querySelector('.lz-stat-value')),
        text: part(s.querySelector('.lz-stat-text')),
      }));
    }
    if (variant === 'agenda') {
      const ol = q('.lz-agenda');
      if (ol) {
        parts.agenda = {
          box: box(ol),
          items: [...ol.children].map((li) => ({ box: box(li), text: li.lastChild?.textContent?.trim() ?? '', dim: li.classList.contains('dim'),
            numberStyle: runStyle(li.querySelector('.lz-number')), textStyle: runStyle(li) })),
          line: color(getComputedStyle(ol.children[0] ?? ol).borderTopColor),
        };
        skip.add(ol);
      }
    }
    if (variant === 'end') {
      const contact = q('.lz-contact');
      if (contact && contact.textContent.includes('moin@lionizers.com')) {
        parts.contact = contact.textContent.replace(/\s+/g, ' ').trim();
        skip.add(contact);
      }
    }
    if (variant === 'media') {
      const half = q('.lz-media-image');
      const img = half?.querySelector('img');
      if (img) {
        parts.image = await imageShape(img);
        skip.add(img);
      }
    }

    const shapes = [];
    for (const c of lz.children) await walk(c, shapes, skip);

    const footer = q('.lz-footer span');
    const notesEl = page.querySelector('.print-notes');
    const notes = [];
    if (notesEl) {
      for (const el of notesEl.querySelectorAll('p, li')) {
        if (el.tagName === 'P' && el.closest('li')) continue;
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (text) notes.push({ text, bullet: el.tagName === 'LI' });
      }
      if (!notes.length && notesEl.textContent.trim()) notes.push({ text: notesEl.textContent.trim() });
    }

    return {
      variant,
      side: lz.classList.contains('media-right') ? 'right' : 'left',
      light: lz.classList.contains('light'),
      small: lz.classList.contains('small'),
      bare: !q('.lz-footer'),
      hue: lz.dataset.hue ?? null,
      gradient: lz.classList.contains('lz-gradient')
        ? { from: color(getComputedStyle(lz).getPropertyValue('--accent-surface-deep').trim()), to: color(getComputedStyle(lz).getPropertyValue('--accent-surface').trim()) }
        : null,
      footer: footer?.textContent.trim() ?? null,
      parts,
      shapes,
      notes,
    };
  }

  /** textFlow() for a list of sibling elements. */
  function textFlowOf(els) {
    if (!els.length) return null;
    const blocks = [];
    for (const c of els) {
      if (isHidden(c)) continue;
      if (getComputedStyle(c).display === 'contents') blocks.push(...c.children);
      else blocks.push(c);
    }
    const ok = blocks.every((b) => (BLOCK_TEXT.has(b.tagName) && isTextBlock(b) && !b.querySelector('svg, img')) || ((b.tagName === 'UL' || b.tagName === 'OL') && isSimpleList(b)));
    if (!ok) return null;
    const paras = [];
    let prevBottom = null;
    paras.right = Math.max(...blocks.map((b) => b.getBoundingClientRect().right)) - origin.left;
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      const gap = prevBottom === null ? 0 : r.top - prevBottom;
      if (b.tagName === 'UL' || b.tagName === 'OL') paras.push(...listParagraphs(b, 1, [], gap));
      else {
        const p = paragraph(b);
        p.level = 0;
        p.step = stepOf(b);
        p.spaceBefore = gap;
        paras.push(p);
      }
      prevBottom = r.bottom;
    }
    return paras;
  }

  window.__lzExtract = async () => {
    const pages = [...document.querySelectorAll('.print-page')];
    const slides = [];
    for (const page of pages) slides.push(await extractSlide(page));
    return slides;
  };
})();
