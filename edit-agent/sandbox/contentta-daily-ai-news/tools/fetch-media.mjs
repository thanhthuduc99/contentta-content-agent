#!/usr/bin/env node
// Lấy media thật từ 1 link (GitHub repo, blog post) để chèn vào video daily news.
// Output JSON ra stdout, file ghi vào --out.
//
//   node tools/fetch-media.mjs <url> --out assets/media
//
// Lấy: screenshot viewport + full page, og:image, ảnh/GIF trong trang, metadata GitHub.
// Dùng puppeteer-core đi kèm hyperframes. Không cài package mới.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromePath } from './browser-bin.mjs';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : 'media';
const maxImages = 6;

// Mặc định chụp nguyên khung 16:9 rồi để template thu nhỏ, không cắt.
// Cần crop một khối cụ thể thì truyền --clip "<selector>" (lặp được).
const clipArgs = args.reduce((acc, a, i) => (a === '--clip' ? [...acc, args[i + 1]] : acc), []);

if (!url) {
  console.error('usage: node tools/fetch-media.mjs <url> [--out dir]');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'images'), { recursive: true });

const SKIP_IMG = /shields\.io|badge|avatars\.githubusercontent|githubusercontent\.com\/u\/|\.svg($|\?)|codecov|travis-ci|circleci/i;

async function download(src, dir, name) {
  try {
    const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4096) return null; // ảnh quá nhỏ, gần như chắc là icon
    const type = res.headers.get('content-type') || '';
    let ext = extname(new URL(src).pathname).split('?')[0];
    if (!ext) ext = type.includes('gif') ? '.gif' : type.includes('png') ? '.png' : '.jpg';
    const file = join(dir, name + ext);
    writeFileSync(file, buf);
    return { file, bytes: buf.length, src };
  } catch { return null; }
}

async function githubMeta(u) {
  const m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  const [, owner, repo] = m;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return {
      full_name: j.full_name,
      description: j.description,
      stars: j.stargazers_count,
      forks: j.forks_count,
      language: j.language,
      license: j.license?.spdx_id ?? null,
      topics: j.topics ?? [],
      pushed_at: j.pushed_at,
      homepage: j.homepage || null,
    };
  } catch { return null; }
}

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 }); // 16:9
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36');
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

const info = await page.evaluate(() => {
  const meta = n =>
    document.querySelector(`meta[property="${n}"]`)?.content ||
    document.querySelector(`meta[name="${n}"]`)?.content || null;
  const imgs = [...document.querySelectorAll('img')]
    .filter(i => i.naturalWidth >= 320 && i.naturalHeight >= 180)
    .map(i => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight }));
  const vids = [];
  document.querySelectorAll('video').forEach(v => {
    if (v.currentSrc || v.src) vids.push(v.currentSrc || v.src);
    v.querySelectorAll('source').forEach(sc => { if (sc.src) vids.push(sc.src); });
  });
  // GitHub upload video qua link .mp4/.webm (user-images / repo assets), không nằm trong <video> sẵn
  document.querySelectorAll('a[href]').forEach(a => {
    if (/\.(mp4|webm|mov)(\?|$)/i.test(a.href)) vids.push(a.href);
  });
  return {
    title: document.title,
    description: meta('og:description') || meta('description'),
    og_image: meta('og:image'),
    og_video: meta('og:video') || meta('og:video:url'),
    images: imgs,
    videos: [...new Set(vids)],
  };
});

const shots = [];
const viewportShot = join(outDir, 'shot-viewport.png');
await page.screenshot({ path: viewportShot });
shots.push({ kind: 'viewport', file: viewportShot, w: 2560, h: 1440, ratio: '16:9' });

const fullShot = join(outDir, 'shot-full.png');
await page.screenshot({ path: fullShot, fullPage: true, captureBeyondViewport: true });
shots.push({ kind: 'full', file: fullShot });

const clips = clipArgs.map((sel, i) => ({ name: `clip-${i + 1}`, sel }));
for (const c of clips) {
  const el = await page.$(c.sel);
  if (!el) continue;
  const box = await el.boundingBox();
  if (!box || box.width < 120 || box.height < 80) continue;
  const file = join(outDir, `shot-${c.name}.png`);
  await el.screenshot({ path: file });
  shots.push({ kind: c.name, file, w: Math.round(box.width * 2), h: Math.round(box.height * 2) });
}

await browser.close();

const downloaded = [];
if (info.og_image) {
  const d = await download(info.og_image, outDir, 'og-image');
  if (d) downloaded.push({ kind: 'og_image', ...d });
}
let n = 0;
for (const img of info.images) {
  if (n >= maxImages) break;
  if (!img.src || SKIP_IMG.test(img.src)) continue;
  const d = await download(img.src, join(outDir, 'images'), `img-${String(n + 1).padStart(2, '0')}`);
  if (d) { downloaded.push({ kind: 'page_image', w: img.w, h: img.h, ...d }); n++; }
}

// Tải video demo repo (nếu có) -> demo.mp4, để scene video chạy clip thật.
// Ưu tiên: <video>/source trong trang, rồi link .mp4, rồi og:video. Bỏ file quá nhỏ/quá lớn.
async function downloadVideo(candidates, dir) {
  for (const src of candidates) {
    if (!src) continue;
    try {
      const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const type = res.headers.get('content-type') || '';
      if (!/video\//i.test(type) && !/\.(mp4|webm|mov)(\?|$)/i.test(src)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100 * 1024) continue;      // < 100KB: gần như không phải clip demo
      if (buf.length > 80 * 1024 * 1024) continue; // > 80MB: quá nặng, bỏ
      const file = join(dir, 'demo.mp4');
      writeFileSync(file, buf);
      return { file, bytes: buf.length, src };
    } catch { /* thử ứng viên kế */ }
  }
  return null;
}
const videoCandidates = [...(info.videos || []), info.og_video].filter(Boolean);
const demoVideo = await downloadVideo(videoCandidates, outDir);

console.log(JSON.stringify({
  url,
  title: info.title,
  description: info.description,
  og_image: info.og_image,
  og_video: info.og_video,
  video: demoVideo,
  screenshots: shots,
  images: downloaded,
  github: await githubMeta(url),
}, null, 2));
