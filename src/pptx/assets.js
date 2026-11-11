/**
 * Pictures that the template needs: the logo (SVG with PNG fallback) and the ">>" in front
 * of the kicker.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * The ">>" in front of the kicker, as a picture bullet: PowerPoint shows only the first
 * character of a text bullet. Two single ">" of JetBrains Mono Bold (not the ">>" ligature,
 * the slides do not use it) with the 0.05 em letter spacing of the kicker, cut to the ink:
 * x 76…1174, y 55…603 font units.
 * Transparent room above and below (font units) sets size and position on the line: PowerPoint
 * puts the bottom of the picture on the baseline and rounds its size to whole points.
 * PowerPoint draws picture bullets narrower than their aspect ratio (measured: 0.82), so the
 * picture is stretched by the inverse.
 */
export const KICKER_PAD = { top: 51, bottom: 68 };
export const KICKER_STRETCH = 1.21;

function kickerSvg(ci, pad = KICKER_PAD) {
  const h = pad.top + 548 + pad.bottom;
  const height = 200;
  const width = Math.round(((1098 * KICKER_STRETCH) / h) * height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="76 ${-pad.top} 1098 ${h}" width="${width}" height="${height}" preserveAspectRatio="none">` +
    `<g font-family="JetBrains Mono" font-weight="700" font-size="1000" fill="#${ci.primary}" style="font-variant-ligatures: none">` +
    `<text x="0" y="603">&gt;</text><text x="650" y="603">&gt;</text></g></svg>`
  );
}

/** @param {import('./raster.js').Raster} raster */
export async function brandAssets(ci, raster) {
  const svg = fs.readFileSync(path.join(ci.componentsDir, 'assets/logos/logo-on-dark.svg'), 'utf8');
  return {
    logoOnDark: { svg: Buffer.from(svg), png: await raster.png(svg) },
    kicker: { png: await raster.png(kickerSvg(ci)) },
  };
}
