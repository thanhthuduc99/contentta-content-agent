#!/usr/bin/env node
// OpenAI Whisper word-timing transcription cho voice.mp3 (tiếng Việt).
// Output: assets/transcript-final.json (verbose_json với word + segment timestamps).
// CWD = video-projects/daily-YYYYMMDD/ hoặc .../assets/.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

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
if (!KEY) { console.error('no OPENAI_API_KEY'); process.exit(1); }

const audioPath = existsSync('voice.mp3') ? 'voice.mp3'
                : existsSync('assets/voice.mp3') ? 'assets/voice.mp3'
                : null;
if (!audioPath) { console.error('no voice.mp3 found'); process.exit(1); }
const outPath = audioPath === 'voice.mp3' ? 'transcript-final.json' : 'assets/transcript-final.json';

const audio = readFileSync(audioPath);
const fd = new FormData();
fd.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'voice.mp3');
fd.append('model', 'whisper-1');
fd.append('language', 'vi');
fd.append('response_format', 'verbose_json');
fd.append('timestamp_granularities[]', 'word');
fd.append('timestamp_granularities[]', 'segment');

const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}` },
  body: fd,
});
if (!res.ok) { console.error('transcribe failed', res.status, await res.text()); process.exit(1); }
const json = await res.json();
writeFileSync(outPath, JSON.stringify(json, null, 2));
console.error(`${outPath}: ${json.words?.length} words, ${json.segments?.length} segments, dur ${json.duration?.toFixed(2)}s`);
