/**
 * theme1.xml: colour scheme, font scheme, format scheme, object defaults
 * and the custom colours (all 9 hues × 5 roles) for the colour picker.
 */
import { XML_HEAD, esc, solid } from './dml.js';
import { ROLES } from './ci.js';
import { FONT } from './fonts.js';

/** Order of the hues in the theme: accent2…6 (accent1 is the amber primary). */
export const ACCENT_HUES = ['steel', 'teal', 'violet', 'olive', 'blue'];

export function themeXml(ci) {
  const h = ci.hues;
  const scheme = {
    dk1: ci.dark,
    lt1: ci.light,
    dk2: ci.secondary,
    lt2: 'E6E4DC',
    accent1: ci.primary,
    accent2: h.steel.button,
    accent3: h.teal.button,
    accent4: h.violet.button,
    accent5: h.olive.button,
    accent6: h.blue.button,
    hlink: ci.primary,
    folHlink: h.gold.button,
  };
  const clrScheme = Object.entries(scheme)
    .map(([k, v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`)
    .join('');

  const custom = [
    ['Amber (primary)', ci.primary],
    ['Teal (secondary)', ci.secondary],
    ...Object.entries(h).flatMap(([hue, roles]) =>
      ROLES.filter((r) => roles[r]).map((r) => [`${hue} ${r}`, roles[r]]),
    ),
  ];
  const custClrLst = custom
    .map(([name, hex]) => `<a:custClr name="${esc(name)}"><a:srgbClr val="${hex}"/></a:custClr>`)
    .join('');

  const fontScheme =
    `<a:fontScheme name="Lionizers">` +
    `<a:majorFont><a:latin typeface="${FONT.condensed}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="${FONT.condensed}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>` +
    `</a:fontScheme>`;

  // The format scheme is required. It is used by SmartArt and shape styles.
  const fill = (alpha) => `<a:solidFill><a:schemeClr val="phClr">${alpha ? `<a:alpha val="${alpha}"/>` : ''}</a:schemeClr></a:solidFill>`;
  const ln = (w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${fill()}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  const fmtScheme =
    `<a:fmtScheme name="Lionizers">` +
    `<a:fillStyleLst>${fill()}${fill()}${fill()}</a:fillStyleLst>` +
    `<a:lnStyleLst>${ln(9525)}${ln(19050)}${ln(28575)}</a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst>${fill()}${fill()}${fill()}</a:bgFillStyleLst>` +
    `</a:fmtScheme>`;

  // Defaults for new shapes, lines and text boxes that the user inserts:
  // a card (text colour at 5 %, no outline), a faint line, text in the CI font.
  const objectDefaults =
    `<a:objectDefaults>` +
    `<a:spDef><a:spPr>${solid(ci.card)}<a:ln><a:noFill/></a:ln></a:spPr>` +
    `<a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle><a:defPPr><a:defRPr><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:defPPr></a:lstStyle>` +
    `<a:style><a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></a:style></a:spDef>` +
    `<a:lnDef><a:spPr><a:ln w="14288">${solid({ c: 'tx1', alpha: 0.45 })}</a:ln></a:spPr><a:bodyPr/><a:lstStyle/>` +
    `<a:style><a:lnRef idx="1"><a:schemeClr val="tx1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="tx1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="tx1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></a:style></a:lnDef>` +
    `<a:txDef><a:spPr><a:noFill/></a:spPr><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0"><a:spAutoFit/></a:bodyPr>` +
    `<a:lstStyle><a:defPPr><a:defRPr><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:defPPr></a:lstStyle></a:txDef>` +
    `</a:objectDefaults>`;

  return (
    XML_HEAD +
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Lionizers">` +
    `<a:themeElements><a:clrScheme name="Lionizers">${clrScheme}</a:clrScheme>${fontScheme}${fmtScheme}</a:themeElements>` +
    `${objectDefaults}<a:extraClrSchemeLst/><a:custClrLst>${custClrLst}</a:custClrLst></a:theme>`
  );
}
