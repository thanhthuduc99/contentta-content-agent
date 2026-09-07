// Resolve Chrome executable cho puppeteer-core.
// Ưu tiên env, rồi cache của hyperframes (cùng con browser mà pipeline render đang dùng),
// cuối cùng là Chrome/Edge hệ thống. Không cài package mới.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EXE = process.platform === 'win32' ? '.exe' : '';

function deepFind(dir, names, depth = 4) {
  if (depth < 0 || !existsSync(dir)) return null;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isFile() && names.includes(e.name)) return p;
    if (e.isDirectory()) {
      const hit = deepFind(p, names, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

export function chromePath() {
  for (const env of ['HYPERFRAMES_CHROME', 'CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH']) {
    const p = process.env[env];
    if (p && existsSync(p)) return p;
  }

  const names = [`chrome-headless-shell${EXE}`, `chrome${EXE}`, 'Google Chrome for Testing'];
  const caches = [
    join(homedir(), '.cache', 'hyperframes', 'chrome'),
    join(homedir(), '.cache', 'puppeteer'),
  ];
  for (const c of caches) {
    const hit = deepFind(c, names);
    if (hit) return hit;
  }

  const system = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
  for (const p of system) if (existsSync(p)) return p;

  throw new Error('no chrome: chạy `npx hyperframes browser` hoặc đặt CHROME_PATH');
}
