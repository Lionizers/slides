/**
 * Slide layouts. The root element of every slide file is one of these.
 * To change the layout of a slide, change the name of the root element.
 */
import { cloneElement, isValidElement, toChildArray, type ComponentChildren, type VNode } from 'preact';
import { useSlide } from 'lionizers-slides';
import { HUES, pad, type Hue, type IconName } from './tokens';
import { BigIcon, Icon, Notes } from './content';
import logoOnDark from './assets/logos/logo-on-dark.svg';
import logoOnLight from './assets/logos/logo-on-light.svg';
import './theme.css';

/** Props that all layouts accept. */
export interface FrameProps {
  /** Hue for accent details (table headers, labels). Default: gold. */
  accent?: Hue;
  /** Light canvas instead of dark. */
  light?: boolean;
  /** Smaller base font size, for slides with much text. */
  small?: boolean;
  /** No logo and no footer. */
  bare?: boolean;
  children?: ComponentChildren;
}

interface HeaderProps {
  /** Small ">> LABEL" above the title. Default: the chapter name. `false` hides it. */
  kicker?: string | false;
  title?: ComponentChildren;
}

function Frame({
  variant,
  hue,
  gradient,
  light,
  small,
  bare,
  children,
}: Omit<FrameProps, 'accent'> & { variant: string; hue?: Hue | 'secondary'; gradient?: boolean }) {
  const { index, total, deck } = useSlide();
  const className = ['lz', variant, gradient && 'lz-gradient', light && 'light', small && 'small']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} data-hue={hue}>
      {!bare && <img className="lz-logo" src={light ? logoOnLight : logoOnDark} alt="Lionizers" />}
      {children}
      {!bare && (
        <div className="lz-footer">
          <span>{deck.title}</span>
          <span>
            {pad(index + 1)} / {pad(total)}
          </span>
        </div>
      )}
    </div>
  );
}

function Kicker({ children }: { children: ComponentChildren }) {
  return <div className="lz-kicker">{children}</div>;
}

function Header({ kicker, title }: HeaderProps) {
  const { chapter } = useSlide();
  const label = kicker === false ? null : (kicker ?? chapter?.label);
  return (
    <>
      {label ? <Kicker>{label}</Kicker> : <div className="lz-kicker" />}
      {title && <h1 className="lz-title">{title}</h1>}
    </>
  );
}

const frame = ({ light, small, bare }: FrameProps) => ({ light, small, bare });

/* ------------------------------------------------------------------ */

export interface TitleProps extends FrameProps {
  kicker?: string;
  title: ComponentChildren;
  subtitle?: ComponentChildren;
  /** Client logo (light version), path relative to the slide file, e.g. "img/client.svg". */
  client?: string;
  /** Big cut-off icon at the bottom right, e.g. "Rocket". */
  icon?: IconName;
  /** How much of the big icon is cut off. "light" keeps most of it visible: use it when the icon is hard to recognise when cut. Default "strong". */
  iconCut?: 'strong' | 'light';
}

/**
 * Opening slide on the teal gradient.
 * @example <Title kicker="Workshop · Datum" title="Titel des Vortrags" subtitle="Worum es geht, in einem Satz." client="img/client.svg" icon="Rocket" />
 */
export function Title({ kicker, title, subtitle, client, icon, iconCut, children, ...rest }: TitleProps) {
  const { deck } = useSlide();
  return (
    <Frame variant="title" hue="secondary" gradient {...frame(rest)} bare>
      <img className="lz-logo" src={logoOnDark} alt="Lionizers" />
      {icon && <BigIcon name={icon} cut={iconCut} />}
      {kicker && <Kicker>{kicker}</Kicker>}
      <h1 className="lz-hero">{title}</h1>
      {subtitle && <p className="lz-lead">{subtitle}</p>}
      {children}
      {client && (
        <div className="lz-client">
          <span>{deck.lang === 'de' ? 'FÜR' : 'FOR'}</span>
          <img src={client} alt="" />
        </div>
      )}
    </Frame>
  );
}

export interface SectionProps extends FrameProps {
  /** Default: the chapter name. */
  title?: ComponentChildren;
  subtitle?: ComponentChildren;
  /** Big cut-off icon at the bottom right. */
  icon?: IconName;
  /** How much of the big icon is cut off. "light" keeps most of it visible: use it when the icon is hard to recognise when cut. Default "strong". */
  iconCut?: 'strong' | 'light';
}

/**
 * Chapter divider. All chapters look the same: chapter number, title, teal gradient.
 * Inside a chapter folder, `<Section />` alone is enough.
 * @example <Section icon="ShieldCheck" subtitle="Was wir schützen und wie" />
 */
export function Section({ title, subtitle, icon, iconCut, children, ...rest }: SectionProps) {
  const { chapter } = useSlide();
  return (
    <Frame variant="section" hue="secondary" gradient {...frame(rest)}>
      {icon && <BigIcon name={icon} cut={iconCut} />}
      {chapter && <div className="lz-number">{pad(chapter.index + 1)}</div>}
      <h1 className="lz-hero">{title ?? chapter?.label}</h1>
      {subtitle && <p className="lz-lead">{subtitle}</p>}
      {children}
    </Frame>
  );
}

export interface ContentProps extends FrameProps, HeaderProps {}

/**
 * The standard slide: kicker, title, free content (HTML and components).
 * @example
 * <Content title="Was wollen wir erreichen?">
 *   <p>Text</p>
 *   <ul><li>Point</li></ul>
 * </Content>
 */
export function Content({ kicker, title, children, accent, ...rest }: ContentProps) {
  return (
    <Frame variant="content" hue={accent} {...frame(rest)}>
      <Header kicker={kicker} title={title} />
      <div className="lz-body">{children}</div>
    </Frame>
  );
}

export interface ColumnsProps extends FrameProps, HeaderProps {
  /** Relative widths of the columns, e.g. [2, 1]. Default: equal. */
  ratio?: number[];
}

/**
 * Title and two or more columns. Each child is a <Column>.
 * @example
 * <Columns title="H7 oder H5?">
 *   <Column label="Option A">…</Column>
 *   <Column label="Option B">…</Column>
 * </Columns>
 */
export function Columns({ kicker, title, ratio, children, accent, ...rest }: ColumnsProps) {
  const count = toChildArray(children).filter((c) => typeof c === 'object' && c.type !== Notes).length;
  const template = (ratio ?? Array(count).fill(1)).map((r) => `${r}fr`).join(' ');
  return (
    <Frame variant="columns" hue={accent} {...frame(rest)}>
      <Header kicker={kicker} title={title} />
      <div className="lz-body">
        <div className="lz-cols" style={{ gridTemplateColumns: template }}>
          {children}
        </div>
      </div>
    </Frame>
  );
}

export interface StatementProps extends FrameProps {
  kicker?: string | false;
}

/**
 * One sentence, large, with the amber bar. <strong> parts are set heavier.
 * @example <Statement>Der digitale Weg darf nicht <strong>billiger</strong> sein als der physische.</Statement>
 */
export function Statement({ kicker, children, accent, ...rest }: StatementProps) {
  return (
    <Frame variant="statement" hue={accent} {...frame(rest)}>
      <Header kicker={kicker} />
      <blockquote className="lz-statement">{children}</blockquote>
    </Frame>
  );
}

export interface QuoteProps extends FrameProps {
  kicker?: string | false;
  /** Name of the person. */
  by: string;
  /** Role and company. */
  role?: string;
}

/**
 * Quote of a person, in guillemets.
 * @example <Quote by="Vorname Nachname" role="Rolle, Firma">Ein kurzes Zitat in ein oder zwei Sätzen.</Quote>
 */
export function Quote({ kicker, by, role, children, accent, ...rest }: QuoteProps) {
  return (
    <Frame variant="quote" hue={accent} {...frame(rest)}>
      <Header kicker={kicker} />
      <blockquote className="lz-quote">
        <p>{children}</p>
        <cite>
          <strong>{by}</strong>
          {role}
        </cite>
      </blockquote>
    </Frame>
  );
}

export interface FeatureProps extends FrameProps {
  kicker?: string | false;
  title: ComponentChildren;
  /** Big cut-off icon at the bottom right. */
  icon?: IconName;
  /** How much of the big icon is cut off. "light" keeps most of it visible: use it when the icon is hard to recognise when cut. Default "strong". */
  iconCut?: 'strong' | 'light';
  /** Hue of the gradient. Default: steel. */
  color?: Hue;
}

/**
 * One key message on a coloured gradient with a big cut-off icon
 * (like the hero of lionizers.com). For the moments that matter: the solution, the offer.
 * @example <Feature icon="Construction" title="Erst Klarheit, dann Absicherung"><p>Text</p></Feature>
 */
export function Feature({ kicker, title, icon, iconCut, color = 'steel', children, ...rest }: FeatureProps) {
  const { chapter } = useSlide();
  const label = kicker === false ? null : (kicker ?? chapter?.label);
  return (
    <Frame variant="feature" hue={color} gradient {...frame(rest)}>
      {icon && <BigIcon name={icon} cut={iconCut} />}
      {label && <Kicker>{label}</Kicker>}
      <h1 className="lz-hero">{title}</h1>
      {children && <div className="lz-feature-text">{children}</div>}
    </Frame>
  );
}

export interface MediaProps extends FrameProps, HeaderProps {
  /** Image path, relative to the slide file (in a chapter folder: "../img/x.png"). */
  src?: string;
  alt?: string;
  /** A Lucide icon instead of an image, e.g. "Cpu". */
  icon?: IconName;
  /** Hue of the image half. Default: the teal of the chapter slides. */
  color?: Hue | 'secondary';
  /** Side of the image. Default: left. */
  side?: 'left' | 'right';
  /** "cover" fills the half (crops), "contain" shows the whole image. Default: cover. */
  fit?: 'cover' | 'contain';
}

/**
 * Image or big icon on one half (on a coloured gradient), kicker, title and text on the other half.
 * @example <Media icon="Cpu" color="teal" title="Ein Mikrocontroller"><p>Text</p></Media>
 * @example <Media src="../img/product.png" fit="contain" title="Das Produkt"><p>Text</p></Media>
 */
export function Media({ kicker, title, src, alt = '', icon, color = 'secondary', side = 'left', fit = 'cover', children, accent, ...rest }: MediaProps) {
  return (
    <Frame variant={`media media-${side}`} hue={accent} {...frame(rest)}>
      <div className={`lz-media-image lz-gradient fit-${icon ? 'icon' : fit}`} data-hue={color}>
        {icon ? <Icon name={icon} strokeWidth={2.2} /> : <img src={src} alt={alt} />}
      </div>
      <div className="lz-media-text">
        <Header kicker={kicker} title={title} />
        <div>{children}</div>
      </div>
    </Frame>
  );
}

export interface StatsProps extends FrameProps, HeaderProps {}

/**
 * Key figures on cards in a row. Each child is a <Stat>. Each card gets its own
 * colour (steel, teal, blue, …) unless it sets `color`.
 * @example
 * <Stats title="Kennzahlen">
 *   <Stat label="Aktive Nutzer" value="12" unit="Tsd." />
 *   <Stat label="Antwortzeit" value="180" unit="ms" />
 * </Stats>
 */
export function Stats({ kicker, title, children, accent, ...rest }: StatsProps) {
  let i = 0;
  const cards = toChildArray(children).map((c) =>
    isValidElement(c) && typeof c.type === 'function' && !(c.props as { color?: Hue }).color
      ? cloneElement(c as VNode<any>, { color: HUES[i++ % HUES.length] })
      : c,
  );
  return (
    <Frame variant="stats" hue={accent} {...frame(rest)}>
      <Header kicker={kicker} title={title} />
      <div className="lz-body">
        <div className="lz-stats">{cards}</div>
      </div>
    </Frame>
  );
}

export interface AgendaProps extends FrameProps, HeaderProps {}

/**
 * Numbered list of all chapters, made from the chapter folders.
 * Inside a chapter, the other chapters are dimmed.
 * @example <Agenda />
 */
export function Agenda({ kicker, title = 'Agenda', children, ...rest }: AgendaProps) {
  const { chapters, chapter } = useSlide();
  return (
    <Frame variant="agenda" {...frame(rest)}>
      <Header kicker={kicker} title={title} />
      <div className="lz-body" style={{ justifyContent: 'center' }}>
        <ol className="lz-agenda">
          {chapters.map((c) => (
            <li key={c.index} className={chapter && chapter.index !== c.index ? 'dim' : ''}>
              <span className="lz-number">{pad(c.index + 1)}</span>
              {c.label}
            </li>
          ))}
        </ol>
        {children}
      </div>
    </Frame>
  );
}

export interface EndProps extends FrameProps {
  title?: ComponentChildren;
}

/**
 * Closing slide with the logo and contact data. Children replace the default contact data.
 * @example <End title="Danke." />
 */
export function End({ title, children, ...rest }: EndProps) {
  const { deck } = useSlide();
  const de = deck.lang === 'de';
  return (
    <Frame variant="end" {...frame(rest)} bare>
      <img className="lz-end-logo" src={rest.light ? logoOnLight : logoOnDark} alt="Lionizers" />
      {title && <h1 className="lz-hero">{title}</h1>}
      {children ?? (
        <div className="lz-contact">
          <div className="lz-label">E-Mail</div>
          <div className="lz-label">{de ? 'Telefon' : 'Phone'}</div>
          <div className="lz-label">Web</div>
          <div>moin@lionizers.com</div>
          <div>+49 40 32 50 84 23</div>
          <div>lionizers.com</div>
        </div>
      )}
    </Frame>
  );
}
