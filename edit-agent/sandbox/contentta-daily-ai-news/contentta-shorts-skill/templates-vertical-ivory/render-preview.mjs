// Render template dọc 1080x1920 → PNG / mp4 để duyệt.
// Nền 4 lớp có blur(90px) làm renderer chậm và dễ crash khi chụp hàng trăm frame
// (bài học từ brolls/claude-memory/render.js) nên lúc quay clip thì tráo bằng
// bg-vertical.png đã bake sẵn — cùng pixel, rẻ hơn nhiều.
//
//   node render-preview.mjs bake
//   node render-preview.mjs still v01-title-card.html 2.4
//   node render-preview.mjs clip  v01-title-card.html
//   node render-preview.mjs clip  all
import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { chromePath } from '../../tools/browser-bin.mjs';
import { ffmpegPath } from '../../tools/ffmpeg-bin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const W = 1080, H = 1920;
const BG = join(HERE, 'bg-vertical.png');

const FLATTEN = `
  .bg-orbs, .bg-dots, .bg-floor, .bg-grain { display: none !important; }
  .stage { background-image: url('bg-vertical.png'); background-size: ${W}px ${H}px; }
`;

const [mode, target, at] = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--font-render-hinting=none'],
});

async function open(f, flatten) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(HERE, f)).href, { waitUntil: 'load' });
  if (flatten) await page.addStyleTag({ content: FLATTEN });
  await page.waitForFunction('window.__READY === true', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  return page;
}

async function clip(f) {
  const slug = basename(f, '.html');
  const dir = join(HERE, '.frames', slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await open(f, existsSync(BG));
  const dur = await page.evaluate(() => window.__DUR);
  const total = Math.round(dur * FPS);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => { window.__TL.time(t); }, i / FPS);
    await page.screenshot({ path: join(dir, String(i).padStart(4, '0') + '.png') });
  }
  mkdirSync(join(HERE, 'preview'), { recursive: true });
  const mp4 = join(HERE, 'preview', slug + '.mp4');
  execFileSync(ffmpegPath(), [
    '-y', '-loglevel', 'error', '-framerate', String(FPS),
    '-i', join(dir, '%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4,
  ]);
  rmSync(dir, { recursive: true, force: true });
  await page.close();
  console.log(`${slug}  ${total} frames  ${dur}s  ${((Date.now() - t0) / total).toFixed(0)} ms/frame`);
}

if (mode === 'bake') {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(HERE, 'v01-title-card.html')).href, { waitUntil: 'load' });
  await page.addStyleTag({ content: '.content, .glow { display: none !important; }' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: BG });
  console.log('baked', BG);
} else if (mode === 'still') {
  const page = await open(target, false);
  const t = Number(at ?? 0);
  await page.evaluate(v => { window.__TL.time(v); }, t);
  await new Promise(r => setTimeout(r, 250));
  mkdirSync(join(HERE, 'preview'), { recursive: true });
  const out = join(HERE, 'preview', basename(target, '.html') + `-t${String(t).replace('.', '_')}.png`);
  await page.screenshot({ path: out });
  console.log(out);
} else if (mode === 'clip') {
  const files = target === 'all'
    ? readdirSync(HERE).filter(f => /^v\d\d-.*\.html$/.test(f)).sort()
    : [target];
  for (const f of files) await clip(f);
} else {
  console.error('usage: bake | still <file> <t> | clip <file|all>');
}

await browser.close();
