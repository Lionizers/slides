import { toChildArray, type ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Hue } from './tokens';

type ReactNode = ComponentChildren;

/**
 * Box diagrams: boxes in rows, rows stacked in a lane, joined by connectors.
 * For anything else, write your own component with HTML and Tailwind (see AGENTS.md).
 *
 * One diagram: a <Lane> alone. Diagrams side by side (e.g. before / after):
 * several <Lane>s in a <Diagram>.
 *
 *   <Diagram>
 *     <Lane title="Before">
 *       <Box name="Server" tags={['API']} />
 *       <Connector to={2} label="CAN" />
 *       <Row>
 *         <Box name="A" />
 *         <Box name="B" />
 *       </Row>
 *     </Lane>
 *     <Lane title="After">…</Lane>
 *   </Diagram>
 */

/** Gap between boxes in a Row. Connectors need it to find the box centres. */
const ROW_GAP = 20;
/** Gap between lanes in a Diagram. Same value as .lz-diagram in theme.css. */
const LANE_GAP = 72;

type Children = { children: ReactNode };

/**
 * Lanes side by side, equal width. `stretch` makes all lanes as high as the
 * highest one (then a <Connector grow> fills the free height of a lane).
 */
export function Diagram({ stretch, children }: { stretch?: boolean } & Children) {
  const lanes = toChildArray(children).length;
  return (
    <div className={`lz-diagram${stretch ? ' stretch' : ''}`} style={{ gridTemplateColumns: `repeat(${lanes}, 1fr)` }}>
      {children}
    </div>
  );
}

/** A column of rows and connectors. `title` is a mono label above it. */
export function Lane({ title, children }: { title?: string } & Children) {
  return (
    <div className="lz-lane">
      {title && <div className="lz-lane-title">{title}</div>}
      {children}
    </div>
  );
}

const ROW_WIDTHS = {
  half: `calc(50% - ${ROW_GAP}px / 2)`,
  third: `calc((100% - 2 * ${ROW_GAP}px) / 3)`,
  'two-thirds': `calc((100% - 2 * ${ROW_GAP}px) * 2 / 3 + ${ROW_GAP}px)`,
};

/**
 * Boxes side by side, equal width, centred in the lane.
 * `width` limits the row: "half" or "third" makes one box exactly as wide as
 * one box of a row with 2 or 3 boxes. Any CSS width works too, e.g. "60%".
 */
export function Row({ width, children }: { width?: 'half' | 'third' | 'two-thirds' | (string & {}) } & Children) {
  const cols = toChildArray(children).length;
  const w = width && width in ROW_WIDTHS ? ROW_WIDTHS[width as keyof typeof ROW_WIDTHS] : width;
  return (
    <div
      className="lz-row"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, width: w, columnGap: `${ROW_GAP}px` }}
    >
      {children}
    </div>
  );
}

type BoxProps = {
  name: ReactNode;
  /** Small mono labels in the box. */
  tags?: ReactNode[];
  /** More tags, drawn with an accent border (e.g. what is new). */
  highlight?: ReactNode[];
  /** "accent": a brighter surface (the box to look at). */
  variant?: 'accent';
  /** Centre name and tags. */
  center?: boolean;
  /** Colour of the bar on the left. Default: steel. Give boxes that stand for different things different colours. */
  color?: Hue;
  /** Morph name: a box with the same name on the next slide moves to its new place. */
  morph?: string;
};

/** A box with a name and optional tags. */
export function Box({ name, tags = [], highlight = [], variant, center, color = 'steel', morph }: BoxProps) {
  const className = ['lz-node', variant, center && 'center'].filter(Boolean).join(' ');
  return (
    <div className={className} data-hue={color} data-morph={morph}>
      <div className="lz-node-name">{name}</div>
      {(tags.length > 0 || highlight.length > 0) && (
        <div className="lz-tags">
          {tags.map((t, i) => (
            <span key={i} className="lz-tag">
              {t}
            </span>
          ))}
          {highlight.map((t, i) => (
            <span key={`h${i}`} className="lz-tag highlight">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type ConnectorProps = {
  /** Number of boxes above. */
  from?: number;
  /** Number of boxes below. */
  to?: number;
  /** Gap between the boxes in px. Only needed for unusual layouts. */
  gap?: number;
  /** Join boxes of different lanes of a <Diagram> (uses the lane gap). */
  across?: boolean;
  /** Label on the single stem (or on the line, if 1 → 1). */
  label?: ReactNode;
  /** Labels on the branches, by index on the side with more boxes. */
  branchLabels?: Record<number, ReactNode>;
  /** Fill the free height of the lane. Only has an effect in <Diagram stretch> with lanes of different height. */
  grow?: boolean;
};

/** Radius of the rounded corners where a line turns. */
const CORNER = 10;

/**
 * Lines between rows of boxes: a straight line (1 → 1), a fan (1 → n)
 * or a merge (n → 1). `from` and `to` are the numbers of boxes above and below.
 * Lines start at a small dot on the box above and end in an arrow head.
 * To join the lanes of a <Diagram>, put the Connector below the Diagram with `across`.
 */
export function Connector({ from = 1, to = 1, across, gap, label, branchLabels = {}, grow }: ConnectorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current!;
    // offsetWidth is the unscaled size (the slide is scaled with a transform).
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = gap ?? (across ? LANE_GAP : ROW_GAP);
  // Centre of box i of n in a row with gap g: (i + ½) · w/n + g · (i − (i + ½)(n − 1)/n)
  const centre = (i: number, n: number) => (i + 0.5) * (w / n) + g * (i - ((i + 0.5) * (n - 1)) / n);
  const tops = Array.from({ length: from }, (_, i) => centre(i, from));
  const bottoms = Array.from({ length: to }, (_, i) => centre(i, to));
  const mid = h / 2;
  // The lines start below the dot and end in the tip of the arrow head.
  const start = 6;
  const tip = h - 1;

  // One path per pair of points (fan: 1 → each, merge: each → 1), with rounded corners.
  const pairs = from >= to ? tops.map((x) => [x, bottoms[0]]) : bottoms.map((x) => [tops[0], x]);
  const paths = pairs.map(([a, b]) => {
    if (Math.abs(a - b) < 0.5) return `M ${a} 0 V ${tip}`;
    const dir = b > a ? 1 : -1;
    const r = Math.min(CORNER, Math.abs(b - a) / 2, mid);
    return [
      `M ${a} 0`,
      `V ${mid - r}`,
      `Q ${a} ${mid} ${a + dir * r} ${mid}`,
      `H ${b - dir * r}`,
      `Q ${b} ${mid} ${b} ${mid + r}`,
      `V ${tip}`,
    ].join(' ');
  });

  // The label sits on the single stem: centre if straight, upper half of a fan, lower half of a merge.
  // Branch labels sit on the branches, on the side with more boxes.
  // Each label is centred on the free part of its line: between the dot and the
  // turn, or between the turn and the arrow head.
  const fan = from === 1 && to > 1;
  const merge = from > 1;
  const upper = (start + mid - CORNER) / 2;
  const lower = (mid + CORNER + tip - 7) / 2;
  const labelX = merge ? bottoms[0] : tops[0];
  const labelY = fan ? upper : merge ? lower : (start + tip - 7) / 2;
  const wide = merge ? tops : bottoms;
  const branchY = merge ? upper : lower;

  return (
    <div ref={ref} className={`lz-connector${from === 1 && to === 1 ? '' : ' branched'}${grow ? ' grow' : ''}`}>
      {w > 0 && (
        <svg className="lz-connector-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
          {tops.map((x, i) => (
            <circle key={`d${i}`} cx={x} cy={2.5} r={3.5} />
          ))}
          {bottoms.map((x, i) => (
            <path key={`a${i}`} d={`M ${x - 6} ${tip - 6.5} L ${x} ${tip} L ${x + 6} ${tip - 6.5}`} />
          ))}
        </svg>
      )}
      {w > 0 && label && (
        <span className="lz-connector-label" style={{ left: labelX, top: labelY }}>
          {label}
        </span>
      )}
      {w > 0 &&
        Object.entries(branchLabels).map(([i, l]) => (
          <span key={i} className="lz-connector-label" style={{ left: wide[Number(i)], top: branchY }}>
            {l}
          </span>
        ))}
    </div>
  );
}
