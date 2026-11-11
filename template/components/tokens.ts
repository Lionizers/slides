/**
 * Lionizers CI tokens for slides. The colour values live in theme.css
 * (same palette as lionizers.com).
 */
import { icons } from 'lucide-preact';

/**
 * The 9 hues of the palette. Each has 5 roles (surface-deep, surface, card,
 * button, ink). Use them to tell boxes and cards apart in diagrams.
 * The order is also the order of automatic colours: neighbours differ clearly.
 * Red and green also have a meaning (bad / good), so use them for that only.
 */
export const HUES = ['steel', 'teal', 'violet', 'olive', 'gold', 'blue', 'orange', 'green', 'red'] as const;
export type Hue = (typeof HUES)[number];

/** Name of a Lucide icon in PascalCase, e.g. "Cpu", "ShieldCheck", "Construction". See lucide.dev/icons. */
export type IconName = keyof typeof icons;

/** Zero-padded number: 1 → "01". */
export const pad = (n: number) => String(n).padStart(2, '0');
