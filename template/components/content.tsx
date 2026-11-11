/**
 * Content components. Use them inside a layout, next to plain HTML
 * (p, ul, ol, table, blockquote, h2, img, code, pre, strong, em).
 */
import { cloneElement, isValidElement, toChildArray, type ComponentChildren, type VNode } from 'preact';
import { createPortal } from 'preact/compat';
import { icons, Check, X } from 'lucide-preact';
import { useSlide } from 'lionizers-slides';
import type { Hue, IconName } from './tokens';

type Children = { children?: ComponentChildren };

/**
 * Speaker notes. Only visible in the presenter view (key P) and in ?source.
 * Write plain text: line breaks are kept, lines that start with "- " become
 * bullets, a blank line starts a new paragraph.
 * @example
 * <Notes>
 *   - First point
 *   - Second point
 * </Notes>
 */
export function Notes({ children }: Children) {
  const { notesTarget } = useSlide();
  if (!notesTarget) return null;
  return createPortal(
    <div className="lz-notes">{typeof children === 'string' ? formatNotes(children) : children}</div>,
    notesTarget,
  );
}

function formatNotes(text: string) {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  type Block = { type: 'ul'; items: string[] } | { type: 'p'; text: string };
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const raw of lines) {
    const line = raw.slice(indent);
    if (!line.trim()) {
      current = null;
    } else if (line.startsWith('- ')) {
      if (current?.type !== 'ul') blocks.push((current = { type: 'ul', items: [] }));
      current.items.push(line.slice(2));
    } else if (current?.type === 'ul' && /^\s/.test(line)) {
      current.items[current.items.length - 1] += ' ' + line.trim();
    } else if (current?.type === 'p') {
      current.text += ' ' + line.trim();
    } else {
      blocks.push((current = { type: 'p', text: line.trim() }));
    }
  }
  return blocks.map((b, i) =>
    b.type === 'ul' ? (
      <ul key={i}>
        {b.items.map((t, j) => (
          <li key={j}>{t}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{b.text}</p>
    ),
  );
}

/* ---------- Icons ---------- */

/**
 * A Lucide icon (lucide.dev/icons), as large as the text around it.
 * @example <Icon name="ShieldCheck" />
 */
export function Icon({ name, strokeWidth = 1.6 }: { /** PascalCase name, e.g. "Cpu". */ name: IconName; strokeWidth?: number }) {
  const C = icons[name];
  return <C className="lz-icon" strokeWidth={strokeWidth} />;
}

/** Big icon, cut off at the bottom right of its container. Used by the gradient layouts. */
export function BigIcon({ name, cut = 'strong' }: { name: IconName; cut?: 'strong' | 'light' }) {
  const C = icons[name];
  return (
    <div className={`lz-bigicon cut-${cut}`} aria-hidden="true" data-edge>
      <C strokeWidth={2.2} />
    </div>
  );
}

/**
 * Green check mark for "yes", "done", "included". Use it in tables and text.
 * @example <td><Yes /> Ja</td>
 */
export function Yes() {
  return <Check className="lz-icon" style={{ color: 'var(--good)' }} strokeWidth={2.5} />;
}

/**
 * Red cross for "no", "missing", "risk".
 * @example <td><No /> Nein</td>
 */
export function No() {
  return <X className="lz-icon" style={{ color: 'var(--bad)' }} strokeWidth={2.5} />;
}

function markItems(children: ComponentChildren, mark: VNode) {
  return toChildArray(children).map((child) =>
    isValidElement(child) && child.type === 'li'
      ? cloneElement(child as VNode<any>, {}, mark, (child as VNode<any>).props.children)
      : child,
  );
}

/**
 * List with green check marks. Children are <li>.
 * @example <CheckList><li>Dokumentation</li><li>Schulung</li></CheckList>
 */
export function CheckList({ children }: Children) {
  return <ul className="lz-checks good">{markItems(children, <Check className="lz-mark" strokeWidth={2.5} />)}</ul>;
}

/**
 * List with red crosses. Children are <li>.
 * @example <CrossList><li>Kein SSH</li><li>Keine Logs</li></CrossList>
 */
export function CrossList({ children }: Children) {
  return <ul className="lz-checks bad">{markItems(children, <X className="lz-mark" strokeWidth={2.5} />)}</ul>;
}

/* ---------- Layout helpers ---------- */

/**
 * One column with an optional mono label. Use it in the <Columns> layout or in a <Grid>.
 * @example <Column label="Option A"><ul><li>schnell</li></ul></Column>
 */
export function Column({ label, children }: { /** Small mono heading in the accent colour. */ label?: string } & Children) {
  return (
    <div className="lz-col">
      {label && <div className="lz-label">{label}</div>}
      {children}
    </div>
  );
}

/**
 * Grid inside any layout. Default: one column per child.
 * @example <Grid cols={3}>…</Grid>   <Grid ratio={[2, 1]}>…</Grid>
 */
export function Grid({ cols, ratio, children }: { /** Number of equal columns. */ cols?: number; /** Relative widths, e.g. [2, 1]. */ ratio?: number[] } & Children) {
  const n = cols ?? toChildArray(children).filter((c) => typeof c === 'object').length;
  const template = ratio ? ratio.map((r) => `${r}fr`).join(' ') : `repeat(${n}, 1fr)`;
  return (
    <div className="lz-grid" style={{ gridTemplateColumns: template }}>
      {children}
    </div>
  );
}

/* ---------- Steps ---------- */

/**
 * Content that appears on a later click (→, Space, clicker). Steps count in the
 * order of the source. `at` gives a fixed step number (from 1); then several
 * <Step at={2}> appear together. Hidden steps keep their space.
 * Works around anything: text, cards, boxes, connectors.
 * Overview and PDF show all steps (`pdf --steps`: one page per step).
 * @example
 * <Step><p>Erscheint beim ersten Klick.</p></Step>
 * <Step at={1}><Connector /></Step>
 */
export function Step({ at, children }: { /** Fixed step number, from 1. Default: the next step. */ at?: number } & Children) {
  return (
    <div className="lz-step" data-step={at ?? ''}>
      {children}
    </div>
  );
}

/**
 * Each child appears on its own click. Typical: the points of a list.
 * @example
 * <ul>
 *   <Steps>
 *     <li>Erst das</li>
 *     <li>dann das</li>
 *   </Steps>
 * </ul>
 */
export function Steps({ children }: Children) {
  return (
    <>
      {toChildArray(children).map((child, i) =>
        // HTML elements (li, p, …) get the marker directly, so that lists stay valid.
        isValidElement(child) && typeof child.type === 'string' ? (
          cloneElement(child as VNode<any>, { 'data-step': '' })
        ) : (
          <Step key={i}>{child}</Step>
        ),
      )}
    </>
  );
}

/* ---------- Cards ---------- */

/**
 * Card with a colour bar on the left. Put several into a <Grid>.
 * Give each card its own `color` when they stand for different things.
 * @example <Card color="steel" label="Option A" title="Selbst bauen">Volle Kontrolle, mehr Zeit.</Card>
 */
export function Card({ color, label, title, morph, children }: {
  /** Colour of the bar and the label. Default: gold. */
  color?: Hue;
  /** Morph name: a card with the same name on the next slide moves to its new place. */
  morph?: string;
  /** Small mono label above the title. */
  label?: string;
  title?: ComponentChildren;
} & Children) {
  return (
    <div className="lz-card" data-hue={color} data-morph={morph}>
      {label && <div className="lz-label">{label}</div>}
      {title && <h3>{title}</h3>}
      {typeof children === 'string' ? <p>{children}</p> : children}
    </div>
  );
}

/* ---------- Processes ---------- */

/**
 * Process in phases, drawn as chevrons from left to right. Children are <Phase>.
 * @example
 * <Process>
 *   <Phase label="Woche 1–2" title="Analyse">Bestandsaufnahme</Phase>
 *   <Phase label="Monate 1–3" title="Umsetzung">…</Phase>
 * </Process>
 */
export function Process({ color, children }: { /** Colour of the phase labels. Default: steel. */ color?: Hue } & Children) {
  const n = toChildArray(children).filter((c) => typeof c === 'object').length;
  return (
    <div className="lz-process" data-hue={color ?? 'steel'} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {children}
    </div>
  );
}

/** One phase of a <Process>. `label` is the large light line on top (time, number). */
export function Phase({ label, title, children }: { label: ComponentChildren; title: ComponentChildren } & Children) {
  return (
    <div className="lz-phase">
      <div className="lz-phase-label">{label}</div>
      <h3>{title}</h3>
      {typeof children === 'string' ? <p>{children}</p> : children}
    </div>
  );
}

/* ---------- Small things ---------- */

/**
 * A key figure on a card with a colour bar. For the <Stats> layout or a <Grid>.
 * In <Stats>, each card gets its own colour unless `color` is set.
 * @example <Stat label="Antwortzeit" value="180" unit="ms">Ziel waren 250 ms.</Stat>
 */
export function Stat({ value, unit, label, color, children }: {
  /** What the number is. Mono label above the number. */
  label?: string;
  /** The number, e.g. "424" or "2,4". */
  value: ComponentChildren;
  /** Unit after the number, e.g. "ms", "Mio.", "%". */
  unit?: string;
  /** Colour of the bar and the label. */
  color?: Hue;
} & Children) {
  return (
    <div className="lz-stat" data-hue={color}>
      {label && <div className="lz-label">{label}</div>}
      <div className="lz-stat-value">
        {value}
        {unit && <span className="lz-stat-unit">{unit}</span>}
      </div>
      {children && <div className="lz-stat-text">{children}</div>}
    </div>
  );
}

/**
 * Small mono pill, e.g. for categories.
 * @example <Tag>API</Tag> <Tag highlight>Neu</Tag>
 */
export function Tag({ highlight, children }: { /** Border in the accent colour. */ highlight?: boolean } & Children) {
  return <span className={`lz-tag${highlight ? ' highlight' : ''}`}>{children}</span>;
}

/**
 * Mono line at the bottom of the slide, e.g. a source.
 * @example <Footnote>Quelle: Name der Studie, Jahr</Footnote>
 */
export function Footnote({ children }: Children) {
  return <p className="lz-footnote">{children}</p>;
}

/* ---------- Config elements. They render nothing. ---------- */

/**
 * Deck settings. Only in `_deck.tsx` at the top of the deck folder.
 * @example <Deck title="Titel des Vortrags" lang="de" />
 */
export function Deck(_: {
  /** Footer, browser tab and PDF title. Default: folder name. */
  title?: string;
  /** "de" or "en". Default: "de". */
  lang?: 'de' | 'en';
  /** Change of slides: "fade" (default, a short cross-fade, needed for `morph`) or "none". */
  transition?: 'fade' | 'none';
}) {
  return null;
}

/**
 * Chapter settings. Only in `_chapter.tsx` inside a chapter folder.
 * @example <Chapter label="Ausgangslage" />
 */
export function Chapter(_: { /** Default: made from the folder name. */ label?: string }) {
  return null;
}
