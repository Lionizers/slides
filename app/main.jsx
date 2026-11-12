/**
 * Presentation runtime. Modes (URL query):
 *   (none)       slide view          #3 = slide 3, #3.2 = slide 3 at step 2
 *   ?presenter   current, next, notes, timer
 *   ?print       all slides as pages (used for the PDF). ?print&steps: one page per step,
 *                ?print&notes: with the speaker notes in a hidden .print-notes per page (for exports)
 *   ?source      every slide next to its source file. Key S switches between view and source
 *   ?remote      phone remote: current slide, notes, next, buttons (dev server only, see src/remote.js)
 *   ?audience    audience view on a phone: follows the talk, shows the slides shown so far (dev server only)
 */
import { Component, render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { flushSync } from 'preact/compat';
import * as deckModule from 'virtual:lionizers-deck';
// Same specifier as the deck components: a relative import gets another URL when the
// package is in node_modules (Vite adds ?v=), which loads a second SlideContext.
import { SlideContext } from 'lionizers-slides';
import { highlight } from './highlight.js';
import { renderSVG } from 'uqr';
import './app.css';

const WIDTH = 1280;
const HEIGHT = 720;
const params = new URLSearchParams(location.search);
const mode = ['presenter', 'print', 'source', 'remote', 'audience'].find((m) => params.has(m)) ?? 'view';

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

const hot = import.meta.hot;

/**
 * Sends and receives positions between windows. The dev server relays them over its
 * WebSocket, also to phones (see src/remote.js). A static build has no server: there,
 * a BroadcastChannel connects the windows of one browser.
 * `follow`: take the last known position when the window opens (the phone remote).
 */
function openChannel(deck, onPos, { follow }) {
  // JSON has no Infinity ("all steps"): it travels as -1.
  const encode = (p) => ({ index: p.index, step: Number.isFinite(p.step) ? p.step : -1 });
  const decode = (p) => ({ index: p.index, step: p.step < 0 ? Infinity : p.step });
  if (hot) {
    const listener = (data) => onPos(decode(data));
    hot.on('lionizers:pos', listener);
    hot.send('lionizers:hello', { follow });
    return {
      send: (p) => hot.send('lionizers:pos', encode(p)),
      // Tells the server where this window is, without moving the others.
      here: (p) => hot.send('lionizers:here', encode(p)),
      close: () => hot.off('lionizers:pos', listener),
    };
  }
  const bc = new BroadcastChannel(`lionizers-slides:${deck.name}`);
  bc.onmessage = (e) => onPos(e.data);
  return { send: (p) => bc.postMessage(p), here: () => {}, close: () => bc.close() };
}

/**
 * Current slide and step, kept in sync with the URL hash and with other windows.
 * `animate`: change slides with a view transition (cross-fade and morph).
 * Returns [pos, nav, setSteps]. Call setSteps with the number of steps of the shown slide.
 */
function usePosition(deck, { animate = false, follow = false } = {}) {
  // A phone (follow) takes its position from the talk, not from its URL.
  const [pos, setPos] = useState(() => (follow ? { index: 0, step: 0 } : posFromHash(deck)));
  const [steps, setStepsState] = useState(0);
  const channel = useRef();
  const current = useRef(pos);
  current.current = pos;

  const show = (next) => {
    const transition = animate && next.index !== current.current.index && deck.transition !== 'none' && document.startViewTransition && !reducedMotion();
    if (transition) document.startViewTransition(() => flushSync(() => setPos(next)));
    else setPos(next);
  };
  useEffect(() => {
    channel.current = openChannel(deck, (p) => show({ index: clamp(p.index, deck), step: p.step }), { follow });
    if (!follow) channel.current.here(current.current);
    const onHash = () => {
      if (follow) return;
      const p = posFromHash(deck);
      setPos(p);
      channel.current.here(p);
    };
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
    channel.current?.send(next);
    show(next);
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
  const audienceQr = useAudienceQr();

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
    else if (e.key === 'a' && hot) toggleAudienceQr(audienceQr);
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
        <AudienceQrOverlay qr={audienceQr} />
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
    ...(hot ? [['A', 'QR code for the audience: they follow on their phones']] : []),
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

/** Elapsed time since start (mm:ss) and the clock, updated every second. */
function useTimer() {
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.floor((now - start) / 1000);
  return {
    elapsed: `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`,
    clock: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    reset: () => setStart(Date.now()),
  };
}

/** What comes next: the next step of this slide, or the next slide before its first step. */
function NextView({ deck, index, step, steps }) {
  if (step < steps) return <SlideView deck={deck} index={index} step={step + 1} />;
  if (index + 1 < deck.slides.length) return <SlideView deck={deck} index={index + 1} step={0} />;
  return <div class="lz" />;
}

/** Value of a custom event from the dev server. */
function useServerEvent(event, initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (!hot) return;
    hot.on(event, setValue);
    return () => hot.off(event, setValue);
  }, [event]);
  return value;
}

/** Paired phones, and the audience devices (null while the access for the audience is closed). */
const useRemoteStatus = () => useServerEvent('lionizers:remote', { devices: 0, audience: null });

const remoteApi = (action) => fetch(`/__lionizers/remote/${action}`, { method: 'POST' }).then((r) => r.json());

/** The QR code for the audience, shown over the slides (key A). The server keeps it in sync for all windows. */
const useAudienceQr = () => useServerEvent('lionizers:audience-qr', { visible: false, url: null });
const toggleAudienceQr = (qr) => remoteApi(qr.visible ? 'audience/hide' : 'audience/show');

/** Large QR code over the slide, in slide coordinates (1280 × 720). */
function AudienceQrOverlay({ qr }) {
  if (!qr.visible || !qr.url) return null;
  return (
    <div class="aq">
      <div class="aq-code" dangerouslySetInnerHTML={{ __html: renderSVG(qr.url, { ecc: 'M', border: 2 }) }} />
      <div class="aq-text">
        <div class="aq-label">SLIDES ON YOUR PHONE</div>
        <div class="aq-title">Scan the code to follow along.</div>
        <p>Zoom in on details, look back at earlier slides, and get the PDF at the end.</p>
        <div class="aq-url">{qr.url}</div>
      </div>
    </div>
  );
}

/** QR code for the phone remote. The code is valid while this dialog is open, for one device. */
function PairDialog({ status: { devices, audience }, onClose }) {
  const [state, setState] = useState({});
  useEffect(() => {
    remoteApi('pair').then(setState, (e) => setState({ error: e.message }));
    // The phone used the code: close.
    const listener = () => onClose();
    hot.on('lionizers:paired', listener);
    return () => {
      hot.off('lionizers:paired', listener);
      remoteApi('close');
    };
  }, []);
  const qr = state.url && renderSVG(state.url, { ecc: 'M', border: 4 });
  return (
    <div class="pair" onClick={onClose}>
      <div class="pair-box" onClick={(e) => e.stopPropagation()}>
        <div class="p-caption">REMOTE CONTROL</div>
        {state.error && <p class="pair-error">{state.error}</p>}
        {!state.error && <div class="pair-qr" dangerouslySetInnerHTML={qr ? { __html: qr } : undefined} />}
        {state.url && <div class="pair-url">{state.url}</div>}
        <p>Scan the code with your phone. It shows the notes and controls the slides.</p>
        <p class="pair-small">
          The phone must be in the same network. The code works for one device, and only while it is visible.
        </p>
        {audience !== null && (
          <p class="pair-small">
            The slides are open for the audience ({audience === 1 ? '1 device' : `${audience} devices`}).{' '}
            <button class="pair-link" onClick={() => remoteApi('audience/close')}>
              Close for the audience
            </button>
          </p>
        )}
        <div class="pair-actions">
          {devices > 0 && (
            <button onClick={() => remoteApi('disconnect')}>
              Disconnect {devices === 1 ? 'the phone' : `${devices} phones`}
            </button>
          )}
          <button onClick={onClose}>Close (Q)</button>
        </div>
      </div>
    </div>
  );
}

function Presenter({ deck }) {
  const [pos, nav, setSteps] = usePosition(deck);
  const { index, steps } = pos;
  const step = Math.min(pos.step, steps);
  const [notesEl, setNotesEl] = useState(null);
  const timer = useTimer();
  const status = useRemoteStatus();
  const audienceQr = useAudienceQr();
  const [pairing, setPairing] = useState(false);
  useKeys((e) => {
    if (e.key === 'q' && hot) return setPairing((p) => !p);
    if (e.key === 'a' && hot) return toggleAudienceQr(audienceQr);
    if (pairing) return e.key === 'Escape' ? setPairing(false) : false;
    if (navKeys(e, nav) !== false) return;
    if (e.key === 'r') timer.reset();
    else return false;
  });
  const slide = deck.slides[index];

  return (
    <div class="presenter">
      <div class="p-current">
        <Stage>
          <SlideView deck={deck} index={index} step={pos.step} onSteps={setSteps} notesTarget={notesEl} />
          <AudienceQrOverlay qr={audienceQr} />
        </Stage>
      </div>
      <div class="p-side">
        <div class="p-next">
          <div class="p-caption">NEXT</div>
          <Stage>
            <NextView deck={deck} index={index} step={step} steps={steps} />
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
            <div class="p-big">{timer.elapsed}</div>
          </div>
          <div>
            <div class="p-caption">CLOCK</div>
            <div class="p-big">{timer.clock}</div>
          </div>
          {hot && (
            <div>
              <div class="p-caption">PHONE (Q)</div>
              <button class="p-phone" onClick={() => setPairing(true)}>
                {status.devices ? `${status.devices} connected` : 'Connect'}
              </button>
            </div>
          )}
          {hot && (
            <div>
              <div class="p-caption">AUDIENCE (A)</div>
              <button class="p-phone" onClick={() => toggleAudienceQr(audienceQr)}>
                {audienceQr.visible ? 'Hide QR code' : status.audience !== null ? `${status.audience} following` : 'Show QR code'}
              </button>
            </div>
          )}
        </div>
      </div>
      <div class="p-notes">
        <div class="p-caption">NOTES · {slide?.file}</div>
        <div ref={setNotesEl} />
      </div>
      {pairing && <PairDialog status={status} onClose={() => setPairing(false)} />}
    </div>
  );
}

/** Is a phone connected to the dev server? When the presenter disconnects it, the page reloads and shows why. */
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (!hot) return;
    const off = () => {
      setOnline(false);
      // 403: the presenter disconnected this phone. Reload to show the server's page about it.
      fetch(location.pathname, { cache: 'no-store' }).then((r) => r.status === 403 && location.reload(), () => {});
    };
    const on = () => setOnline(true);
    hot.on('vite:ws:disconnect', off);
    hot.on('vite:ws:connect', on);
    return () => {
      hot.off('vite:ws:disconnect', off);
      hot.off('vite:ws:connect', on);
    };
  }, []);
  return online;
}

/** Phone remote: the presenter view for a small screen, with large buttons. */
function Remote({ deck }) {
  const [pos, nav, setSteps] = usePosition(deck, { follow: true });
  const { index, steps } = pos;
  const step = Math.min(pos.step, steps);
  const [notesEl, setNotesEl] = useState(null);
  const timer = useTimer();
  const online = useOnline();
  const slide = deck.slides[index];

  return (
    <div class="remote">
      <header class="r-bar">
        <span>
          <b>{index + 1}</b> / {deck.slides.length}
          {steps > 0 && (
            <span class="r-step">
              {' '}· step {step}/{steps}
            </span>
          )}
        </span>
        <button class="r-timer" onClick={timer.reset} title="Reset the timer">
          {timer.elapsed}
        </button>
        <span>{timer.clock}</span>
      </header>
      {!online && <div class="r-offline">No connection to the presenter. Trying again …</div>}
      <div class="r-slides">
        <div class="r-current">
          <Stage>
            <SlideView deck={deck} index={index} step={pos.step} onSteps={setSteps} notesTarget={notesEl} />
          </Stage>
        </div>
        <div class="r-next">
          <div class="p-caption">NEXT</div>
          <Stage>
            <NextView deck={deck} index={index} step={step} steps={steps} />
          </Stage>
        </div>
      </div>
      <div class="r-notes">
        <div class="p-caption">NOTES · {slide?.file}</div>
        <div class="r-notes-body" ref={setNotesEl} />
      </div>
      <nav class="r-nav">
        <button class="r-prev" onClick={nav.prev} aria-label="Previous">
          ‹
        </button>
        <button class="r-go" onClick={nav.next} aria-label="Next">
          Next ›
        </button>
      </nav>
    </div>
  );
}

/**
 * Audience view on a phone. It follows the talk. The viewer can go back to the slides
 * that were shown so far, but not forward: the slides that come later are hidden
 * (only here, they are not protected). At the end, the PDF can be downloaded.
 * The slide fills the screen (turn the phone for a large view), pinch zoom works, and
 * the controls appear on a tap, like in a video player.
 */
function Audience({ deck }) {
  const [pos, , setSteps] = usePosition(deck, { animate: true, follow: true });
  // Highest slide the talk went to (from the server). The PDF is there when it is the last one.
  const talkReached = useServerEvent('lionizers:reached', { reached: -1 }).reached;
  const reached = Math.max(talkReached, pos.index);
  const total = deck.slides.length;
  // null: follow the talk. A number: the viewer looks at an earlier slide.
  const [browse, setBrowse] = useState(null);
  const online = useOnline();
  const index = browse ?? pos.index;
  const look = (i) => setBrowse(i >= pos.index ? null : Math.max(0, i));
  const ended = talkReached >= total - 1;
  const remaining = total - 1 - reached;

  // Controls: a tap shows them, and they hide after a few seconds. While the viewer looks
  // at an earlier slide, they stay, so that the way back to the talk is always there.
  const [controls, setControls] = useState(true);
  const hideTimer = useRef();
  const showControls = () => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 3000);
  };
  useEffect(() => {
    showControls();
    return () => clearTimeout(hideTimer.current);
  }, []);
  const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.05;
  // Zoomed in: the controls would be in the way (and zoomed too).
  useEffect(() => {
    const onZoom = () => zoomed() && setControls(false);
    window.visualViewport?.addEventListener('resize', onZoom);
    return () => window.visualViewport?.removeEventListener('resize', onZoom);
  }, []);
  const visible = controls || (browse !== null && !zoomed());

  useKeys((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') look(index - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') look(index + 1);
    else return false;
  });
  // Swipe left and right, with one finger and not zoomed in (then the finger moves the view).
  const touch = useRef(null);
  const gestures = {
    onTouchStart: (e) => (touch.current = e.touches.length === 1 && !zoomed() ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null),
    onTouchEnd: (e) => {
      const t = touch.current;
      touch.current = null;
      if (!t || e.touches.length) return;
      const dx = e.changedTouches[0].clientX - t.x;
      const dy = e.changedTouches[0].clientY - t.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) look(index + (dx < 0 ? 1 : -1));
    },
    // A tap shows the controls, or hides them when they are visible.
    onClick: () => (controls ? setControls(false) : showControls()),
  };
  // Buttons in the controls: do not count as a tap on the slide, and keep the controls visible.
  const press = (fn) => (e) => {
    e.stopPropagation();
    fn();
    showControls();
  };
  const fullscreen = document.fullscreenEnabled;

  return (
    <div class="audience" {...gestures}>
      <Stage>
        {browse === null ? (
          <SlideView deck={deck} index={index} step={pos.step} onSteps={setSteps} morph />
        ) : (
          <SlideView deck={deck} index={index} />
        )}
      </Stage>
      {!online && <div class="a-offline">No connection to the talk. Trying again …</div>}
      <nav class={`a-bar ${visible ? '' : 'a-hidden'}`}>
        <button onClick={press(() => look(index - 1))} disabled={index === 0} aria-label="Previous slide">
          ‹
        </button>
        <div class="a-info">
          <div>
            {index + 1} / {total}
          </div>
          <div class="a-sub">
            {browse !== null ? (
              <button class="a-live" onClick={press(() => setBrowse(null))}>
                Back to the talk
              </button>
            ) : ended ? (
              // Opens in a new tab, not as a download: Chrome warns about downloads over HTTP.
              <a class="a-live" href="deck.pdf" target="_blank" onClick={(e) => e.stopPropagation()}>
                Open PDF
              </a>
            ) : remaining > 0 ? (
              `${remaining} more ${remaining === 1 ? 'slide' : 'slides'} to come`
            ) : (
              'Last slide'
            )}
          </div>
        </div>
        <button onClick={press(() => look(index + 1))} disabled={browse === null} aria-label="Next slide">
          ›
        </button>
        {fullscreen && (
          <button
            class="a-full"
            onClick={press(() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()))}
            aria-label="Fullscreen"
          >
            ⛶
          </button>
        )}
      </nav>
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
        <PrintPage key={`${deck.slides[index].file}:${step}`} deck={deck} index={index} step={step} onSteps={(n) => (counted.current[index] = n)} />
      ))}
    </div>
  );
}

/** One page of the print view. ?print&notes also renders the speaker notes, hidden (for exports). */
function PrintPage({ deck, index, step, onSteps }) {
  const [notesEl, setNotesEl] = useState(null);
  const withNotes = params.has('notes');
  return (
    <div class="print-page" data-slide={index}>
      <SlideView deck={deck} index={index} step={step} onSteps={onSteps} notesTarget={withNotes ? notesEl : null} />
      {withNotes && <div class="print-notes" hidden ref={setNotesEl} />}
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

const MODES = { view: Viewer, presenter: Presenter, print: Print, source: Source, remote: Remote, audience: Audience };

function mount(mod) {
  const deck = buildDeck(mod);
  document.title = mode === 'presenter' ? `Presenter · ${deck.title}` : mode === 'remote' ? `Remote · ${deck.title}` : deck.title;
  document.documentElement.lang = deck.lang;
  document.body.className = `mode-${mode}`;
  const Mode = MODES[mode];
  render(<Mode deck={deck} />, document.getElementById('app'));
}

mount(deckModule);

if (import.meta.hot) {
  import.meta.hot.accept('virtual:lionizers-deck', (mod) => mod && mount(mod));
}
