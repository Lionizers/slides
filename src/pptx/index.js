/**
 * PowerPoint for Lionizers Slides: the template (.potx) and the export of a deck to an
 * editable .pptx on that template.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCI } from './ci.js';
import { buildPackage, layouts } from './template.js';
import { deckSlides, svgsOf } from './export.js';
import { brandAssets } from './assets.js';
import { Raster } from './raster.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Writes the template.
 * @param {import('playwright-core').Browser} browser for the logo and bullet pictures
 */
export async function writeTemplate(browser, componentsDir, out) {
  const ci = loadCI(componentsDir);
  const raster = await Raster.open(browser, componentsDir);
  try {
    const pkg = buildPackage(ci, await brandAssets(ci, raster), { kind: 'template', title: 'Lionizers' });
    fs.writeFileSync(out, pkg.toZip());
  } finally {
    await raster.close();
  }
}

/**
 * Exports the deck that `page` shows in the print view with notes (?print&notes).
 * @param {import('playwright-core').Page} page
 * @param {{ componentsDir: string, out: string, title?: string, smartart?: boolean }} opts
 * @returns the number of slides
 */
export async function writeDeck(page, { componentsDir, out, title, smartart = true }) {
  await page.addScriptTag({ path: path.join(here, 'browser/extract.js') });
  if (smartart) await page.evaluate(() => (window.__lzSmartArt = true));
  const model = await page.evaluate(() => window.__lzExtract());

  const ci = loadCI(componentsDir);
  const raster = await Raster.open(page.context().browser(), componentsDir);
  try {
    const assets = await brandAssets(ci, raster);
    const pngs = await raster.all(svgsOf(model));
    const names = new Set(layouts(ci).map((l) => l.name));
    const deckTitle = title ?? model.find((s) => s.footer)?.footer ?? path.basename(out, '.pptx');
    const pkg = buildPackage(ci, assets, { kind: 'deck', title: deckTitle, slides: deckSlides(model, names, pngs) });
    fs.writeFileSync(out, pkg.toZip());
  } finally {
    await raster.close();
  }
  return model.length;
}
