#!/usr/bin/env node
// Chuyển 1 template dọc standalone (templates-vertical-ivory/vXX-*.html)
// thành sub-composition Hyperframes dùng được trong index.html.
//
//   node tools/template-to-scene.mjs <template.html> <out.html> <compId> <duration>
//
// Việc nó làm:
//   - Bỏ 4 lớp nền (ambient-bg lo, chạy full duration, không lặp mỗi scene)
//   - Scope toàn bộ CSS và selector GSAP bằng [data-composition-id="<compId>"]
//   - Đổi đường dẫn asset sang assets/ của project
//   - Đổi DUR sang duration thật của scene, đăng ký __timelines[compId]

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath, compId, durArg] = process.argv;
if (!inPath || !outPath || !compId || !durArg) {
  console.error('Usage: node tools/template-to-scene.mjs <template.html> <out.html> <compId> <duration>');
  process.exit(1);
}
const DUR = Number(durArg).toFixed(2);
const SCOPE = `[data-composition-id="${compId}"]`;

const src = readFileSync(inPath, 'utf8');

const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = src.match(/<div class="stage">([\s\S]*?)<\/div>\s*<script src="vendor\/gsap\.min\.js">/);
const scriptMatch = src.match(/<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
if (!styleMatch || !bodyMatch || !scriptMatch) {
  console.error('ERROR: không parse được template. Cần <style>, div.stage và IIFE <script>.');
  process.exit(1);
}

// --- CSS: prefix từng selector ---
function scopeCss(css) {
  return css.replace(/(^|\})([^{}@]+)\{/g, (m, close, sel) => {
    const scoped = sel
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${SCOPE} ${s}`)
      .join(', ');
    return `${close}\n${scoped} {`;
  });
}

// --- JS: prefix mọi chuỗi bắt đầu bằng dấu chấm (selector class) ---
// Không đụng '#4A3AE0' (hex) hay 'power3.out' (ease) vì chúng không mở đầu bằng '.'
function scopeJs(js) {
  return js.replace(/(['"`])(\.[^'"`\n]*)\1/g, (m, q, sel) => `${q}${SCOPE} ${sel}${q}`);
}

let body = bodyMatch[1];
// 4 lớp nền do ambient-bg lo
body = body
  .replace(/<div class="bg-orbs">[\s\S]*?<\/div>\s*/g, '')
  .replace(/<div class="bg-(dots|floor|grain)"><\/div>\s*/g, '');
// Đường dẫn asset trong project
body = body
  .replace(/\.\.\/shared\/emoji\//g, 'assets/emoji/')
  .replace(/demo-assets\//g, 'assets/media/');

let css = scopeCss(styleMatch[1]);
// .glow là con trực tiếp của .stage trong template, trong composition nó nằm cùng cấp
css = css.replace(/z-index: 1;/g, 'z-index: 0;');

let js = scopeJs(scriptMatch[1]);
js = js
  .replace(/const DUR = [\d.]+;/, `const DUR = ${DUR};`)
  .replace(/window\.__TL = tl;\s*/g, '')
  .replace(/window\.__DUR = DUR;\s*/g, '')
  .replace(/window\.__timelines\['[^']+'\] = tl;/, `window.__timelines[${JSON.stringify(compId)}] = tl;`)
  .replace(/document\.fonts\.ready\.then\(\(\) => \{ window\.__READY = true; \}\);\s*/g, '')
  // v13 gói __READY trong document.fonts.ready (đã strip ở trên); v15 set thẳng trong
  // async init() nên phải strip riêng, không thì mỗi scene báo trang sẵn sàng quá sớm.
  .replace(/window\.__READY = true;\s*/g, '');

// Renderer capture tung composition rieng, khong thay <link> o index.html.
// Khong nhung font + base css vao day thi chu roi ve font fallback trong video.
const html = `<template id="${compId}-template">
  <div data-composition-id="${compId}" data-start="0" data-width="1080" data-height="1920" data-duration="${DUR}">
    <link rel="stylesheet" href="assets/fonts/brand-fonts.css" />
    <link rel="stylesheet" href="assets/base-vertical.css" />
${body.trimEnd()}
    <style>
${css.trim()}
    </style>
    <script src="assets/vendor/gsap.min.js"></script>
    <script>
      (function () {${js.trimEnd()}
      })();
    </script>
  </div>
</template>
`;

writeFileSync(outPath, html);
console.log(`${compId}  ${DUR}s  <- ${inPath.split(/[\\/]/).pop()}`);
