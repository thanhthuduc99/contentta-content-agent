#!/usr/bin/env node
// generate-captions.mjs — sinh captions.html (karaoke dim→bright) từ transcript Whisper.
//
// Input: transcript JSON dạng OpenAI verbose_json (cần word-level + segment timestamps):
//   curl ... -F response_format=verbose_json \
//            -F "timestamp_granularities[]=word" -F "timestamp_granularities[]=segment"
//
// Logic chunk: tách caption THEO TỪNG CÂU Whisper (không gộp xuyên câu). Trong mỗi câu,
//   gom 3–5 từ, ưu tiên ngắt ở khoảng lặng > 0.30s. Chunk lẻ cuối câu (≤2 từ, vd "này")
//   được gộp vào dòng trước → không bị mồ côi.
//
// Usage:
//   node generate-captions.mjs <transcript.json> <output.html> [replacements.json] [--theme ivory]
//   replacements.json (tuỳ chọn): map sửa lỗi Whisper, vd {"ComCore":"Claude","CloudCode":"Claude"}
//   --theme ivory: hệ màu sáng hiện tại — chữ ink, từ đang đọc plum. Mặc định là orbital (nền tối).
//
// Output: captions.html — sub-composition Hyperframes (track captions), bottom 220px,
//   Be Vietnam Pro 600 44px, karaoke mờ → nổi theo lời, KHÔNG đỏ.

import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const themeIdx = argv.indexOf('--theme');
const THEME = themeIdx >= 0 ? argv[themeIdx + 1] : 'orbital';
const positional = argv.filter((a, i) => a !== '--theme' && argv[i - 1] !== '--theme');
const [inPath, outPath, repPath] = positional;
if (!inPath || !outPath) {
  console.error('Usage: node generate-captions.mjs <transcript.json> <output.html> [replacements.json]');
  process.exit(1);
}

const THEMES = {
  // Nền tối Orbital: chữ trắng mờ → trắng sáng, viền đen cho nổi trên ảnh
  orbital: {
    dim: 'rgba(250, 247, 245, 0.55)',
    bright: '#FAF7F5',
    shadow: '-2px -2px 0 #070409,2px -2px 0 #070409,-2px 2px 0 #070409,2px 2px 0 #070409,0 0 6px rgba(0,0,0,0.55),0 4px 12px rgba(0,0,0,0.5)',
  },
  // Nền kem ivory: chữ ink mờ → từ đang đọc màu plum, quầng sáng thay cho viền đen
  ivory: {
    dim: 'rgba(23, 19, 13, 0.40)',
    bright: '#4A3AE0',
    shadow: '0 0 10px rgba(250,246,239,0.95),0 0 22px rgba(250,246,239,0.75),0 2px 6px rgba(250,246,239,0.9)',
  },
};
const TH = THEMES[THEME];
if (!TH) { console.error(`ERROR: theme khong hop le: ${THEME}. Chon orbital hoac ivory.`); process.exit(1); }

const t = JSON.parse(readFileSync(inPath, 'utf8'));
if (!Array.isArray(t.words) || !Array.isArray(t.segments)) {
  console.error('ERROR: transcript thiếu words[] hoặc segments[]. Cần verbose_json + timestamp_granularities word & segment.');
  process.exit(1);
}
const REP = repPath ? JSON.parse(readFileSync(repPath, 'utf8')) : {};

const segBounds = t.segments.map((s) => s.start);
const segOf = (ws) => { let idx = 0; for (let i = 0; i < segBounds.length; i++) if (segBounds[i] <= ws + 0.001) idx = i; return idx; };

const words = t.words.map((w) => ({ w: w.word, s: +w.start.toFixed(2), e: +w.end.toFixed(2), seg: segOf(w.start) }));

// Áp replacements: key nhiều từ (vd "cả này":"cả ngày") match chuỗi từ liên tiếp,
// replacement tách lại theo space — từ thừa thành chuỗi rỗng (bị filter sau).
const phraseKeys = Object.keys(REP).filter((k) => k.includes(' ')).sort((a, b) => b.length - a.length);
for (const key of phraseKeys) {
  const kws = key.split(/\s+/);
  for (let i = 0; i <= words.length - kws.length; i++) {
    if (kws.every((kw, j) => words[i + j].w === kw)) {
      const reps = REP[key].split(/\s+/);
      kws.forEach((_, j) => { words[i + j].w = reps[j] || ''; });
    }
  }
}
for (const w of words) {
  if (Object.prototype.hasOwnProperty.call(REP, w.w)) w.w = REP[w.w];
}

// chunk trong từng câu + merge orphan trailing
const segs = [];
const bySeg = {};
words.filter((w) => w.w !== '').forEach((w) => { (bySeg[w.seg] = bySeg[w.seg] || []).push(w); });
Object.keys(bySeg).map(Number).sort((a, b) => a - b).forEach((si) => {
  const ws = bySeg[si];
  const chunks = [];
  let cur = [];
  for (let i = 0; i < ws.length; i++) {
    cur.push(ws[i]);
    const next = ws[i + 1];
    const gapNext = next ? next.s - ws[i].e : 99;
    if (!next || (cur.length >= 3 && gapNext > 0.30) || cur.length >= 5) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);
  while (chunks.length >= 2 && chunks[chunks.length - 1].length <= 2) {
    const last = chunks.pop();
    chunks[chunks.length - 1] = chunks[chunks.length - 1].concat(last);
  }
  chunks.forEach((c) => segs.push(c));
});

const SEGLIT = segs
  .map((s) => '          { words: [' + s.map((w) => `{w:${JSON.stringify(w.w)},s:${w.s},e:${w.e}}`).join(',') + '] }')
  .join(',\n');
const DUR = (t.duration ?? (segs.at(-1).at(-1).e + 0.5)).toFixed(2);

const HTML = `<template id="captions-template">
  <div data-composition-id="captions" data-start="0" data-width="1080" data-height="1920" data-duration="${DUR}">
    <link rel="stylesheet" href="assets/fonts/brand-fonts.css" />
    <div class="cap-stage" id="cap-stage"></div>
    <style>
      [data-composition-id="captions"] { position:absolute; inset:0; pointer-events:none; }
      [data-composition-id="captions"] .cap-stage { position:absolute; left:0; right:0; bottom:220px; height:0; pointer-events:none; }
      [data-composition-id="captions"] .cap-line-wrap { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:center; padding:0 80px; opacity:0; visibility:hidden; }
      [data-composition-id="captions"] .cap-line { display:inline-block; max-width:920px; padding:0 8px; text-align:center; font-family:"Be Vietnam Pro",sans-serif; font-weight:600; font-size:44px; line-height:1.22; letter-spacing:0.012em; color:${TH.dim}; text-shadow:${TH.shadow}; white-space:normal; }
      [data-composition-id="captions"] .cap-word { display:inline-block; margin:0 4px; transform-origin:center center; will-change:color; }
    </style>
    <script src="assets/vendor/gsap.min.js"></script>
    <script>
      (function () {
        const SEGMENTS = [
${SEGLIT}
        ];
        const COMP_DURATION = ${DUR};
        const DIM = "${TH.dim}";
        const BRIGHT = "${TH.bright}";
        const stage = document.querySelector('[data-composition-id="captions"] #cap-stage');
        if (!stage) return;
        SEGMENTS.forEach(function (seg, segIdx) {
          const wrap = document.createElement("div"); wrap.className = "cap-line-wrap"; wrap.id = "cap-seg-" + segIdx;
          const line = document.createElement("div"); line.className = "cap-line";
          seg.words.forEach(function (w, wIdx) {
            const span = document.createElement("span"); span.className = "cap-word"; span.id = "cap-w-" + segIdx + "-" + wIdx; span.textContent = w.w; line.appendChild(span);
          });
          wrap.appendChild(line); stage.appendChild(wrap);
        });
        const tl = gsap.timeline({ paused: true });
        const FADE_IN = 0.14, FADE_OUT = 0.06, PRE_ROLL = 0.10, SWAP_GUARD = 0.06, POST_HOLD = 0.18;
        SEGMENTS.forEach(function (seg, segIdx) {
          const wrapSel = '[data-composition-id="captions"] #cap-seg-' + segIdx;
          const segStart = seg.words[0].s, segEnd = seg.words[seg.words.length - 1].e;
          const nextSeg = SEGMENTS[segIdx + 1];
          const nextStart = nextSeg ? nextSeg.words[0].s : COMP_DURATION + 1;
          const naturalExit = segEnd + POST_HOLD, forcedExit = nextStart - PRE_ROLL - SWAP_GUARD - FADE_OUT;
          const fadeOutAt = Math.max(segStart + 0.1, Math.min(naturalExit, forcedExit));
          const fadeInAt = Math.max(segStart - PRE_ROLL, 0);
          const hideAt = fadeOutAt + FADE_OUT + 0.02;
          seg.words.forEach(function (w, wIdx) {
            tl.set('[data-composition-id="captions"] #cap-w-' + segIdx + "-" + wIdx, { color: DIM }, fadeInAt);
          });
          tl.set(wrapSel, { visibility: "visible" }, fadeInAt);
          tl.fromTo(wrapSel, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: FADE_IN, ease: "power2.out" }, fadeInAt);
          seg.words.forEach(function (w, wIdx) {
            tl.to('[data-composition-id="captions"] #cap-w-' + segIdx + "-" + wIdx, { color: BRIGHT, duration: 0.10, ease: "power2.out" }, w.s);
          });
          tl.to(wrapSel, { opacity: 0, duration: FADE_OUT, ease: "power2.in" }, fadeOutAt);
          tl.set(wrapSel, { visibility: "hidden" }, hideAt);
        });
        tl.set({}, {}, COMP_DURATION);
        window.__timelines = window.__timelines || {};
        window.__timelines["captions"] = tl;
      })();
    </script>
  </div>
</template>
`;

writeFileSync(outPath, HTML);
console.error(`captions.html written: ${segs.length} segments, duration ${DUR}s -> ${outPath}`);
