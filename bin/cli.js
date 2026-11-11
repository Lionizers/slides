#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build, createServer } from 'vite';
import tailwind from '@tailwindcss/vite';
import lionizersSlides, { pkgDir, templateDir, scanComponents, componentsDir, typesDir, writeTypes } from '../src/plugin.js';

const HELP = `
lionizers-slides – presentations in the Lionizers CI, one .tsx file per slide

Usage:
  lionizers-slides [dir]              Start the dev server for the deck in dir (default: .)
  lionizers-slides pdf [dir]          Write <deck>.pdf (needs Google Chrome)
  lionizers-slides html [dir]         Write <deck>.html: one file with everything, no server needed
  lionizers-slides build [dir]        Write a static site to dir/.lionizers/dist
  lionizers-slides check [dir]        Type-check, then render and find overflowing slides
  lionizers-slides init [dir]         Create a new deck (copies the CI components into it)
  lionizers-slides guide              Print the authoring guide (for people and LLMs)

Options:
  -p, --port <n>     Port of the dev server (default: 4747)
  -o, --out <path>   Output file or folder for pdf, html and build
      --steps        pdf: one page per step (see <Step>)
      --no-open      Do not open the browser
  -h, --help         Show this help
`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', short: 'p', default: '4747' },
    out: { type: 'string', short: 'o' },
    open: { type: 'boolean', default: true },
    'no-open': { type: 'boolean' },
    steps: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

const COMMANDS = ['dev', 'pdf', 'html', 'build', 'check', 'init', 'guide'];
let [command, dir] = positionals;
if (!COMMANDS.includes(command)) [command, dir] = ['dev', command];
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

const require = createRequire(import.meta.url);
const examplesDir = path.join(pkgDir, 'examples');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
/** Where the tool comes from. Every push to main is a new version, named by its commit hash. */
const repo = pkg.repository;
const deckDir = path.resolve(dir ?? '.');

/**
 * Commit hash of this copy of the tool, or undefined.
 * In a git checkout it comes from git. An install from GitHub has no .git folder. There, one of
 * these has it: .commit (written by `prepare` when npm cloned the repository), .archive-commit
 * (written by `git archive` when npm downloaded the GitHub tarball, see .gitattributes), or the
 * lockfile of the install.
 */
function ownCommit() {
  if (fs.existsSync(path.join(pkgDir, '.git'))) {
    const run = (...args) => spawnSync('git', args, { cwd: pkgDir, encoding: 'utf8' });
    const head = run('rev-parse', 'HEAD');
    if (head.status !== 0) return undefined;
    // Uncommitted changes: this version cannot be started again from GitHub.
    const dirty = run('status', '--porcelain').stdout.trim() !== '';
    return { hash: head.stdout.trim(), dirty };
  }
  const isHash = (s) => /^[0-9a-f]{40}$/.test(s ?? '');
  const read = (name) => {
    const file = path.join(pkgDir, name);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : undefined;
  };
  const hash = [read('.commit'), read('.archive-commit'), lockfileCommit()].find(isHash);
  return hash ? { hash, dirty: false } : undefined;
}

/**
 * Commit hash from the lockfile of the install. npm often installs from a GitHub tarball
 * without .git; then `prepare` cannot write .commit. But npm records the resolved commit
 * in node_modules/.package-lock.json (npx and global installs) or in package-lock.json.
 */
function lockfileCommit() {
  const modulesDir = path.dirname(pkgDir);
  for (const file of [path.join(modulesDir, '.package-lock.json'), path.join(modulesDir, '..', 'package-lock.json')]) {
    try {
      const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
      const resolved = lock.packages?.[`node_modules/${pkg.name}`]?.resolved ?? '';
      const hash = resolved.match(/#([0-9a-f]{40})$/)?.[1];
      if (hash) return hash;
    } catch {
      // No lockfile here, try the next one.
    }
  }
  return undefined;
}
const commit = ownCommit();
const short = (hash) => hash.slice(0, 7);

/**
 * .lionizers/built-with records the version of the tool that the deck last worked with:
 * "<commit hash> <date>". init writes it, a check without errors updates it.
 * Nothing is enforced: the deck always runs with the installed version. The file only
 * tells how to start the old version when the new one breaks something.
 */
const builtWithFile = path.join(deckDir, '.lionizers', 'built-with');

function readBuiltWith() {
  if (!fs.existsSync(builtWithFile)) return undefined;
  const [hash, date] = fs.readFileSync(builtWithFile, 'utf8').trim().split(/\s+/);
  return /^[0-9a-f]{7,40}$/.test(hash ?? '') ? { hash, date } : undefined;
}

function writeBuiltWith() {
  if (!commit || commit.dirty || deckDir === examplesDir) return;
  if (readBuiltWith()?.hash === commit.hash) return;
  fs.mkdirSync(path.dirname(builtWithFile), { recursive: true });
  fs.writeFileSync(builtWithFile, `${commit.hash} ${new Date().toISOString().slice(0, 10)}\n`);
}

/** A hint with the command for the old version, if the deck was made with another one. */
function builtWithHint() {
  const built = readBuiltWith();
  if (!built || (commit && commit.hash.startsWith(built.hash) && !commit.dirty)) return '';
  const now = commit ? short(commit.hash) + (commit.dirty ? ' + local changes' : '') : 'unknown';
  return (
    `  Version: this deck last worked with ${short(built.hash)} (${built.date ?? 'no date'}), this is ${now}.\n` +
    `           If something looks wrong: npx ${repo}#${short(built.hash)} ${process.argv.slice(2).join(' ')}`.trimEnd() + '\n'
  );
}

function viteConfig(extra = {}) {
  return {
    configFile: false,
    root: path.join(pkgDir, 'app'),
    base: './',
    logLevel: 'warn',
    clearScreen: false,
    plugins: [lionizersSlides({ deckDir }), tailwind()],
    oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
    optimizeDeps: { noDiscovery: true, include: ['preact', 'preact/hooks', 'preact/compat', 'preact/jsx-runtime', 'preact/jsx-dev-runtime', 'lucide-preact'] },
    ...extra,
  };
}

function hasSlides() {
  if (!fs.existsSync(deckDir)) return false;
  const walk = (d, depth) =>
    fs.readdirSync(d, { withFileTypes: true }).some((e) =>
      e.isDirectory() && depth === 0 && !e.name.startsWith('.') && !['node_modules', 'dist', 'public'].includes(e.name)
        ? walk(path.join(d, e.name), 1)
        : e.isFile() && /\.(tsx|jsx)$/.test(e.name) && !e.name.startsWith('_'),
    );
  return walk(deckDir, 0);
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
}

async function dev(path = '/') {
  const server = await createServer(viteConfig({ server: { port: Number(opts.port) } }));
  await server.listen();
  const url = server.resolvedUrls.local[0].replace(/\/$/, '') + path;
  console.log(`\n  Deck:    ${deckDir}`);
  console.log(`  Slides:  ${url}`);
  console.log(`  Keys:    → ← navigate · O overview · P presenter · S source · F fullscreen · H help`);
  console.log(builtWithHint());
  if (opts.open && !opts['no-open']) openBrowser(url);
}

/**
 * Renders all slides in the print view of a headless Chrome and calls fn(page).
 * Returns the errors of the page and the slides with overflowing content.
 */
async function withPrintView(fn) {
  const { chromium } = await import('playwright-core');
  const server = await createServer(viteConfig({ server: { port: 0 } }));
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
  } catch {
    console.error('Could not start Google Chrome. Install it, or run: npx playwright install chromium');
    await server.close();
    process.exit(1);
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(server.resolvedUrls.local[0] + (opts.steps ? '?print&steps' : '?print'), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__lionizersReady === true, null, { timeout: 30000 });
    const overflow = await page.evaluate(() => window.__lionizersOverflow);
    await fn?.(page);
    return { errors, overflow };
  } finally {
    await browser.close();
    await server.close();
  }
}

/** Prints problems found while rendering. Returns true if there were any. */
function reportRender({ errors, overflow }) {
  if (errors.length) console.error('Errors while rendering:\n  ' + errors.join('\n  '));
  for (const o of overflow) {
    console.error(`Slide ${o.slide} (${o.file}): content too close to or beyond the ${o.edges.join(', ')} edge. Shorten it, use \`small\`, or split the slide.`);
  }
  return errors.length > 0 || overflow.length > 0;
}

async function pdf() {
  const out = path.resolve(opts.out ?? path.join(deckDir, `${path.basename(deckDir)}.pdf`));
  const result = await withPrintView((page) =>
    page.pdf({ path: out, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true }),
  );
  reportRender(result);
  const shown = path.relative(process.cwd(), out);
  console.log(`Wrote ${shown.startsWith('..') ? out : shown}`);
}

async function buildSite() {
  const outDir = path.resolve(opts.out ?? path.join(deckDir, '.lionizers', 'dist'));
  await build(viteConfig({ logLevel: 'info', build: { outDir, emptyOutDir: true } }));
  console.log(`\nWrote ${outDir}. Serve it with any static web server.`);
}

/**
 * One HTML file with everything inside (scripts, styles, fonts, images), for people
 * who should see the deck with its steps and transitions, without a server.
 */
async function buildHtml() {
  const out = path.resolve(opts.out ?? path.join(deckDir, `${path.basename(deckDir)}.html`));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lionizers-slides-'));
  try {
    await build(
      viteConfig({
        build: {
          outDir: tmp,
          emptyOutDir: true,
          assetsInlineLimit: () => true,
          cssCodeSplit: false,
          modulePreload: false,
          copyPublicDir: false,
          chunkSizeWarningLimit: Infinity,
          rolldownOptions: { output: { codeSplitting: false } },
        },
      }),
    );
    const read = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');
    const inlined = new Set();
    let html = read('index.html')
      .replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (_, src) => {
        inlined.add(src);
        // "</script" inside the code would end the script element.
        return `<script type="module">${read(src).replace(/<\/script/gi, '<\\/script')}</script>`;
      })
      .replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g, (_, href) => {
        inlined.add(href);
        return `<style>${read(href)}</style>`;
      })
      .replace(/<link rel="icon" href="[^"]*" \/?>/, () => {
        const svg = fs.readFileSync(path.join(pkgDir, 'app', 'public', 'favicon.svg'));
        return `<link rel="icon" href="data:image/svg+xml;base64,${svg.toString('base64')}">`;
      });
    const files = fs.readdirSync(tmp, { recursive: true }).filter((f) => fs.statSync(path.join(tmp, f)).isFile());
    const left = files.filter((f) => f !== 'index.html' && !inlined.has(f.split(path.sep).join('/')));
    if (left.length) console.warn(`Not inside the HTML file: ${left.join(', ')}`);
    fs.writeFileSync(out, html);
    const shown = path.relative(process.cwd(), out);
    const mb = (fs.statSync(out).size / 1e6).toFixed(1);
    console.log(`Wrote ${shown.startsWith('..') ? out : shown} (${mb} MB). Open it in a browser, no server needed.`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function init() {
  fs.mkdirSync(deckDir, { recursive: true });
  const existing = fs.readdirSync(deckDir).filter((f) => !f.startsWith('.'));
  if (existing.length) {
    console.error(`${deckDir} is not empty. Nothing changed.`);
    process.exit(1);
  }
  fs.cpSync(templateDir, deckDir, { recursive: true });
  // The components are the deck's own code, but out of sight in .lionizers/.
  fs.mkdirSync(path.join(deckDir, '.lionizers'), { recursive: true });
  fs.renameSync(path.join(deckDir, 'components'), path.join(deckDir, '.lionizers', 'components'));
  writeBuiltWith();
  writeTypes(deckDir, scanComponents(componentsDir(deckDir)));
  for (const f of fs.readdirSync(deckDir).sort()) console.log(`  ${f}`);
  console.log(`\nStart it with: npx ${repo} ${path.relative(process.cwd(), deckDir) || '.'}`);
}

async function check() {
  writeTypes(deckDir, scanComponents(componentsDir(deckDir)));
  const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');
  const res = spawnSync(process.execPath, [tsc, '-p', path.join(typesDir(deckDir), 'tsconfig.json'), '--pretty'], {
    stdio: 'inherit',
    cwd: deckDir,
  });
  if (res.status !== 0) {
    const hint = builtWithHint();
    if (hint) console.log('\n' + hint);
    process.exit(res.status ?? 1);
  }
  console.log('Types: no errors. Rendering the slides …');
  const failed = reportRender(await withPrintView());
  if (!failed) {
    console.log('Layout: no errors.');
    writeBuiltWith();
  } else {
    const hint = builtWithHint();
    if (hint) console.log('\n' + hint);
  }
  process.exit(failed ? 1 : 0);
}

if (command === 'guide') {
  process.stdout.write(fs.readFileSync(path.join(templateDir, 'AGENTS.md'), 'utf8'));
} else if (command === 'init') {
  init();
} else if (command === 'check') {
  await check();
} else {
  if (!hasSlides()) {
    console.error(`No slides in ${deckDir}.\nCreate *.tsx files there, or run: npx ${repo} init`);
    process.exit(1);
  }
  if (command === 'pdf') await pdf();
  else if (command === 'html') await buildHtml();
  else if (command === 'build') await buildSite();
  else await dev();
}
