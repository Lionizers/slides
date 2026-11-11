// npm runs this on `npm install` and when it installs the package from GitHub.
// An install from GitHub has no .git folder, so the commit hash is written into
// .commit here. bin/cli.js reads it to name its own version (see .lionizers/built-with).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

try {
  const hash = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  fs.writeFileSync(new URL('../.commit', import.meta.url), hash + '\n');
} catch {
  // No git or no repository (e.g. installed from a tarball): the version stays unknown.
}
