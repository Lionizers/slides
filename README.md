# lionizers-slides

Presentations in the Lionizers CI, **written by your coding agent**.

You tell Claude Code (or any other coding agent) what the talk is about. The agent writes the
slides, checks them and fixes what does not fit. You look at the result in the browser and give
feedback, as you would with a colleague.

The format is made for people too: one short file per slide, plain HTML, no imports, no config.
You can read every slide, change a word by hand, or move a slide by renaming its file.

**See it:** [reference deck](https://lionizers.github.io/slides/) with every layout and component ·
[the same deck as one HTML file](https://lionizers.github.io/slides/lionizers-slides.html) (download it, open it, no server needed).

## Start a deck

You need Node.js 20 or newer and access to this repository (SSH key or `gh auth login`).
The tool comes directly from GitHub, not from the npm registry. No npm account is necessary.

```sh
npx github:lionizers/slides init my-talk   # new deck with the CI and a guide for the agent
cd my-talk
npx github:lionizers/slides                # opens the deck in the browser, reloads on every change
```

Then start your agent in the deck folder and tell it what you need:

```
Make a 20-minute talk for the kick-off with our new client. Material is in ~/Notes/kickoff.md.
Chapters: starting point, goals, plan, next steps. Speaker notes for every slide.
```

Keep the browser open next to the agent. Every change shows immediately.

Faster to start, shorter to type: install the tool once. To update, run the same command again.

```sh
npm install -g github:lionizers/slides
lionizers-slides init my-talk
```

## How the agent knows what to do

`init` puts an `AGENTS.md` into the deck (and a `CLAUDE.md` that points to it). It tells the agent
the layouts, components, CI rules and the workflow. The agent reads it on its own.
The full guide is [template/AGENTS.md](template/AGENTS.md).

After each change, the agent runs `lionizers-slides check`. It type-checks all slides and renders
them in a headless Chrome. It finds unknown components, wrong props, unknown icons, and text that is
too long for the slide. The agent fixes these problems before you see them.

Good feedback for the agent is specific: "slide 4 is too dense, split it", "show the plan as a
process", "the diagram on slide 7 should build up step by step".

## What a slide looks like

```tsx
// my-talk/02-goals/01-what-we-want.tsx
<Content title="What do we want to achieve?">
  <ul>
    <li>Release new features faster</li>
    <li>Less effort in operation</li>
  </ul>
  <Notes>
    - Ask the audience: what matters most to you?
  </Notes>
</Content>
```

The root element is the layout: `Title`, `Content`, `Columns`, `Statement`, `Quote`, `Feature`,
`Media`, `Stats`, `Section`, `Agenda`, `End`. Inside: plain HTML, components such as cards,
processes, box diagrams and click-by-click steps, or free HTML with Tailwind in the CI colours.
`lionizers-slides docs` shows every layout next to its source.

```
my-talk/
  00-title.tsx            slides, sorted by name
  01-agenda.tsx
  02-goals/               folder = chapter, its name is the label above the titles
    01-what-we-want.tsx
  99-end.tsx
  _deck.tsx               deck settings (title, language)
  img/                    images
  AGENTS.md, CLAUDE.md    the guide for the agent
  .lionizers/
    components/           the CI: layouts, components, theme, fonts, logos. Part of the deck, in git
    built-with            commit of the tool that the deck last worked with
```

In the browser, `?source` shows every slide next to its source file. That helps when you want
to tell the agent exactly what to change, or change it yourself.

## Present and share

| Key | Does |
| --- | --- |
| `→` `←` | next / previous step or slide |
| `O` | overview of all slides |
| `P` | presenter view in a second window: notes, next slide, timer |
| `F` | fullscreen |
| `H` | help |

To give the deck to other people:

- **`lionizers-slides html`** writes one HTML file with everything inside: fonts, images, steps,
  transitions, presenter view. Send it to a client or put it in a shared drive. It opens in any
  browser, without a server and without an internet connection.
- **`lionizers-slides pdf`** writes a PDF with one page per slide (`--steps`: one page per step).
  It uses the installed Google Chrome.
- **`lionizers-slides build`** writes a static website, for example for GitHub Pages.

## Commands

| Command | Does |
| --- | --- |
| `lionizers-slides [dir]` | Dev server with live reload. Default dir: `.` |
| `lionizers-slides init [dir]` | New deck: sample slides, the CI components, `AGENTS.md` |
| `lionizers-slides check [dir]` | Type-check and render all slides, find content that does not fit |
| `lionizers-slides html [dir] [-o file]` | One HTML file with everything inside |
| `lionizers-slides pdf [dir] [-o file] [--steps]` | PDF, one page per slide or per step |
| `lionizers-slides build [dir] [-o dir]` | Static website in `.lionizers/dist/` |
| `lionizers-slides docs` | Reference deck: every layout next to its source |
| `lionizers-slides guide` | Print the guide for agents (`AGENTS.md`) |

Options: `-p <port>` (default 4747), `--no-open`.

## Versions

**The CI is part of the deck.** `init` copies the current components (`.lionizers/components/`)
into the deck, and the deck owns them from then on. So a deck looks the same in five years.
New CI versions only reach new decks. A deck can also change or extend its copy: every export
of the components folder is available in all slides.

**The tool is not pinned.** A deck always runs with the installed version of the tool. Changes to
the tool should stay compatible. As a fallback, `.lionizers/built-with` records the commit of the
tool that the deck last worked with (`init` writes it, a `check` without errors updates it).
If the installed tool is another commit, the dev server and a failing `check` show the command
for the old version: `npx github:lionizers/slides#<commit>`.

**Why there is a `CLAUDE.md`:** Claude Code reads `AGENTS.md` on its own, but not when a `CLAUDE.md`
exists in a parent folder (common when a deck is part of a bigger repository), and not in all setups.
The `CLAUDE.md` only contains `@AGENTS.md`.

## Develop this package

```sh
npm install
npm run dev     # the reference deck in examples/
npm run docs    # same, in source view
node bin/cli.js check examples
```

There are no version numbers and no tags. Every push to `main` is the new version, named by its
commit hash. On install, `scripts/prepare.js` writes the hash into `.commit`, because npm does not
copy the `.git` folder. A push to `main` also publishes the reference deck to GitHub Pages
(`.github/workflows/pages.yml`).

How it works:

- **Vite plugin** (`src/plugin.js`): finds the slide files, wraps the bare JSX of each slide into a
  module (imports for all exports of the components + a default export, all in the first line so
  that line numbers stay right), turns relative `src="img/x.png"` into imports, and turns plain text
  in `<Notes>` into a string so that line breaks survive.
- **Types**: the plugin writes `.lionizers/types/globals.d.ts` (`declare global { const Content: typeof import(…) }`)
  and a tsconfig. Editors and `tsc` then know every component and prop without imports.
- **Runtime** (`app/`): Preact. Viewer, overview, presenter view (BroadcastChannel sync), print view
  for the PDF (Playwright + installed Chrome), source view. The slide is always 1280 × 720 and scaled.
- **Styling**: `.lionizers/components/theme.css` – the CI as CSS, plus Tailwind v4 with a theme that contains
  only the CI colours and fonts.
- **One HTML file** (`html`): a normal Vite build with all assets inlined as data URLs, then the
  script and the stylesheet are put into `index.html`.
