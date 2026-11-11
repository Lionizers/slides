/**
 * Font names as PowerPoint sees them. PowerPoint cannot use variable fonts,
 * so the Barlow GX of the slides (width axis 300…500) maps to two static families:
 * wdth 300 → Barlow Condensed (all text), wdth 500 → Barlow (hero titles, figures).
 * Each weight other than Regular and Bold is a family of its own in PowerPoint.
 */
export const FONT = {
  condensed: 'Barlow Condensed',
  condensedLight: 'Barlow Condensed Light',
  condensedMedium: 'Barlow Condensed Medium',
  condensedSemiBold: 'Barlow Condensed SemiBold',
  heroBold: 'Barlow ExtraBold',
  heroSemiBold: 'Barlow SemiBold',
  mono: 'JetBrains Mono Medium',
  monoBold: 'JetBrains Mono',
};

/**
 * Line heights. The vertical metrics of Barlow differ between macOS (hhea: 1.2 em)
 * and Windows (win: 1.35 em), so a percentage line spacing looks different on each.
 * For fixed sizes (titles, hero, statement) we use exact points instead.
 * For body text (which users resize) we use a percentage that is right on macOS
 * and close on Windows.
 */
export const BARLOW_LINE = 1.2;

/**
 * CSS font (family, weight, wdth axis) → PowerPoint font name and bold flag.
 * @param {{ family: string, weight: number, wdth: number }} f
 */
export function pptFont({ family, weight, wdth }) {
  const w = Math.round((weight || 400) / 100) * 100;
  if (/JetBrains/i.test(family)) return w >= 700 ? { font: FONT.monoBold, bold: true } : { font: FONT.mono };
  if (/Barlow/i.test(family)) {
    if (wdth < 400) {
      if (w <= 300) return { font: FONT.condensedLight };
      if (w === 400) return { font: FONT.condensed };
      if (w === 500) return { font: FONT.condensedMedium };
      if (w === 600) return { font: FONT.condensedSemiBold };
      if (w === 700) return { font: FONT.condensed, bold: true };
      return { font: 'Barlow Condensed ExtraBold' };
    }
    if (w <= 500) return { font: 'Barlow' };
    if (w === 600) return { font: FONT.heroSemiBold };
    if (w === 700) return { font: 'Barlow', bold: true };
    return { font: FONT.heroBold };
  }
  return { font: family, bold: w >= 700 || undefined };
}
