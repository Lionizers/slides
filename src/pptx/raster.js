/**
 * Renders SVG to PNG in Chrome: the fallback pictures that PowerPoint needs next to each SVG.
 */
import fs from 'node:fs';
import path from 'node:path';

export class Raster {
  /**
   * @param {import('playwright-core').Browser} browser
   * @param {string} componentsDir for the fonts that SVG text may use
   */
  static async open(browser, componentsDir) {
    const r = new Raster();
    r.context = await browser.newContext({ deviceScaleFactor: 3 });
    r.page = await r.context.newPage();
    const font = (file) => `data:font/woff2;base64,${fs.readFileSync(path.join(componentsDir, 'assets/fonts', file)).toString('base64')}`;
    r.css =
      `@font-face { font-family: "JetBrains Mono"; src: url("${font('JetBrainsMono-wght.woff2')}") format("woff2"); font-weight: 100 800; }` +
      `@font-face { font-family: "Barlow"; src: url("${font('BarlowGX.woff2')}") format("woff2"); font-weight: 100 900; }` +
      `html, body { margin: 0; background: transparent; } svg { display: block; }`;
    return r;
  }

  /** PNG of an SVG at 3× its width and height attributes. */
  async png(svg) {
    await this.page.setContent(`<!doctype html><style>${this.css}</style>${svg}`);
    await this.page.evaluate(() => document.fonts.ready);
    return this.page.locator('svg').first().screenshot({ omitBackground: true, animations: 'disabled' });
  }

  /** PNGs of many SVGs: Map svg → PNG. */
  async all(svgs) {
    const out = new Map();
    for (const svg of new Set(svgs)) out.set(svg, await this.png(svg));
    return out;
  }

  async close() {
    await this.context.close();
  }
}
