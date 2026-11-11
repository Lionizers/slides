/**
 * Click animations (<Step>) and the Morph transition, as PresentationML.
 */

/**
 * Timing of a slide: one click per step number, all shapes of a step fade in together.
 * @param {{ spid: number, step: number, para?: number, text?: boolean }[]} targets
 */
export function timingXml(targets) {
  const steps = [...new Set(targets.filter((t) => t.step > 0).map((t) => t.step))].sort((a, b) => a - b);
  if (!steps.length) return '';
  let id = 2;
  const next = () => ++id;
  const tgt = (t) =>
    `<p:tgtEl><p:spTgt spid="${t.spid}">${t.para != null ? `<p:txEl><p:pRg st="${t.para}" end="${t.para}"/></p:txEl>` : ''}</p:spTgt></p:tgtEl>`;

  const clicks = steps
    .map((step) => {
      const effects = targets
        .filter((t) => t.step === step)
        .map((t, i) => {
          const effect =
            `<p:par><p:cTn id="${next()}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="${i === 0 ? 'clickEffect' : 'withEffect'}">` +
            `<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
            `<p:set><p:cBhvr><p:cTn id="${next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt(t)}` +
            `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>` +
            `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${next()}" dur="300"/>${tgt(t)}</p:cBhvr></p:animEffect>` +
            `</p:childTnLst></p:cTn></p:par>`;
          return effect;
        })
        .join('');
      return (
        `<p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>` +
        `<p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>` +
        `</p:childTnLst></p:cTn></p:par>`
      );
    })
    .join('');

  // Build list: shapes with text say whether they build as one or by paragraph.
  const builds = new Map();
  for (const t of targets.filter((x) => x.step > 0 && x.text)) {
    builds.set(t.spid, t.para != null || builds.get(t.spid) === 'p' ? 'p' : 'whole');
  }
  const bldLst = [...builds]
    .map(([spid, kind]) => (kind === 'p' ? `<p:bldP spid="${spid}" grpId="0" build="p"/>` : `<p:bldP spid="${spid}" grpId="0" animBg="1"/>`))
    .join('');

  return (
    `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clicks}</p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>` +
    `</p:childTnLst></p:cTn></p:par></p:tnLst>${bldLst ? `<p:bldLst>${bldLst}</p:bldLst>` : ''}</p:timing>`
  );
}

/**
 * Morph transition (PowerPoint 2019+), with a fade for older versions.
 * 400 ms, as the view transition of lionizers-slides (app.css).
 */
export const MORPH_TRANSITION =
  `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">` +
  `<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p159">` +
  `<p:transition spd="fast" p14:dur="400"><p159:morph option="byObject"/></p:transition></mc:Choice>` +
  `<mc:Fallback><p:transition spd="fast"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;
