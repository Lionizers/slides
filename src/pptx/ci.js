/**
 * Reads the CI values (colours) from theme.css of Lionizers Slides,
 * so that the PowerPoint template always follows the slides.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROLES = ['surface-deep', 'surface', 'card', 'button', 'ink'];

/** hsl(h s% l%) → "RRGGBB" */
export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Colour a at `alpha` over colour b, both "RRGGBB". */
export function mix(a, b, alpha) {
  const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return [0, 2, 4]
    .map((i) => Math.round(ch(a, i) * alpha + ch(b, i) * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function parseColor(value) {
  value = value.trim();
  let m = value.match(/^#([0-9a-f]{6})$/i);
  if (m) return m[1].toUpperCase();
  m = value.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
  if (m) return hslToHex(+m[1], +m[2], +m[3]);
  return null;
}

/** @param {string} componentsDir The components of a deck (see componentsDir() in plugin.js). */
export function loadCI(componentsDir) {
  if (!fs.existsSync(path.join(componentsDir, 'theme.css'))) throw new Error(`No theme.css in ${componentsDir}`);
  const css = fs.readFileSync(path.join(componentsDir, 'theme.css'), 'utf8');

  const vars = {};
  for (const m of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const hex = parseColor(m[2].replace(/\/\*.*?\*\//g, ''));
    if (hex && !(m[1] in vars)) vars[m[1]] = hex;
  }

  const hues = {};
  for (const [name, hex] of Object.entries(vars)) {
    const m = name.match(/^color-(\w+)-(surface-deep|surface|card|button|ink)$/);
    if (m) (hues[m[1]] ??= {})[m[2]] = hex;
  }

  // The secondary teal of title and chapter slides: [data-hue="secondary"] { ... }
  const sec = css.match(/\[data-hue="secondary"\]\s*\{([^}]*)\}/);
  if (sec) {
    const h = {};
    for (const m of sec[1].matchAll(/--accent-([\w-]+):\s*([^;]+);/g)) {
      h[m[1]] = parseColor(m[2]) ?? (m[2].includes('--secondary') ? vars['color-secondary'] : null);
    }
    hues.secondary = h;
  }

  const ci = {
    componentsDir,
    dark: vars['color-dark'],
    light: vars['color-light'],
    primary: vars['color-primary'],
    secondary: vars['color-secondary'],
    hues,
  };
  for (const key of ['dark', 'light', 'primary', 'secondary']) {
    if (!ci[key]) throw new Error(`theme.css: --color-${key} not found`);
  }
  // Card surface (--fg-05 of the slides: text colour at 5 % on the canvas), as an opaque colour.
  ci.card = mix(ci.light, ci.dark, 0.05);
  return ci;
}
