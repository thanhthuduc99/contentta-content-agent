#!/usr/bin/env node
// Vivibe (lucylab) TTS — json-rpc: ttsLongText -> poll getExportStatus -> tải wav.
// Sau TTS apply ffmpeg atempo (TTS_TEMPO env, default 0.95) giống tts-openai.mjs —
// giữ cùng interface để bước transcribe/pipeline phía sau không đổi.
// Đọc vo-script.txt từ cwd. Xuất voice.mp3 (đã speed-up) — transcribe TRÊN file này.
//
// CWD = video-projects/daily-YYYYMMDD/assets/  (hoặc project root, giống tts-openai.mjs).
// Key/voice KHÔNG để trong .env repo daily-news (.env đó note "chỉ 1 key OPENAI, không
// thêm key khác") — đọc thẳng từ edit-agent/.env gốc, block #VOICE_VERTICAL_PRO_VIVIBE
// (cùng nguồn key mà vertical-pro dùng, xem apps/vertical-pro/scripts/tts-vivibe.mjs).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ffmpegPath } from './ffmpeg-bin.mjs';

const ENDPOINT = 'https://api.lucylab.io/json-rpc';

// Do key: EDIT_AGENT_ENV neu co, roi .env leo len tu CWD (giong tts-openai.mjs),
// cuoi cung la bien moi truong.
function findEnv(name) {
  const files = [];
  if (process.env.EDIT_AGENT_ENV) files.push(process.env.EDIT_AGENT_ENV);
  files.push('../../../.env', '../../.env', '../.env', '.env',
             '../../../../.env', '../../../../../.env');
  for (const f of files) {
    try {
      if (!existsSync(f)) continue;
      const v = readFileSync(f, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1];
      if (v) return v.replace(/["\r]/g, '').trim();
    } catch { /* file khong doc duoc thi thu file ke */ }
  }
  return process.env[name] || null;
}

const KEY = findEnv('VIVIBE_API_KEY');
const VOICE_ID = findEnv('VOICE_ID');
// Khong co key Vivibe thi chuyen sang OpenAI TTS, khong chan build.
if (!KEY || !VOICE_ID) {
  console.error('khong thay VIVIBE_API_KEY/VOICE_ID, chuyen sang tts-openai.mjs');
  const here = dirname(fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath, [join(here, 'tts-openai.mjs')], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const scriptPath = existsSync('vo-script.txt') ? 'vo-script.txt' : 'assets/vo-script.txt';
if (!existsSync(scriptPath)) { console.error('no vo-script.txt'); process.exit(1); }
const input = readFileSync(scriptPath, 'utf8').trim();
if (!input) { console.error('vo-script.txt empty'); process.exit(1); }

const outDir = existsSync('vo-script.txt') ? '.' : 'assets';

const TEMPO = Number(process.env.TTS_TEMPO || '0.95');
if (!(TEMPO >= 0.5 && TEMPO <= 1.5)) { console.error('TTS_TEMPO out of range 0.5-1.5'); process.exit(1); }

async function rpc(method, input) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, input }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${method} lỗi: ${(data.error.message || '').slice(0, 200)}`);
  return data.result;
}

console.error(`vivibe TTS: ${input.length} ký tự, giọng ...${VOICE_ID.slice(-6)}`);
const { projectExportId, blockCount } = await rpc('ttsLongText', { text: input, userVoiceId: VOICE_ID, speed: 1 });
console.error(`đã gửi, ${blockCount || 0} block, chờ render...`);

let status = {};
for (let i = 0; i < 120; i++) {
  status = await rpc('getExportStatus', { projectExportId });
  if (status.state === 'completed') break;
  if (status.state === 'failed' || status.state === 'error') { console.error('job thất bại', JSON.stringify(status).slice(0, 200)); process.exit(1); }
  await new Promise((r) => setTimeout(r, 5000));
}
if (status.state !== 'completed') { console.error('chờ quá 10 phút vẫn chưa xong'); process.exit(1); }

// status.url trả wav (lucylab render ra wav) — giữ đúng đuôi để ffmpeg không đoán sai format.
const rawBuf = Buffer.from(await (await fetch(status.url)).arrayBuffer());
writeFileSync(`${outDir}/voice-raw.wav`, rawBuf);

// Speed-up deterministic bằng ffmpeg atempo → voice.mp3 (file final cho pipeline)
execFileSync(ffmpegPath(), ['-y', '-loglevel', 'error', '-i', `${outDir}/voice-raw.wav`,
  '-filter:a', `atempo=${TEMPO}`, '-c:a', 'libmp3lame', '-b:a', '192k', `${outDir}/voice.mp3`]);
console.error(`voice.mp3 written (raw ${rawBuf.length} bytes, atempo ${TEMPO})`);
