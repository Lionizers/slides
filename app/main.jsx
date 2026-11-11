/**
 * Presentation runtime. Modes (URL query):
 *   (none)       slide view          #3 = slide 3, #3.2 = slide 3 at step 2
 *   ?presenter   current, next, notes, timer
 *   ?print       all slides as pages (used for the PDF). ?print&steps: one page per step
 *   ?source      every slide next to its source file. Key S switches between view and source
 */
import { Component, render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import * as deckModule from 'virtual:lionizers-deck';
// Same specifier as the deck components: a relative import gets another URL when the
// package is in node_modules (Vite adds ?v=), which loads a second SlideContext.
import { SlideContext } from 'lionizers-slides';
import { highlight } from './highlight.js';
import './app.css';

const WIDTH = 1280;
const HEIGHT = 720;
const params = new URLSearchParams(location.search);
const mode = ['presenter', 'print', 'source'].find((m) => params.has(m)) ?? 'view';

/* ---------- Deck data ---------- */

function buildDeck(mod) {
  const cfg = mod.config ? mod.config().props : {};
  const chapters = mod.chapters.map((c, i) => {
    const p = c.config ? c.config().props : {};
    return {
      index: i,
      label: p.label ?? c.label,
      accent: p.accent,
    };
  });
  const slides = mod.slides.map((s) => ({
    ...s,
    chapter: s.chapter >= 0 ? chapters[s.chapter] : null,
  }));
  return {
    name: mod.name,
    title: cfg.title ?? mod.name,
    lang: cfg.lang ?? 'de',
    transition: cfg.transition ?? 'fade',
    chapters,
    slides,
  };
}

/* ---------- Rendering one slide ---------- */

class Boundary extends Component {
  componentDidCatch(error) {
    this.setState({ error });
  }
  render({ file, children }, { error }) {
    if (!error) return children;
    return (
      <div class="lz">
        <div class="lz-error">{`${file}\n\n${error.stack ?? error}`}</div>
      </div>
    );
  }
}

/**
 * Steps: elements with data-step appear one after the other.
 * data-step="" takes the next number, data-step="3" a fixed one (from 1).
 * Elements after the current step get data-hidden (app.css hides them).
 * Returns the number of steps of the slide.
 */
function applySteps(root, step) {
  let count = 0;
  for (const el of root.querySelectorAll('[data-step]')) {
    const fixed = /^\d+$/.test(el.dataset.step) ? Number(el.dataset.step) : 0;
    const n = fixed || count + 1;
    count = Math.max(count, n);
    el.toggleAttribute('data-hidden', n > step);
  }
  return count;
}

/**
 * Morph: elements with the same data-morph name on two slides move from the
 * old to the new place when the slide changes (View Transitions API).
 * Names must be unique in the document, so only the main view sets them.
 */
function applyMorph(root) {
  for (const el of root.querySelectorAll('[data-morph]')) {
    el.style.viewTransitionName = 'lz-' + el.dataset.morph.replace(/[^\w-]/g, '-');
  }
}

/** One slide. `step` limits the visible steps (default: all). `onSteps` gets the number of steps. */
function SlideView({ deck, index, step = Infinity, onSteps, morph, notesTarget = null }) {
  const root = useRef();
  useLayoutEffect(() => {
    if (!root.current) return;
    const count = applySteps(root.current, step);
    if (morph) applyMorph(root.current);
    onSteps?.(count);
  });
  const slide = deck.slides[index];
  if (!slide) return <div class="lz" />;
  const ctx = {
    index,
    step,
    total: deck.slides.length,
    chapter: slide.chapter,
    chapters: deck.chapters,
    deck,
    notesTarget,
  };
  const { Component: Slide } = slide;
  return (
    <div class="slide-root" ref={root}>
      <SlideContext.Provider value={ctx}>
        <Boundary key={slide.file + slide.source.length} file={slide.file}>
          <Slide />
        </Boundary>
      </SlideContext.Provider>
    </div>
  );
}

/** Scales the 1280 × 720 slide to fit its container. */
function Stage({ children, class: cls = '' }) {
  const outer = useRef();
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = outer.current;
    const update = () => setScale(Math.min(el.clientWidth / WIDTH, el.clientHeight / HEIGHT));
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);
  return (
    <div class={`stage ${cls}`} ref={outer}>
      <div class="stage-slide" style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Navigation ---------- */

const clamp = (i, deck) => Math.max(0, Math.min(deck.slides.length - 1, i));

/** "#3.2" → slide index 2, step 2. */
function posFromHash(deck) {
  const [slide, step] = location.hash.slice(1).split('.');
  return { index: clamp((parseInt(slide, 10) || 1) - 1, deck), step: Math.max(0, parseInt(step, 10) || 0) };
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Current slide and step, kept in sync with the URL hash and with other windows.
 * `animate`: change slides with a view transition (cross-fade and morph).
 * Returns [pos, nav, setSteps]. Call setSteps with the number of steps of the shown slide.
 */
function usePosition(deck, { animate = false } = {}) {
  const [pos, setPos] = useState(() => posFromHash(deck));
  const [steps, setStepsState] = useState(0);
  const channel = useRef();
  useEffect(() => {
    channel.current = new BroadcastChannel(`lionizers-slides:${deck.name}`);
    channel.current.onmessage = (e) => setPos(e.data);
    const onHash = () => setPos(posFromHash(deck));
    addEventListener('hashchange', onHash);
    return () => {
      channel.current.close();
      removeEventListener('hashchange', onHash);
    };
  }, [deck.name]);
  useEffect(() => {
    if (Number.isFinite(pos.step)) history.replaceState(null, '', `#${pos.index + 1}${pos.step ? '.' + pos.step : ''}`);
  }, [pos.index, pos.step]);

  const go = (index, step = 0) => {
    const next = { index: clamp(index, deck), step };
    if (next.index === pos.index && next.step === pos.step) return;
    channel.current?.postMessage(next);
    const transition = animate && next.index !== pos.index && deck.transition !== 'none' && document.startViewTransition && !reducedMotion();
    if (transition) document.startViewTransition(() => flushSync(() => setPos(next)));
    else setPos(next);
  };
  const nav = {
    next: () => (pos.step < steps ? go(pos.index, pos.step + 1) : go(pos.index + 1, 0)),
    // Back to the previous slide shows it with all steps.
    prev: () => (pos.step > 0 ? go(pos.index, Math.min(pos.step, steps) - 1) : go(pos.index - 1, Infinity)),
    nextSlide: () => go(pos.index + 1, 0),
    prevSlide: () => go(pos.index - 1, 0),
    first: () => go(0),
    last: () => go(deck.slides.length - 1),
    go,
  };
  // The slide reports its number of steps after rendering. A step beyond the last one becomes the last one.
  const setSteps = (n) => {
    if (n !== steps) setStepsState(n);
    if (pos.step > n) setPos((p) => ({ ...p, step: n }));
  };
  return [{ ...pos, steps }, nav, setSteps];
}

function useKeys(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ref.current(e) !== false) e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

const NEXT = ['ArrowRight', 'PageDown', ' ', 'Enter'];
const PREV = ['ArrowLeft', 'PageUp', 'Backspace'];

function navKeys(e, nav) {
  if (NEXT.includes(e.key)) nav.next();
  else if (PREV.includes(e.key)) nav.prev();
  else if (e.key === 'ArrowDown') nav.nextSlide();
  else if (e.key === 'ArrowUp') nav.prevSlide();
  else if (e.key === 'Home') nav.first();
  else if (e.key === 'End') nav.last();
  else return false;
}

function openSource(index) {
  location.assign(`${location.pathname}?source#slide-${index + 1}`);
}

function openPresenter() {
  window.open(`${location.pathname}?presenter${location.hash}`, 'lionizers-presenter', 'width=1400,height=850');
}

/* ---------- Modes ---------- */

function Viewer({ deck }) {
  const [pos, nav, setSteps] = usePosition(deck, { animate: true });
  const { index } = pos;
  const go = (i) => nav.go(i);
  const [overview, setOverview] = useState(false);
  const [help, setHelp] = useState(false);

  useKeys((e) => {
    if (overview) {
      const cols = 4;
      const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      if (e.key in moves) return go(index + moves[e.key]);
      if (['Enter', 'Escape', 'o', ' '].includes(e.key)) return setOverview(false);
      return false;
    }
    if (navKeys(e, nav) !== false) return;
    if (e.key === 'o' || e.key === 'Escape') setOverview(true);
    else if (e.key === 'p') openPresenter();
    else if (e.key === 's') openSource(index);
    else if (e.key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    else if (e.key === '?' || e.key === 'h') setHelp((h) => !h);
    else return false;
  });

  if (overview) {
    return (
      <div class="overview">
        {deck.slides.map((s, i) => (
          <button
            key={s.file}
            class={`thumb ${i === index ? 'active' : ''}`}
            onClick={() => {
              go(i);
              setOverview(false);
            }}
          >
            <Stage>
              <SlideView deck={deck} index={i} />
            </Stage>
            <span class="thumb-label">
              {i + 1} · {s.file}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div class="viewer">
      <Stage>
        <SlideView deck={deck} index={index} step={pos.step} onSteps={setSteps} morph />
      </Stage>
      {help && <Help />}
    </div>
  );
}

function Help() {
  const rows = [
    ['→ / Space / PageDown', 'next step or slide'],
    ['← / PageUp', 'previous step or slide'],
    ['↓ / ↑', 'next / previous slide, without steps'],
    ['O / Esc', 'overview'],
    ['P', 'presenter view (notes, next slide, timer)'],
    ['S', 'source view: every slide next to its code'],
    ['F', 'fullscreen'],
    ['H / ?', 'this help'],
  ];
  return (
    <div class="help">
      {rows.map(([k, v]) => (
        <div key={k}>
          <kbd>{k}</kbd>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

function Presenter({ deck }) {
  const [pos, nav, setSteps] = usePosition(deck);
  const { index, steps } = pos;
  const step = Math.min(pos.step, steps);
  const [notesEl, setNotesEl] = useState(null);
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useKeys((e) => {
    if (navKeys(e, nav) !== false) return;
    if (e.key === 'r') setStart(Date.now());
    else return false;
  });
  const elapsed = Math.floor((now - start) / 1000);
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const slide = deck.slides[index];

  return (
    <div class="presenter">
      <div class="p-current">
        <Stage>
          <SlideView deck={deck} index={index} step={pos.step} onSteps={setSteps} notesTarget={notesEl} />
        </Stage>
      </div>
      <div class="p-side">
        <div class="p-next">
          <div class="p-caption">NEXT</div>
          <Stage>
            {/* Next: the next step of this slide, or the next slide before its first step. */}
            {step < steps ? (
              <SlideView deck={deck} index={index} step={step + 1} />
            ) : index + 1 < deck.slides.length ? (
              <SlideView deck={deck} index={index + 1} step={0} />
            ) : (
              <div class="lz" />
            )}
          </Stage>
        </div>
        <div class="p-status">
          <div>
            <div class="p-caption">SLIDE</div>
            <div class="p-big">
              {index + 1} / {deck.slides.length}
            </div>
          </div>
          {steps > 0 && (
            <div>
              <div class="p-caption">STEP</div>
              <div class="p-big">
                {step} / {steps}
              </div>
            </div>
          )}
          <div>
            <div class="p-caption">TIME (R = RESET)</div>
            <div class="p-big">{mmss}</div>
          </div>
          <div>
            <div class="p-caption">CLOCK</div>
            <div class="p-big">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      </div>
      <div class="p-notes">
        <div class="p-caption">NOTES · {slide?.file}</div>
        <div ref={setNotesEl} />
      </div>
    </div>
  );
}

function Print({ deck }) {
  // ?print&steps: one page per step. The first render counts the steps of every slide.
  const withSteps = params.has('steps');
  const counted = useRef([]);
  const [counts, setCounts] = useState(null);
  const pages = withSteps && counts
    ? deck.slides.flatMap((s, i) => Array.from({ length: counts[i] + 1 }, (_, step) => ({ index: i, step })))
    : deck.slides.map((s, i) => ({ index: i, step: Infinity }));

  useEffect(() => {
    if (withSteps && !counts) return setCounts(counted.current);
    // Signal for the PDF export: fonts and images are loaded.
    const images = [...document.images].map((img) => img.decode().catch(() => {}));
    Promise.all([document.fonts.ready, ...images]).then(() => {
      window.__lionizersOverflow = findOverflow(deck);
      window.__lionizersReady = true;
    });
  }, [counts]);
  return (
    <div class="print">
      {pages.map(({ index, step }) => (
        <div class="print-page" key={`${deck.slides[index].file}:${step}`} data-slide={index}>
          <SlideView deck={deck} index={index} step={step} onSteps={(n) => (counted.current[index] = n)} />
        </div>
      ))}
    </div>
  );
}

/** Elements on purpose at the edge of a slide. Components mark them with data-edge. */
const EDGE = '[data-edge], [data-edge] *, .lz-logo, .lz-footer, .lz-footer *, .lz-media-image, .lz-media-image *, .lz-media-text';
/** Minimum distance of content from the slide edge, in px. */
const SAFE = 32;

/**
 * Finds slides with content outside the safe area (text too long, too many
 * rows, a diagram too wide). Used by `check` and `pdf`.
 */
function findOverflow(deck) {
  const result = [];
  document.querySelectorAll('.print-page').forEach((page) => {
    const i = Number(page.dataset.slide);
    if (result.some((r) => r.slide === i + 1)) return;
    const r = page.getBoundingClientRect();
    const bad = new Set();
    for (const el of page.querySelectorAll('.lz *')) {
      if (el.matches(EDGE) || el.closest('[data-hidden]')) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const out = [];
      if (b.top < r.top + SAFE) out.push('top');
      if (b.bottom > r.bottom - SAFE) out.push('bottom');
      if (b.left < r.left + SAFE) out.push('left');
      if (b.right > r.right - SAFE) out.push('right');
      if (out.length) out.forEach((o) => bad.add(o));
    }
    if (bad.size) result.push({ slide: i + 1, file: deck.slides[i].file, edges: [...bad] });
  });
  return result;
}

function Source({ deck }) {
  // S or Esc: back to the slide view, at the first slide that is visible at the top.
  useKeys((e) => {
    if (e.key !== 's' && e.key !== 'Escape') return false;
    const sections = [...document.querySelectorAll('.source section')];
    const top = sections.findIndex((el) => el.getBoundingClientRect().bottom > 80);
    location.assign(`${location.pathname}#${Math.max(top, 0) + 1}`);
  });
  return (
    <div class="source">
      <header>
        <h1>{deck.title}</h1>
        <p>
          {deck.slides.length} slides. Each slide is shown next to its source file. Click a slide to open it, or press S to go back.
        </p>
      </header>
      {deck.slides.map((s, i) => (
        <section key={s.file} id={`slide-${i + 1}`}>
          <a class="source-preview" href={`./#${i + 1}`}>
            <Stage>
              <SlideView deck={deck} index={i} />
            </Stage>
          </a>
          <div class="source-code">
            <div class="source-file">{s.file}</div>
            <pre>
              {highlight(s.source).map(([cls, text]) => (cls ? <span class={cls}>{text}</span> : text))}
            </pre>
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- Mount ---------- */

const MODES = { view: Viewer, presenter: Presenter, print: Print, source: Source };

function mount(mod) {
  const deck = buildDeck(mod);
  document.title = mode === 'presenter' ? `Presenter · ${deck.title}` : deck.title;
  document.documentElement.lang = deck.lang;
  document.body.className = `mode-${mode}`;
  const Mode = MODES[mode];
  render(<Mode deck={deck} />, document.getElementById('app'));
}

mount(deckModule);

if (import.meta.hot) {
  import.meta.hot.accept('virtual:lionizers-deck', (mod) => mod && mount(mod));
}
