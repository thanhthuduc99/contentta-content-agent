#!/usr/bin/env node
// Lấy auto-caption transcript YouTube (free, no API key) qua youtube-transcript npm.
// Usage: node fetch-yt-transcript.mjs <videoId>
// Output stdout: plain text + thời lượng ước tính cuối.
// Nếu video không có caption → exit 2 (signal "no transcript").

import { YoutubeTranscript } from 'youtube-transcript';

const videoId = process.argv[2];
if (!videoId) { console.error('usage: fetch-yt-transcript.mjs <videoId>'); process.exit(1); }

try {
  const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
  if (!items?.length) { console.error('no transcript items'); process.exit(2); }
  const text = items.map(it => it.text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  const lastEnd = items[items.length - 1];
  const dur = (lastEnd.offset + lastEnd.duration) / 1000;
  console.log(text);
  console.error(`[transcript] ${items.length} items, ~${dur.toFixed(0)}s`);
} catch (err) {
  console.error('transcript fetch failed:', err.message || err);
  process.exit(2);
}
