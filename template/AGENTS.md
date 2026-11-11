# Slides in the Lionizers CI

This folder is a presentation. Every `.tsx` file is one slide.
The tool is `lionizers-slides`. It comes from the GitHub repository `lionizers/slides`, not from the npm registry.
If the command `lionizers-slides` is not installed, use `npx github:lionizers/slides` in its place
(or install it once: `npm install -g github:lionizers/slides`).

```sh
lionizers-slides          # dev server with live reload (opens the browser)
lionizers-slides check    # type-check, then render all slides and find overflow – run it after every change
lionizers-slides pdf      # write <folder>.pdf
lionizers-slides html     # write <folder>.html: one file with everything, opens without a server
lionizers-slides build    # static site in .lionizers/dist/
lionizers-slides docs     # reference deck: every layout and component next to its source
lionizers-slides guide    # print this guide
```

Keys in the browser: `→` `←` next / previous step or slide · `O` overview · `P` presenter view (notes, next slide, timer) · `F` fullscreen.
`?source` after the URL shows every slide next to its source file.

## Files and order

```
00-title.tsx              slide outside a chapter
01-agenda.tsx
02-ausgangslage/          folder = chapter. Its name is the kicker (">> AUSGANGSLAGE") of its slides
  _chapter.tsx            optional: <Chapter label="Ausgangslage" />
  01-ziele.tsx
  02-zeitplan.tsx
99-end.tsx
_deck.tsx                 optional: <Deck title="…" lang="de" transition="fade" />
img/                      images (any folder name works)
.lionizers/components/    layouts and components of this deck (your code, change it freely)
.lionizers/built-with     version (commit) of lionizers-slides this deck last worked with
.lionizers/types/         generated type definitions (not in git, do not edit)
```

- Slides are sorted by file name. Use number prefixes. To move a slide, rename it.
- Chapter label from the folder name: the number prefix is removed, `-` and `_` become spaces,
  the first letter becomes a capital (`02-erste-schritte` → "Erste schritte"; the kicker shows it in
  uppercase anyway). Umlauts in folder names work. For an exact label use `_chapter.tsx`.
- All chapters look the same. A chapter usually starts with `<Section />`, which shows the chapter number and name.
- Only one folder level. Folders without slide files (e.g. `img/`) are not chapters.
- Files and folders that start with `_` or `.` are not slides.
- `dist/`, `node_modules/`, `public/` are never chapters.

## A slide file

A slide file contains **only one JSX element**: the layout. No imports, no export.
All exports of `.lionizers/components/` are available everywhere.

```tsx
<Content title="Was wollen wir erreichen?">
  <p>Drei Ziele für das nächste Jahr:</p>
  <ul>
    <li>Neue Funktionen schneller live bringen</li>
    <li>Weniger Aufwand im Betrieb</li>
  </ul>
  <Notes>
    - Frage in den Raum: Was fehlt?
    - Das dritte Ziel kommt auf der nächsten Folie.
  </Notes>
</Content>
```

To change the layout, change the name of the root element.

JSX rules that matter:

- `{` and `}` in text must be written as `{'{'}` and `{'}'}`. `<` must be `&lt;`.
- Use `className`, not `class`.
- A comment above the root element uses `//`. Inside JSX use `{/* … */}`.
- Code blocks: ``<pre><code>{`…`}</code></pre>`` (the template string keeps the line breaks).
- Image paths are relative to the slide file. This applies to every string that ends in an image
  extension: `<img src>`, `<Media src>`, `<Title client>`. In a chapter folder that is
  `src="../img/chart.png"`, at the top level `src="img/chart.png"`.

## Layouts

All layouts accept `light` (light canvas), `small` (less font size for dense slides), `bare` (no logo, no footer).
Layouts with a title also accept `kicker` (default: chapter name, `false` hides it) and `accent` (hue for table headers and labels).

| Layout | Use for | Main props / children |
| --- | --- | --- |
| `<Title>` | first slide, teal gradient | `kicker`, `title`, `subtitle`, `client` (logo path), `icon` |
| `<Agenda>` | list of chapters, made from the folders | `title` (default "Agenda") |
| `<Section>` | chapter divider: number, name, teal gradient | `subtitle`, `icon`. `title` defaults to the chapter name |
| `<Content>` | the standard slide | `title`, free content |
| `<Columns>` | two or more columns | `title`, `ratio={[2, 1]}`, children: `<Column label="…">` |
| `<Statement>` | one sentence, large | children: the sentence; `<strong>` parts are heavier |
| `<Quote>` | quote of a person | children: the quote, `by`, `role` |
| `<Feature>` | one key message on a coloured gradient with a big icon | `title`, `icon`, `color`, children: short text |
| `<Media>` | image or big icon on one half (coloured gradient), text on the other | `src` or `icon`, `color`, `side="left\|right"`, `fit="cover\|contain"`, `title` |
| `<Stats>` | key figures on cards, each card in its own colour | children: `<Stat label="…" value="99.9" unit="%" />` |
| `<End>` | last slide, logo and contact | `title` |

`icon` props take a Lucide icon name in PascalCase (lucide.dev/icons), e.g. `"ShieldCheck"`, `"Cpu"`,
`"Construction"`. `check` reports unknown names. Write icon names as complete strings, also in own
components (`'FileCode'`, not `'File' + type`): `html` and `build` contain only the icons whose names they find. Big icons are cut off at the bottom right on purpose.
If an icon is hard to recognise when cut (e.g. a thin shape), add `iconCut="light"`.

The exact props with descriptions are in `.lionizers/components/layouts.tsx` (and in your editor's autocomplete).

## Content

Plain HTML is styled in the CI:

| Element | Looks like |
| --- | --- |
| `<p>` | body text, 70 % white |
| `<strong>` | full white, semi-bold |
| `<em>` | amber signal word. One per slide at most |
| `<ul>` / `<ol>` | amber dash / large amber numbers 01, 02. Nested lists are smaller |
| `<table>` with `<thead>` | tinted box, mono header in the accent colour |
| `<blockquote>` | amber bar on the left |
| `<h2>`, `<h3>` | small heading inside the content |
| `<code>`, `<pre>` | mono, tinted background |

Components:

| Component | Use for |
| --- | --- |
| `<Step>` / `<Steps>` | content that appears click by click, see "Steps and transitions" below |
| `<Notes>` | speaker notes. Plain text; line breaks are kept, `- ` lines become bullets, a blank line starts a paragraph. Visible in the presenter view (`P`) and in `?source` |
| `<Grid cols={3}>` / `<Grid ratio={[2, 1]}>` | columns inside any layout (default: one column per child). Put `<Column label>`, cards or anything inside |
| `<CheckList>` / `<CrossList>` | lists with green checks / red crosses. Children are `<li>` |
| `<Yes />` / `<No />` | green check / red cross inline, e.g. in table cells |
| `<Icon name="Cpu" />` | Lucide icon, as large as the text |
| `<Card color label title>` | card with a colour bar. Several in a `<Grid>` |
| `<Process>` + `<Phase label title>` | phases as chevrons from left to right (time plans, procedures) |
| `<Stat label value unit color>` | key figure on a card: mono label, large number, unit. Children: short text below |
| `<Tag highlight>` | mono pill. `highlight` = accent border |
| `<Footnote>` | mono line at the bottom, e.g. a source |
| `<Diagram>`, `<Lane>`, `<Row>`, `<Box>`, `<Connector>` | box diagrams, see below |
| `<Timeline steps={[…]}>` | example of an own component, see `.lionizers/components/Timeline.tsx` |

Colours (`color` of cards and boxes, `accent` of layouts): `steel`, `teal`, `blue`, `violet`, `olive`,
`gold`, `orange`, `green`, `red`. Give things that are different different colours; give the same
thing the same colour on every slide. Red and green mean bad and good: use them only for that.

Columns with content below them (the `<Columns>` layout has nothing below the columns):

```tsx
<Content title="Selbst bauen oder kaufen?">
  <Grid cols={2}>
    <Column label="Selbst bauen"><ul><li>volle Kontrolle</li></ul></Column>
    <Column label="Kaufen"><ul><li>schneller Start</li></ul></Column>
  </Grid>
  <blockquote>Vorschlag: Basis kaufen, Kern selbst bauen</blockquote>
</Content>
```

## Box diagrams

A `<Lane>` is a column of rows from top to bottom. A `<Row>` holds boxes side by side.
A `<Connector>` draws the lines between the row above and the row below it.

```tsx
<Lane>
  <Row width="half"><Box center name="Testdaten" /></Row>
  <Connector to={2} label="HTTPS" />              {/* 1 box above → 2 boxes below */}
  <Row>
    <Box variant="accent" name="Neue Version" tags={['v2']} />
    <Box name="Alte Version" tags={['Referenz']} />
  </Row>
  <Connector from={2} />                          {/* 2 → 1 */}
  <Row width="half"><Box center name="Vergleich" highlight={['100 % gleich']} /></Row>
</Lane>
```

- One diagram: a `<Lane>` alone. Several diagrams side by side (before / after): `<Lane>`s in a `<Diagram>`.
- `<Row width="half">` / `"third"`: one box as wide as one box of a row with 2 / 3 boxes. Any CSS width also works.
- Boxes look like cards: neutral surface, colour bar on the left. `<Box color="teal">` sets the bar
  (default steel). Give boxes that stand for different things different colours. `variant="accent"`
  (brighter surface) is the box to look at.
  `tags` are small mono labels, `highlight` tags get an accent border (e.g. what is new).
- `<Connector from={n} to={m}>`: n boxes above, m below (1 → 1, 1 → m, n → 1). Lines start at a dot
  and end in an arrow. `label` sits on the stem, `branchLabels={{ 0: 'gesteckt' }}` on single branches.
- To join the lanes of a `<Diagram>`, put `<Connector from={2} across />` directly below the
  `<Diagram>` and a `<Row>` below it.
- `<Diagram stretch>` makes all lanes the same height; `<Connector grow>` then fills the free
  height of the shorter lane.

If a diagram does not fit this model, write an own component (next section).

## Steps and transitions

Content can appear click by click. `→`, Space and a clicker show the next step, then the next slide.
`↓` / `↑` go to the next / previous slide without steps.

```tsx
<Content title="Drei Gründe">
  <ul>
    <Steps>
      <li>Erscheint beim ersten Klick</li>
      <li>beim zweiten</li>
    </Steps>
  </ul>
  <Step><blockquote>Erscheint beim dritten Klick</blockquote></Step>
</Content>
```

- `<Steps>`: each child is one step. `<Step>`: everything inside is one step. Both work around
  anything: text, cards in a `<Grid>`, `<Box>` and `<Connector>` in a diagram.
- Steps count in the order of the source. `<Step at={2}>` gives a fixed number (from 1); several
  elements with the same number appear together. Hidden steps keep their space, nothing moves.
- Free HTML can use the attribute directly: `<div data-step="">`.
- Use steps for a reason (build a diagram, answer a question), not on every slide.
- Overview and PDF show the slide with all steps. `pdf --steps` writes one page per step.

Slides change with a short cross-fade (`<Deck transition="none" />` turns it off).
**Morph:** a `<Box>` or `<Card>` with the same `morph` name on two slides that follow each other
moves from its old place to its new place. Use it for before / after slides:

```tsx
// 03-vorher.tsx                                // 04-nachher.tsx
<Box name="Server" morph="server" />             <Box name="Server" morph="server" color="violet" />
```

Free HTML: `data-morph="name"`. A name may appear only once per slide.

## Own components and diagrams

For anything the layouts do not cover (diagrams, charts, special visuals):

1. Create a file in `.lionizers/components/`, e.g. `.lionizers/components/DataFlow.tsx`.
2. Export a function with a capital name. Use HTML and Tailwind classes. Use `.lionizers/components/Timeline.tsx` as a template.
3. Use it in a slide: `<Content title="…"><DataFlow /></Content>`. No import needed.

Small one-off visuals can also be written directly in the slide with Tailwind classes.

Tailwind has **only the CI colours**. Other colours (e.g. `blue-500`) do not exist.

| Class part | Colour |
| --- | --- |
| `fg`, `muted`, `faint` | text: full, 70 %, 45 % (works on dark and light slides) |
| `line`, `tint`, `canvas` | borders, card backgrounds, slide background |
| `good`, `bad` | green and red with a meaning |
| `primary` | amber. Signal only: the one thing to look at |
| `secondary` | teal of the title and chapter slides |
| `{hue}-{role}` | the palette: hue `steel teal blue violet olive gold orange green red`, role `surface-deep surface card button ink` (dark → bright). E.g. `bg-steel-surface border-steel-card text-steel-ink` |
| `accent-{role}` | the hue of the nearest element with `data-hue="…"` (cards and boxes set it) |

The gradient of title, chapter and feature slides is the class `lz-gradient` (with `data-hue`).

Fonts: `font-sans` (Barlow, default), `font-mono` (JetBrains Mono). The slide is always 1280 × 720 px; use px sizes.
To get information about the current slide (chapter, page number) in a component: `import { useSlide } from 'lionizers-slides'`.

## CI rules

The full CI is in the `lionizers-ci` repository. The rules that matter most on slides:

- Dark first. `light` is the exception.
- Barlow for everything that is read. JetBrains Mono only for labels, tags, figures in diagrams. Mono is always uppercase and never used for sentences.
- Amber (`primary`, `<em>`) is a signal. One per slide.
- Colours tell things apart (boxes, cards). Red and green only for bad and good.
- No emojis, no stock photos, no decorative images, no shadows, no other gradients, no round pill shapes.
- Icons: Lucide only, stroke, one colour.
- Short sentences. One message per slide. Details go into `<Notes>`.

## Checklist after changes

1. `lionizers-slides check` reports no errors. It checks the types and renders every slide:
   content that is too close to the edge or beyond it is reported with the slide file.
   Fix it: shorten the text, use `small`, or split the slide.
2. Look at the slides (`lionizers-slides`, or `?source`), or write the PDF and look at the pages.
