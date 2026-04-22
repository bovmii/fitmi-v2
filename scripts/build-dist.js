#!/usr/bin/env node
// Copy the web assets into dist/ so Capacitor can bundle them into the
// iOS app. Run via `npm run build`. Keeps the project buildless — no
// transpilation, no bundling — just file mirroring.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const INCLUDE = [
  'index.html',
  'main.js',
  'config.js',
  'manifest.json',
  'css',
  'core',
  'modules',
  'db',
];

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function copyInto(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyInto(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });

let files = 0;
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) continue;
  copyInto(src, path.join(DIST, item));
  files++;
}

console.log(`dist/ built — ${files} top-level entries copied.`);
