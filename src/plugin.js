/**
 * Vite plugin that turns a folder of slide files into a deck.
 *
 * - Finds the slides (*.tsx / *.jsx, sorted by name) and chapters (sub folders).
 * - Wraps the bare JSX of each slide into a module: it adds imports for all
 *   components of the deck (exports of .lionizers/components/**) and a default export.
 *   Everything goes into the first line, so line numbers stay the same.
 * - Turns relative asset paths (src="img/photo.png") into imports, so that
 *   paths are relative to the slide file and work in dev, build and PDF.
 * - Turns plain text inside <Notes>…</Notes> into a string, so that line
 *   breaks and "- " bullets survive.
 * - Writes .lionizers/types/ (type definitions), so that editors and `tsc` know
 *   all components without imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setupRemote } from './remote.js';

export const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const appEntry = path.join(pkgDir, 'app/main.jsx');
const apiEntry = path.join(pkgDir, 'app/api.js');
export const templateDir = path.join(pkgDir, 'template');
const preactDir = path.dirname(require.resolve('preact/package.json'));
const tailwindDir = path.dirname(require.resolve('tailwindcss/package.json'));
/** Folder of an installed package, also when it does not export its package.json. */
function packageDir(name) {
  let dir = path.dirname(require.resolve(name));
  while (!fs.existsSync(path.join(dir, 'package.json')) || path.basename(dir) !== name.split('/').pop()) dir = path.dirname(dir);
  return dir;
}
const lucideDir = packageDir('lucide-preact');

const DECK_ID = 'virtual:lionizers-deck';
const RESOLVED_DECK_ID = '\0' + DECK_ID;
const API_ID = 'lionizers-slides';
const ICONS_ID = '\0lionizers-icons';
const lucideEntry = path.join(lucideDir, 'dist/esm/lucide-preact.mjs');

/** Folders in the deck that are never chapters. */
export const RESERVED_DIRS = new Set(['node_modules', 'dist', 'public']);
const SLIDE_EXT = /\.(tsx|jsx)$/;
const CODE_EXT = /\.(tsx|ts|jsx|js)$/;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|mp4|webm|mov|pdf)$/i;

/** Global names of the browser. A component with one of these names breaks the types. */
const BROWSER_GLOBALS = new Set(['Node', 'Text', 'Image', 'Option', 'Audio', 'Range', 'Selection', 'Event', 'Element', 'Document', 'Comment', 'Attr', 'File', 'Blob', 'Request', 'Response', 'Headers', 'Map', 'Set', 'Date', 'Error', 'Location', 'History', 'Screen', 'Animation', 'Notification', 'Storage', 'Worker', 'Path2D', 'Window', 'Navigator', 'Performance', 'Credential', 'Report', 'Plugin', 'Touch', 'Clipboard']);

const byName = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const visible = (name) => !name.startsWith('.') && !name.startsWith('_');

/** "02-erste-schritte" → "Erste schritte" */
export function labelFromName(name) {
  const label = name.replace(SLIDE_EXT, '').replace(/^\d+[-_. ]*/, '').replace(/[-_]+/g, ' ').trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The components of a deck: its own .lionizers/components/ folder, or the template. */
export function componentsDir(deckDir) {
  const own = path.join(deckDir, '.lionizers', 'components');
  return fs.existsSync(own) ? own : path.join(templateDir, 'components');
}

/** Folder for generated files (types, tsconfig). Not in git. */
export const typesDir = (deckDir) => path.join(deckDir, '.lionizers', 'types');

function findConfig(dir, base) {
  for (const ext of ['.tsx', '.jsx']) {
    const f = path.join(dir, base + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** Reads the deck folder. Returns the slides in order, the chapters and the config file. */
export function scanDeck(deckDir) {
  const slides = [];
  const chapters = [];
  const entries = fs.readdirSync(deckDir, { withFileTypes: true }).filter((e) => visible(e.name));
  entries.sort((a, b) => byName(a.name, b.name));

  for (const entry of entries) {
    const full = path.join(deckDir, entry.name);
    if (entry.isFile() && SLIDE_EXT.test(entry.name)) {
      slides.push({ file: full, chapter: -1 });
    } else if (entry.isDirectory() && !RESERVED_DIRS.has(entry.name)) {
      const files = fs.readdirSync(full).filter((f) => visible(f) && SLIDE_EXT.test(f)).sort(byName);
      if (files.length === 0) continue; // e.g. an "img" folder
      chapters.push({ label: labelFromName(entry.name), config: findConfig(full, '_chapter') });
      for (const f of files) slides.push({ file: path.join(full, f), chapter: chapters.length - 1 });
    }
  }
  return { slides, chapters, config: findConfig(deckDir, '_deck') };
}

/** All files below dir, recursively. */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name === 'node_modules') return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

/**
 * Exported components (names that start with a capital letter) of all code
 * files in the components folder. Returns { Name: file }.
 */
export function scanComponents(dir) {
  const result = {};
  for (const file of walk(dir).filter((f) => CODE_EXT.test(f) && !f.endsWith('.d.ts')).sort(byName)) {
    const src = fs.readFileSync(file, 'utf8');
    const names = [];
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Z]\w*)/gm)) names.push(m[1]);
    for (const m of src.matchAll(/^export\s+\{([^}]*)\}/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop();
        if (/^[A-Z]/.test(name ?? '') && !part.trim().startsWith('type ')) names.push(name);
      }
    }
    for (const name of names) {
      if (BROWSER_GLOBALS.has(name)) console.warn(`[lionizers-slides] ${name} in ${file} has the same name as a browser global. Rename it.`);
      result[name] = file;
    }
  }
  return result;
}

/** Is this file a slide or a config file of the deck? */
function isDeckFile(id, deckDir) {
  const file = id.split('?')[0];
  if (!SLIDE_EXT.test(file) || !file.startsWith(deckDir + path.sep)) return false;
  const rel = path.relative(deckDir, file).split(path.sep);
  if (rel.length > 2 || rel.some((p) => p.startsWith('.'))) return false;
  return rel.length === 1 || !RESERVED_DIRS.has(rel[0]);
}

function escapeTemplate(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** Wraps a slide file into a module. All additions go into the first line. */
export function transformSlide(code, components) {
  // Plain text notes → template string (keeps line breaks).
  code = code.replace(/<Notes>([\s\S]*?)<\/Notes>/g, (all, inner) =>
    /[<{]/.test(inner) ? all : `<Notes>{\`${escapeTemplate(inner)}\`}</Notes>`,
  );

  // attr="relative/path.png" → attr={__asset0}
  const assets = [];
  code = code.replace(/(\s[a-zA-Z]+)="([^"{}]+)"/g, (all, attr, value) => {
    if (!ASSET_EXT.test(value) || /^(https?:|data:|\/)/.test(value)) return all;
    const spec = value.startsWith('.') ? value : './' + value;
    assets.push(`import __asset${assets.length} from ${JSON.stringify(spec)};`);
    return `${attr}={__asset${assets.length - 1}}`;
  });

  const byFile = {};
  for (const [name, file] of Object.entries(components)) (byFile[file] ??= []).push(name);
  const imports =
    Object.entries(byFile)
      .map(([file, names]) => `import { ${names.join(', ')} } from ${JSON.stringify(file)};`)
      .join('') + assets.join('');

  // Escape hatch: a file with its own default export is a normal module.
  if (/^\s*export\s+default\b/m.test(code)) return `${imports}${code}`;

  const body = code.trimEnd().replace(/;$/, '');
  return `${imports}export default function Slide() { return (${body}\n); }`;
}

/**
 * Writes .lionizers/types/ into the deck: global type definitions for all
 * components, and a tsconfig that the deck's tsconfig.json extends.
 */
export function writeTypes(deckDir, components) {
  // A dev server can still get file events after its deck folder was moved or deleted.
  // Do not create the folder again.
  if (!fs.existsSync(deckDir)) return;
  const dir = typesDir(deckDir);
  fs.mkdirSync(dir, { recursive: true });
  const rel = (f) => {
    const r = path.relative(dir, f).replace(/\\/g, '/').replace(CODE_EXT, '');
    return r.startsWith('.') ? r : './' + r;
  };
  const globals = Object.entries(components)
    .map(([name, file]) => `  const ${name}: typeof import('${rel(file)}').${name};`)
    .join('\n');

  const files = {
    'globals.d.ts': `// Generated by lionizers-slides. Do not edit.\n// All components of the deck are global in slide files.\nexport {};\ndeclare global {\n${globals}\n}\n`,
    'assets.d.ts': `// Generated by lionizers-slides. Do not edit.\n${['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'mp4', 'webm']
      .map((e) => `declare module '*.${e}' { const src: string; export default src; }`)
      .join('\n')}\ndeclare module '*.css';\n`,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          jsx: 'react-jsx',
          jsxImportSource: 'preact',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          allowJs: true,
          types: [],
          paths: {
            preact: [preactDir],
            'preact/*': [preactDir + '/*'],
            'lucide-preact': [lucideDir],
            'lionizers-slides': [path.join(pkgDir, 'app/api.d.ts')],
          },
        },
        include: ['../../**/*.tsx', '../../**/*.ts', '../../**/*.jsx', './*.d.ts', ...new Set(Object.values(components).map((f) => path.dirname(f) + '/**/*'))],
        exclude: ['../../node_modules', '../../dist'],
      },
      null,
      2,
    ),
  };
  // Generated files and the build output are not in git. The components are.
  const ignore = path.join(deckDir, '.lionizers', '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, 'types/\ndist/\n');
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) fs.writeFileSync(file, content);
  }
  const rootConfig = path.join(deckDir, 'tsconfig.json');
  if (!fs.existsSync(rootConfig)) {
    fs.writeFileSync(rootConfig, JSON.stringify({ extends: './.lionizers/types/tsconfig.json' }, null, 2) + '\n');
  }
}

/**
 * Names of the Lucide icons that the deck uses. A name counts when it is a string
 * literal in a slide or component ("Cpu", 'ShieldCheck', `Layers`), so an icon
 * name that is put together at runtime is not found.
 */
async function usedIcons(deckDir, compDir) {
  const all = new Set(Object.keys((await import('lucide-preact')).icons));
  const files = [...walk(deckDir), ...walk(compDir)].filter((f) => CODE_EXT.test(f));
  const used = new Set();
  for (const file of new Set(files)) {
    for (const [, name] of fs.readFileSync(file, 'utf8').matchAll(/['"`]([A-Z][A-Za-z0-9]*)['"`]/g)) {
      if (all.has(name)) used.add(name);
    }
  }
  return [...used].sort();
}

/**
 * Replaces lucide-preact in a build: `icons` has only the icons of the deck,
 * so that the build does not contain all 1,700 icons. Everything else is lucide-preact.
 */
async function iconsModule(deckDir, compDir) {
  const names = await usedIcons(deckDir, compDir);
  const lib = JSON.stringify(lucideEntry);
  return [
    `export * from ${lib};`,
    `import { ${names.map((n, i) => `${n} as I${i}`).join(', ')} } from ${lib};`,
    `export const icons = { ${names.map((n, i) => `${n}: I${i}`).join(', ')} };`,
  ].join('\n');
}

export default function lionizersSlides({ deckDir }) {
  deckDir = path.resolve(deckDir);
  let compDir = componentsDir(deckDir);
  let components = scanComponents(compDir);
  let isBuild = false;
  writeTypes(deckDir, components);

  function deckModule() {
    const { slides, chapters, config } = scanDeck(deckDir);
    const lines = [];
    const imp = (spec, name) => lines.push(`import ${name} from ${JSON.stringify(spec)};`);
    slides.forEach((s, i) => {
      imp(s.file, `S${i}`);
      imp(s.file + '?raw', `R${i}`);
    });
    chapters.forEach((c, i) => c.config && imp(c.config, `C${i}`));
    if (config) imp(config, 'D');

    const str = JSON.stringify;
    lines.push(`export const name = ${str(path.basename(deckDir))};`);
    lines.push(`export const config = ${config ? 'D' : 'null'};`);
    lines.push(`export const chapters = [${chapters.map((c, i) => `{ label: ${str(c.label)}, config: ${c.config ? `C${i}` : 'null'} }`).join(', ')}];`);
    lines.push(`export const slides = [${slides.map((s, i) => `{ Component: S${i}, source: R${i}, file: ${str(path.relative(deckDir, s.file))}, chapter: ${s.chapter} }`).join(', ')}];`);
    return lines.join('\n');
  }

  return {
    name: 'lionizers-slides',
    enforce: 'pre',

    config() {
      return {
        resolve: {
          dedupe: ['preact'],
          // For CSS imports in the deck (Tailwind uses Vite's resolver).
          alias: [{ find: /^tailwindcss\/(.*)$/, replacement: `${tailwindDir}/$1` }],
        },
        server: { fs: { allow: [pkgDir, deckDir] } },
      };
    },

    configResolved(config) {
      isBuild = config.command === 'build';
    },

    async resolveId(id, importer, options) {
      if (id === DECK_ID) return RESOLVED_DECK_ID;
      // The dev server keeps all icons, so that a new icon name works at once.
      if (isBuild && id === 'lucide-preact') return ICONS_ID;
      if (id === API_ID) return apiEntry;
      // The deck has no node_modules. Resolve its bare imports (preact, the
      // JSX runtime, …) from inside this package, unless the deck has them.
      if (importer?.startsWith(deckDir) && /^[a-z@]/.test(id)) {
        const own = await this.resolve(id, importer, { ...options, skipSelf: true });
        return own ?? this.resolve(id, appEntry, { ...options, skipSelf: true });
      }
    },

    load(id) {
      if (id === RESOLVED_DECK_ID) return deckModule();
      if (id === ICONS_ID) return iconsModule(deckDir, compDir);
    },

    transform(code, id) {
      if (id.includes('?')) return;
      // Tailwind must also scan the slides when the theme comes from the template.
      if (id.endsWith('.css') && id.startsWith(compDir) && code.includes('tailwindcss/')) {
        return { code: `${code}\n@source ${JSON.stringify(deckDir)};\n`, map: null };
      }
      if (!isDeckFile(id, deckDir)) return;
      return { code: transformSlide(code, components), map: null };
    },

    configureServer(server) {
      setupRemote(server, {
        port: (server.config.server.port ?? 4747) + 1,
        deckName: path.basename(deckDir),
        slideCount: () => scanDeck(deckDir).slides.length,
      });
      server.watcher.add([deckDir, compDir]);
      const reloadAll = () => {
        for (const env of Object.values(server.environments)) env.moduleGraph.invalidateAll();
        server.ws.send({ type: 'full-reload' });
      };
      const onFileEvent = (event) => (file) => {
        if (file.startsWith(typesDir(deckDir) + path.sep)) return;
        if (!fs.existsSync(deckDir)) return; // The deck folder was moved or deleted.
        // A components folder was added or removed, or a component was added or renamed.
        const nextDir = componentsDir(deckDir);
        if (CODE_EXT.test(file) && (file.startsWith(nextDir) || nextDir !== compDir)) {
          const next = scanComponents(nextDir);
          if (nextDir !== compDir || JSON.stringify(next) !== JSON.stringify(components)) {
            compDir = nextDir;
            components = next;
            writeTypes(deckDir, components);
            return reloadAll();
          }
        }
        // A slide was added or removed.
        if (event !== 'change' && SLIDE_EXT.test(file) && file.startsWith(deckDir)) {
          const mod = server.environments.client.moduleGraph.getModuleById(RESOLVED_DECK_ID);
          if (mod) server.environments.client.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }
      };
      for (const event of ['add', 'unlink', 'change']) server.watcher.on(event, onFileEvent(event));
    },
  };
}
