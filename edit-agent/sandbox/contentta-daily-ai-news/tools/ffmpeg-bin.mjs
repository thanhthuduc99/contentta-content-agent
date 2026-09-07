// Resolve ffmpeg + ffprobe binary path.
// Ưu tiên system ffmpeg (PATH). Nếu không có (vd remote sandbox thiếu) → ffmpeg-static / ffprobe-static npm.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function works(bin) {
  try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

export function ffmpegPath() {
  if (works('ffmpeg')) return 'ffmpeg';
  try {
    const p = require('ffmpeg-static');
    if (p && works(p)) return p;
  } catch {}
  throw new Error('no ffmpeg: cài system ffmpeg hoặc `npm i ffmpeg-static`');
}

export function ffprobePath() {
  if (works('ffprobe')) return 'ffprobe';
  try {
    const p = require('ffprobe-static');
    const bin = typeof p === 'string' ? p : p?.path;
    if (bin && works(bin)) return bin;
  } catch {}
  // ffprobe-static optional — nhiều khi không cần, trả null để caller tự xử
  return null;
}
