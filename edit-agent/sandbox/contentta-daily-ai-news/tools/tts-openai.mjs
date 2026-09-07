#!/usr/bin/env node
// OpenAI TTS gpt-4o-mini-tts, voice onyx, instructions style phát thanh viên.
// Sau TTS apply ffmpeg atempo (TTS_TEMPO env, default 0.95) — deterministic speed-up,
// không phụ thuộc param `speed` của OpenAI (gpt-4o-mini-tts hay bỏ qua param này).
// Đọc vo-script.txt từ cwd. Xuất voice.mp3 (đã speed-up) — transcribe TRÊN file này.
//
// CWD = video-projects/daily-YYYYMMDD/assets/  (giống pattern tts.mjs gốc — đọc ../../.env)
// Hoặc CWD = video-projects/daily-YYYYMMDD/   nếu agent chạy từ project root.
// Logic dò .env: thử 3, 4 cấp lên.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ffmpegPath } from './ffmpeg-bin.mjs';

const INSTRUCTIONS =
  'Voice: Clear, authoritative, and composed, projecting confidence and professionalism. ' +
  'Tone: Neutral and informative, maintaining a balance between formality and approachability. ' +
  'Punctuation: Structured with commas and pauses for clarity, ensuring information is digestible and well-paced. ' +
  'Delivery: Steady and measured, with slight emphasis on key figures and deadlines to highlight critical points.';

function findEnvKey() {
  for (const rel of ['../../../.env', '../../.env', '../.env', '.env']) {
    if (existsSync(rel)) {
      const env = readFileSync(rel, 'utf8');
      const k = env.match(/^OPENAI_API_KEY=(.*)$/m)?.[1];
      if (k) return k.replace(/["\r]/g, '').trim();
    }
  }
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  return null;
}

const KEY = findEnvKey();
if (!KEY) { console.error('no OPENAI_API_KEY in .env or env'); process.exit(1); }

const scriptPath = existsSync('vo-script.txt') ? 'vo-script.txt' : 'assets/vo-script.txt';
if (!existsSync(scriptPath)) { console.error('no vo-script.txt'); process.exit(1); }
const input = readFileSync(scriptPath, 'utf8').trim();
if (!input) { console.error('vo-script.txt empty'); process.exit(1); }

const outDir = existsSync('vo-script.txt') ? '.' : 'assets';

const TEMPO = Number(process.env.TTS_TEMPO || '0.95');
if (!(TEMPO >= 0.5 && TEMPO <= 1.5)) { console.error('TTS_TEMPO out of range 0.5-1.5'); process.exit(1); }

const res = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o-mini-tts',
    voice: 'onyx',
    input,
    instructions: INSTRUCTIONS,
    response_format: 'mp3',
  }),
});
if (!res.ok) { console.error('TTS failed', res.status, await res.text()); process.exit(1); }

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(`${outDir}/voice-raw.mp3`, buf);

// Speed-up deterministic bằng ffmpeg atempo → voice.mp3 (file final cho pipeline)
execFileSync(ffmpegPath(), ['-y', '-loglevel', 'error', '-i', `${outDir}/voice-raw.mp3`,
  '-filter:a', `atempo=${TEMPO}`, '-c:a', 'libmp3lame', '-b:a', '192k', `${outDir}/voice.mp3`]);
console.error(`voice.mp3 written (raw ${buf.length} bytes, atempo ${TEMPO})`);
