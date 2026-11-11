/**
 * Example of a free-form component, built with HTML and Tailwind.
 * Copy this file as a starting point for your own diagrams.
 *
 * Rules for own components:
 * - Export a function with a capital name. It is then available in all slides.
 * - Use only the CI colours of the Tailwind theme (see theme.css):
 *   canvas, fg, muted, faint, line, tint, good, bad, accent-*, primary, secondary,
 *   and the 9 hues with their roles (bg-steel-card, text-green-ink, …).
 * - Mono (font-mono) only for labels, always uppercase. Text in Barlow (default).
 * - Sizes in px or Tailwind steps. The slide is always 1280 × 720.
 */
import type { ComponentChildren } from 'preact';

interface Step {
  /** Short mono label above the point, e.g. "Q1". */
  label: string;
  title: ComponentChildren;
  text?: ComponentChildren;
  /** Marks the step in amber. Use it for one step at most. */
  highlight?: boolean;
}

/** Gap between the steps in px. The line runs through it to the next point. */
const GAP = 32;
/** Size of a point in px. */
const DOT = 14;

/**
 * Horizontal timeline with points on a line.
 * @example
 * <Timeline steps={[
 *   { label: 'Q1 2027', title: 'Dev-Kit' },
 *   { label: 'Q3 2027', title: 'Prototyp', highlight: true },
 * ]} />
 */
export function Timeline({ steps }: { steps: Step[] }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)`, columnGap: GAP }}>
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="mb-3 font-mono text-[16px] font-medium tracking-[0.05em] uppercase text-muted">{s.label}</div>
          {/* Point and line share one row, so the line always runs through the centre of the point. */}
          <div className="relative mb-5 flex items-center" style={{ height: DOT }}>
            {i < steps.length - 1 && (
              <div className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-faint" style={{ right: -GAP }} />
            )}
            <div
              className={`relative rounded-full border-2 ${s.highlight ? 'border-primary bg-primary' : 'border-accent bg-canvas'}`}
              style={{ width: DOT, height: DOT }}
            />
          </div>
          <div className="mb-1 text-[22px] font-semibold leading-tight text-fg">{s.title}</div>
          {s.text && <div className="text-[17px] leading-snug text-muted">{s.text}</div>}
        </div>
      ))}
    </div>
  );
}
