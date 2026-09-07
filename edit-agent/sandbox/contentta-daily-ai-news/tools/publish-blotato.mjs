#!/usr/bin/env node
// Publish 1 video lên Instagram + Facebook + YouTube qua Blotato.
// Đọc credentials từ edit-agent/.env. Media là URL công khai (Blotato tự pull).
//
// Usage: node tools/publish-blotato.mjs <mediaUrl> <captionFile> <ytTitle> [platforms]
//   platforms: comma list trong {instagram,facebook,youtube} — mặc định cả 3.
//
// In ra JSON kết quả từng kênh: {platform, ok, status, body}.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '..', '..', '.env'); // edit-agent/.env

function env(k) {
  if (process.env[k]) return process.env[k];
  if (existsSync(ENV_PATH)) {
    const m = readFileSync(ENV_PATH, 'utf8').match(new RegExp('^' + k + '=(.*)$', 'm'));
    if (m) return m[1].replace(/["\r]/g, '').trim();
  }
  return undefined;
}

const KEY = env('BLOTATO_API_KEY');
const BASE = (env('BLOTATO_API_BASE') || 'https://backend.blotato.com/v2').replace(/\/$/, '');
const IDS = {
  instagram: env('BLOTATO_INSTAGRAM_ACCOUNT_ID'),
  facebook: env('BLOTATO_FACEBOOK_ACCOUNT_ID'),
  youtube: env('BLOTATO_YOUTUBE_ACCOUNT_ID'),
};
const FB_PAGE = env('BLOTATO_FACEBOOK_PAGE_ID');

const [mediaUrl, captionFile, ytTitle, platformsArg] = process.argv.slice(2);
if (!KEY) { console.error('thiếu BLOTATO_API_KEY'); process.exit(1); }
if (!mediaUrl || !captionFile) { console.error('usage: publish-blotato.mjs <mediaUrl> <captionFile> <ytTitle> [platforms]'); process.exit(1); }
const text = readFileSync(captionFile, 'utf8').trim();
const title = ytTitle || text.split('\n')[0].slice(0, 90);
const platforms = (platformsArg || 'instagram,facebook,youtube').split(',').map((s) => s.trim()).filter(Boolean);

function targetFor(p) {
  if (p === 'facebook') return { targetType: 'facebook', pageId: FB_PAGE };
  if (p === 'youtube') return { targetType: 'youtube', title: title.slice(0, 100), privacyStatus: 'public', shouldNotifySubscribers: false };
  return { targetType: 'instagram' }; // video → reel
}

async function publish(p) {
  const accountId = IDS[p];
  if (!accountId) return { platform: p, ok: false, error: 'thiếu account id' };
  const payload = { post: { accountId, target: targetFor(p), content: { text, platform: p, mediaUrls: [mediaUrl] } } };
  try {
    const r = await fetch(BASE + '/posts', {
      method: 'POST',
      headers: { 'blotato-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await r.text();
    return { platform: p, ok: r.ok, status: r.status, body: body.slice(0, 800) };
  } catch (e) {
    return { platform: p, ok: false, error: e.message };
  }
}

const results = [];
for (const p of platforms) {
  const res = await publish(p);
  results.push(res);
  console.error(`[${p}] ${res.ok ? 'OK' : 'FAIL'} ${res.status || ''} ${res.error || res.body || ''}`);
}
console.log(JSON.stringify(results, null, 2));
