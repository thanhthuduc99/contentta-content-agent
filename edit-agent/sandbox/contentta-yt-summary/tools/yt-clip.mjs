#!/usr/bin/env node
// Cắt đoạn video YouTube cho scene thao tác.
// Usage: node tools/yt-clip.mjs <urlOrVideoId> <startSec> <endSec> <outFile.mp4>
//
// KHÔNG dùng yt-dlp --download-sections: m3u8 của YouTube trả file rỗng (PO token/SABR),
// DASH cắt đoạn sâu thì chậm tới timeout (đo 2026-08-31). Thay bằng: tải NGUYÊN video
// 1 lần vào cache chung với app Personal Brand, rồi cắt local bằng ffmpeg.
// Cache: Content Agent/content/_media/_ytcache/<videoId>.mp4 — bước tạo post đã tải sẵn,
// bước build video dọc chỉ việc cắt.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpegPath } from './ffmpeg-bin.mjs';

// Cache dung chung voi app (YT_CACHE_DIR tro ve content/_media/_ytcache cua app).
// Khong co env thi dung .cache trong sandbox.
const SANDBOX_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = process.env.YT_CACHE_DIR?.trim() || join(SANDBOX_ROOT, '.cache', 'ytcache');

const [urlOrId, startArg, endArg, outFile] = process.argv.slice(2);
if (!urlOrId || !startArg || !endArg || !outFile) {
  console.error('Usage: node tools/yt-clip.mjs <urlOrVideoId> <startSec> <endSec> <outFile.mp4>');
  process.exit(1);
}

function parseId(s) {
  s = String(s).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|\/v\/)([\w-]{11})/);
  if (!m) { console.error('Không tách được videoId từ: ' + s); process.exit(1); }
  return m[1];
}

function resolveYtdlp() {
  const winget = join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Packages/yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe/yt-dlp.exe');
  for (const [cmd, base] of [[winget, []], ['yt-dlp', []], ['py', ['-m', 'yt_dlp']], ['python', ['-m', 'yt_dlp']]]) {
    const r = spawnSync(cmd, [...base, '--version'], { encoding: 'utf8', timeout: 20000 });
    if (r.status === 0) return { cmd, base };
  }
  console.error('Không tìm thấy yt-dlp trên máy.');
  process.exit(1);
}

const videoId = parseId(urlOrId);
const start = Math.max(0, parseFloat(startArg) || 0);
const end = Math.max(start + 1, parseFloat(endArg) || 0);
const cached = join(CACHE_DIR, videoId + '.mp4');

if (!existsSync(cached)) {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`Cache chưa có ${videoId}.mp4 — tải full video (1 lần duy nhất)…`);
  const { cmd, base } = resolveYtdlp();
  const r = spawnSync(cmd, [...base,
    '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b',
    '--merge-output-format', 'mp4', '-N', '8',
    '--no-playlist', '--no-warnings', '--no-part',
    '-o', join(CACHE_DIR, videoId + '.%(ext)s'),
    `https://youtu.be/${videoId}`,
  ], { stdio: 'inherit', timeout: 20 * 60_000 });
  if (r.status !== 0 || !existsSync(cached)) { console.error('yt-dlp tải cache thất bại'); process.exit(1); }
}

mkdirSync(dirname(outFile), { recursive: true });
console.log(`Cắt ${start}s → ${end}s từ cache…`);
const f = spawnSync(ffmpegPath(), [
  '-y', '-v', 'error',
  '-ss', start.toFixed(2), '-to', end.toFixed(2),
  '-i', cached,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
  '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart',
  outFile,
], { stdio: 'inherit', timeout: 10 * 60_000 });
if (f.status !== 0 || !existsSync(outFile)) { console.error('ffmpeg cắt thất bại'); process.exit(1); }
console.log('CLIP_DONE ' + outFile);
