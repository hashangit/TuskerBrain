// Repairs the electron binary when its postinstall was skipped or its JS
// unzip silently produced an empty dist (observed with pnpm 10 + Node 26).
// Wired as the root "postinstall" script so `pnpm install` self-heals.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let electronDir;
try {
  electronDir = path.dirname(require.resolve('electron/package.json'));
} catch {
  console.log('[fix-electron] electron not installed, nothing to fix');
  process.exit(0);
}

// path.txt is relative to dist/ — electron's index.js prepends "dist" itself.
const PLATFORM_RELPATHS = {
  darwin: 'Electron.app/Contents/MacOS/Electron',
  win32: 'electron.exe',
  linux: 'electron',
};

function binaryPath() {
  const rel = PLATFORM_RELPATHS[process.platform] ?? 'electron';
  return path.join(electronDir, 'dist', rel);
}

// Checks the real binary, not just dist/ — the failure mode was a dist with
// only license files in it.
function ok() {
  return fs.existsSync(binaryPath());
}

function cachedZip() {
  const version = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8')).version;
  const name = `electron-v${version}-${process.platform}-${process.arch}.zip`;
  const cacheRoots = [
    path.join(os.homedir(), 'Library', 'Caches', 'electron'),
    path.join(os.homedir(), '.cache', 'electron'),
  ];
  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { recursive: true })) {
      if (entry.endsWith(name)) return path.join(root, entry);
    }
  }
  return null;
}

if (ok()) {
  console.log('[fix-electron] electron binary present');
  process.exit(0);
}

console.log('[fix-electron] electron binary missing — repairing…');
try {
  execSync('node install.js', { cwd: electronDir, stdio: 'inherit' });
} catch {}

if (!ok()) {
  const zip = cachedZip();
  if (!zip) {
    console.error(`[fix-electron] no cached zip found. Run manually: cd ${electronDir} && node install.js`);
    process.exit(1);
  }
  console.log(`[fix-electron] extracting ${zip}`);
  execSync(`unzip -o "${zip}" -d dist`, { cwd: electronDir, stdio: 'inherit' });
  fs.writeFileSync(path.join(electronDir, 'path.txt'), PLATFORM_RELPATHS[process.platform] ?? 'electron');
}

if (!ok()) {
  console.error('[fix-electron] repair failed');
  process.exit(1);
}
console.log('[fix-electron] electron binary repaired');
