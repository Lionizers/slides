import type { Context } from 'preact';

export interface ChapterInfo {
  /** Position of the chapter in the deck, from 0. */
  index: number;
  /** From the folder name ("02-erste-schritte" → "Erste schritte") or from _chapter.tsx. */
  label: string;
  /** Accent from _chapter.tsx, or undefined. */
  accent?: string;
}

export interface SlideInfo {
  /** Position of the slide in the deck, from 0. */
  index: number;
  /** Current step of the slide (see <Step>). Infinity when all steps are shown (overview, PDF). */
  step: number;
  /** Number of slides in the deck. */
  total: number;
  /** Chapter of the slide, or null for slides outside a chapter folder. */
  chapter: ChapterInfo | null;
  chapters: ChapterInfo[];
  deck: { name: string; title: string; lang: string };
  /** Set only in the presenter view. <Notes> renders into this element. */
  notesTarget: Element | null;
}

export const SlideContext: Context<SlideInfo>;
/** Information about the slide that is rendered right now. */
export function useSlide(): SlideInfo;
