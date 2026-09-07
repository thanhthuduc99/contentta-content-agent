#!/usr/bin/env node
// analyze-transcript.mjs — in ra các điểm "vấp" ứng viên để cắt, từ transcript Whisper.
//
// Bắt 3 dấu hiệu:
//   1. GAP  — khoảng lặng giữa 2 từ > ngưỡng (mặc định 0.7s): dead-air / ngắt dài.
//   2. HOLD — Whisper gán 1 từ kéo dài > 1.5s: thường là chỗ nói xong rồi khựng/ấp úng.
//   3. DUP  — 2 từ liên tiếp trùng nhau: false-start lặp từ.
// Đối chiếu thêm với `ffmpeg -af silencedetect` (xem scripts/README.md) để chốt điểm cắt.
//
// Usage: node analyze-transcript.mjs <transcript.json> [gapThreshold=0.7] [holdThreshold=1.5]

import { readFileSync } from 'node:fs';

const [, , inPath, gapArg, holdArg] = process.argv;
if (!inPath) { console.error('Usage: node analyze-transcript.mjs <transcript.json> [gap=0.7] [hold=1.5]'); process.exit(1); }
const GAP = parseFloat(gapArg ?? '0.7');
const HOLD = parseFloat(holdArg ?? '1.5');

const t = JSON.parse(readFileSync(inPath, 'utf8'));
if (!Array.isArray(t.words)) { console.error('ERROR: transcript thiếu words[] (cần timestamp_granularities[]=word).'); process.exit(1); }
const w = t.words;
const f = (n) => n.toFixed(2);

console.log(`# Transcript: ${f(t.duration ?? w.at(-1).end)}s, ${w.length} words, ${t.segments?.length ?? '?'} segments\n`);

console.log(`## GAPS > ${GAP}s (dead-air / ngắt dài — ứng viên cắt)`);
for (let i = 1; i < w.length; i++) {
  const g = w[i].start - w[i - 1].end;
  if (g > GAP) console.log(`  ${f(g)}s @ ${f(w[i - 1].end)}  ...${w[i - 1].word} | ${w[i].word}...`);
}

console.log(`\n## HOLDS > ${HOLD}s (từ kéo dài = chỗ khựng/ấp úng)`);
let anyHold = false;
w.forEach((x) => { const d = x.end - x.start; if (d > HOLD) { anyHold = true; console.log(`  "${x.word}" giữ ${f(d)}s @ ${f(x.start)}-${f(x.end)}`); } });
if (!anyHold) console.log('  (none)');

console.log(`\n## DUPLICATE words liên tiếp (false-start)`);
let anyDup = false;
for (let i = 1; i < w.length; i++) {
  if (w[i].word.toLowerCase().trim() === w[i - 1].word.toLowerCase().trim()) { anyDup = true; console.log(`  "${w[i].word}" @ ${f(w[i - 1].start)}-${f(w[i].end)}`); }
}
if (!anyDup) console.log('  (none)');

console.log(`\n## SEGMENTS (ranh giới câu — dùng để chọn điểm cắt sạch)`);
(t.segments || []).forEach((s, i) => console.log(`  S${i} [${f(s.start)}-${f(s.end)}] ${s.text.trim().slice(0, 64)}`));
