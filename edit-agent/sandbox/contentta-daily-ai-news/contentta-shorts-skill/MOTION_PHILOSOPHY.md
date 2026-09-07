# MOTION PHILOSOPHY — Contentta v2026.05 Orbital

> ⚠️ **FILE NÀY LÀ LEGACY ORBITAL.** Palette Cosmic Red / Deep Space / Stardust trong đây **đã bị thay** bằng hệ ivory. Nguồn canonical hiện tại: `CLAUDE.md` §7 + `templates-vertical-ivory/README.md` + `templates-vertical-ivory/base-vertical.css`.
>
> Đọc file này **chỉ** để lấy hai thứ còn dùng được: **pacing/texture** và **kỹ thuật face-wrapper** (§3). Bỏ qua toàn bộ mã màu, khung T1–T5, mọi ref FCPXML/CapCut, và mọi nhắc tới `scene-patterns/` (đã archive ở `_archive-orbital/`).

> Đây là kim chỉ nam motion-graphics cho Contentta. Đọc trước khi build bất kỳ
> composition/scene nào. Khác với philosophy "Infinite" (kinetic typography
> trừu tượng), Contentta đi theo hướng **talking-head + motion graphics**:
> luôn có mặt người trong intro, motion graphics phục vụ kể chuyện, brand
> Cosmic Red trên nền Deep Space hoặc Stardust.

Brand source: `assets/brand-visual-guide.md`

---

## 0 · 10 Quy tắc bắt buộc (memorize)

1. **Intro luôn có mặt.** Scene đầu mặc định T2 (Mở thương hiệu — face full). Không bắt đầu bằng scene không có mặt (T1).
2. **Background vào trước, content vào sau.** Khi chuyển scene, panel/bg phải xuất hiện TRƯỚC, rồi overlay (face, text, widgets) mới vào. Face xuất hiện trên scene cũ = bug edit-lỗi rõ rệt.
3. **T4 và T5 phải tách bằng scene face-full hoặc T1.** Không bao giờ đặt T4 (mặt trái) cạnh T5 (mặt phải) trực tiếp — visual contrast bị phá.
4. **3 face states clear, không hybrid.** Mặt CHỈ ở 1 trong 4 vị trí: `FULL` (1920×1080), `LEFT` dock (x:60, y:60, 680×960), `RIGHT` dock (x:1180, y:60, 680×960), `HIDDEN` (opacity 0). Không có "shrunk center" hay "scale 0.85".
5. **Keyword caption 3–5 chữ, KHÔNG full subtitle.** T3 chỉ hiển thị từ chốt chính. Trắng hết, không dùng đỏ làm emphasis trong caption. Đỏ dành cho headline lớn (T5) hoặc wordmark.
6. **Gradient/shade chỉ xuất hiện cùng chữ.** Background gradient ở T3 KHÔNG bật trước. Delay `data-start` đến trước keyword đầu ~0.2s, fade-in 0.4s.
7. **Child clip durations phải match parent.** Sub-comp root `data-duration="11.0"` → tất cả con (kicker, terminal, chart, etc.) phải có duration ≥ 10s. Để child expire trước parent = widget biến mất giữa chừng = bug.
8. **Brand 3-color, ratio 60/25/15.** Mỗi scene phải có ~60% Deep Space (ink), ~25% Cosmic Red (accent), ~15% Stardust (text breathing). Không đem màu khác vào (yellow/green chỉ riêng T1 viết tay).
9. **Font Việt Be Vietnam Pro display + Plus Jakarta Sans body.** KHÔNG dùng Montserrat, Inter, hay system-ui. Caveat chỉ cho T1 viết tay.
10. **Timeline duration phải lấp slot.** Mỗi GSAP timeline kết thúc bằng `tl.to({}, { duration: SLOT }, 0)`. Thiếu = black frame flash. Render contract khắc cốt.

---

## 1 · Thư viện 5 templates (T1–T5)

5 mẫu chuẩn cho mọi video Contentta landscape 1920×1080. Mỗi mẫu = layout cố định + face state cố định + use case cụ thể.

| Code | Tên tiếng Việt | Face state | Khi nào dùng | Vai trò story |
|------|----------------|-----------|--------------|---------------|
| **T1** | Chèn ý tưởng | `HIDDEN` | Card viết tay (giấy kem + Caveat) chèn giữa các scene để chia tách concept. KHÔNG có mặt. | Insert beat / chuyển ý |
| **T2** | Mở thương hiệu | `FULL` | Brand opener — face full + wordmark CONTENTTA + tagline ở góc dưới-trái + kicker top-right. | Intro video |
| **T3** | Phụ đề karaoke | `FULL` | Face full + keyword 3–5 chữ trắng ở dưới, kèm gradient đen che 1/3 dưới khung. Style giống `anh-edit-mau/image copy.png`. | Talking-head emphasis |
| **T4** | Mặt trái, đồ hoạ phải | `LEFT` dock | Face dock TRÁI (x:60, y:60, 680×960, viền Stardust) + panel SÁNG bên phải với terminal mock + KPI/chart. | Demo / dữ liệu |
| **T5** | Mặt phải, đồ hoạ trái | `RIGHT` dock | Face dock PHẢI (x:1180, y:60, 680×960, viền Stardust) + panel TỐI bên trái với kicker + headline lớn + sub-line. | Concept reveal |

### Flow chuẩn (ví dụ video 30s)

```
0–4s    T2 (face FULL)        ← intro luôn có mặt
4–11s   T3 (face FULL)        ← keyword cho ý chính
11–18s  T4 (face LEFT)        ← demo + motion graphics phải
18–22s  T1 (face HIDDEN)      ← chia tách T4 và T5
22–30s  T5 (face RIGHT)       ← kết luận + headline lớn
```

Quy tắc: `T2/T3 → T4 → T1 → T5 → T3` là pattern bookend hoàn hảo. Bao giờ cũng intro+outro bằng face-full.

---

## 2 · Brand visual

### Universe Palette

| Token | Hex | Vai trò |
|-------|-----|---------|
| `--cosmic-red` | `#E10E1F` | Brand primary — wordmark, emphasis, kicker, KPI số |
| `--deep-space` | `#070409` | Ink dominant — background mặc định, text outline |
| `--stardust` | `#FAF7F5` | Warm white — text chính, border face dock |
| `--hot-flare` | `#FF2A3C` | Highlight active state |
| `--ember` | `#B0091B` | Secondary red, pressed state |
| `--maroon` | `#5A0410` | Deep red, depth |
| `--dust` | `#A89BA1` | Muted text, decorative glyphs |

### Ratio bắt buộc

- **Ink 60%** — Deep Space dominant trong mỗi scene
- **Red 25%** — Cosmic Red accent
- **White 15%** — Stardust breathing room

T4 là exception: panel sáng Stardust thay vì Deep Space — nhưng face dock LEFT vẫn đem ink lại qua face video.

### Typography

| Role | Font | Weights | Khi nào dùng |
|------|------|---------|--------------|
| Display | **Be Vietnam Pro** | 400, 500, 700 | H1-H3, hero, headline, wordmark CONTENTTA |
| Body | **Plus Jakarta Sans** | 300, 400, 500, 600 | Paragraph, lead, caption UI, kicker |
| Mono | JetBrains Mono | 400, 700 | Terminal mock, kicker tag, KPI label |
| Hand | Caveat | 700 | DUY NHẤT cho T1 viết tay |

Hỗ trợ tiếng Việt đầy đủ. KHÔNG fallback sang Roboto/system-ui ở render thật.

### Decorative glyphs (T5)

Brand quy định 5 glyphs orbital: `◐ ◑ ◒ ◓ ◉`. Dùng cho T5 panel trái làm decoration, drift slow bằng CSS keyframes hoặc finite GSAP repeat.

---

## 3 · Scene flow patterns

### Face-wrapper transition

Parent `index.html` chịu trách nhiệm animate `#face-wrapper` qua 4 state. Sub-composition KHÔNG bao giờ shrink face — chỉ overlay graphics.

**4 vị trí cố định:**

```js
const FULL  = { x: 0,    y: 0,  width: 1920, height: 1080, opacity: 1 };
const LEFT  = { x: 60,   y: 60, width: 680,  height: 960,  opacity: 1 };
const RIGHT = { x: 1180, y: 60, width: 680,  height: 960,  opacity: 1 };
// HIDDEN = { opacity: 0 } — giữ position cũ
```

**CSS class `.docked`:**

```css
#face-wrapper.docked {
  border-radius: 32px;
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.55),
    0 0 0 4px rgba(250, 247, 245, 0.95),
    0 0 60px rgba(225, 14, 31, 0.18);
  z-index: 5;
}
```

Áp class này KHI face ở LEFT hoặc RIGHT. Bỏ khi về FULL hoặc HIDDEN.

### Transition timing — Quy tắc "background trước, face sau"

**SAI** (face xuất hiện trên scene cũ):
```js
mainTl.set('#face-wrapper', RIGHT, 25.7);          // ← face appears at 25.7s
mainTl.to('#face-wrapper', { opacity: 1, ... }, 25.7);
// T5 scene mới start ở 26.0s → face hiện trên T1 cũ trong 0.3s
```

**ĐÚNG** (face slide cùng nhịp với T5 panel + frame border):
```js
// T5 scene starts at 26.0, panel slides 26.0–26.6, frame border 26.2–26.8.
// Face slide từ phải vào MATCHING frame border timing.
mainTl.set('#face-wrapper', { ...RIGHT, x: RIGHT.x + 200, opacity: 0 }, 26.2);
mainTl.to('#face-wrapper',
  { x: RIGHT.x, opacity: 1, duration: 0.6, ease: 'power3.out',
    onStart: () => wrapper.classList.add('docked') },
  26.2);
```

**Quy tắc tổng quát:** xác định thời điểm scene mới's bg/panel xuất hiện đầy đủ, rồi face slide-in sau đó hoặc cùng nhịp với frame border (KHÔNG bao giờ trước).

### Shade/gradient xuất hiện cùng chữ

T3 có lớp gradient đen che 1/3 dưới khung để keyword trắng nổi rõ. Gradient KHÔNG bật từ đầu scene.

**SAI:**
```html
<div class="clip t3-shade" data-start="0" data-duration="8.5"></div>
<!-- Shade visible từ 0s, keyword đầu xuất hiện ở 3.5s → 3.5s gradient lơ lửng vô nghĩa -->
```

**ĐÚNG:**
```html
<div class="clip t3-shade" data-start="3.2" data-duration="5.3"></div>
<!-- Shade fade-in ngay trước keyword tại 3.2s, giảm shock factor -->
```

Trong GSAP script:
```js
tl.from('.t3-shade', { opacity: 0, duration: 0.4, ease: 'power2.out' }, 3.2);
```

---

## 4 · Render contract (10 rules — Hyperframes)

1. Root `<div>` phải có `id`, `data-composition-id`, `data-start="0"`, `data-width`, `data-height`.
2. Mọi animated overlay có `class="clip"` + `data-start` + `data-duration` + `data-track-index`. **Trừ `<video>` và `<audio>`** (không dùng `clip` class).
3. `data-start` chấp nhận tham chiếu: `data-start="intro"`, `data-start="intro + 2"`, `data-start="intro - 0.5"`. Same-track không overlap được.
4. `<video>` phải `muted`. Audio mix qua `<audio>` sibling element. `data-has-audio="true"` chỉ khi video's own audio cần feed vào mix.
5. Mỗi composition đăng ký đúng 1 GSAP timeline paused vào `window.__timelines["<data-composition-id>"]`. Key phải match exact với `data-composition-id`.
6. Composition duration = `tl.duration()`. Timeline ngắn hơn video → video bị truncate. Pad bằng `tl.set({}, {}, <seconds>)` để extend.
7. KHÔNG gọi `.play()`, `.pause()`, `.currentTime` lên media. Framework own playback.
8. KHÔNG animate `width`/`height`/`top`/`left` trực tiếp lên `<video>` — browser freeze frames. Wrap trong `<div>` và animate wrapper.
9. Sub-compositions dùng `<template>` + `data-composition-src`. Timelines tự link với parent — không gọi `masterTL.add(child)`.
10. Determinism: không `Date.now()`, không `Math.random()` không seed, không network fetch lúc render. Dùng seeded PRNG.

### Bug đã học (đừng lặp lại)

| Bug | Triệu chứng | Fix |
|-----|-------------|-----|
| `repeat: -1` (infinite) | Lint error: "Infinite repeats break deterministic capture" | Dùng `repeat: 3` (finite count) hoặc CSS `@keyframes infinite` |
| `${root}` template literal trong querySelector | Lint error: "HTML bundler CSS parser crashes" | Hardcode full selector string: `'[data-composition-id="T3..."] .t3-w'` |
| Child clip expire trước parent | Widget biến mất giữa chừng | Update child `data-duration` ≥ parent duration |
| Face xuất hiện trên scene cũ | Visual glitch khi chuyển scene | Delay face fade-in/set position đến sau khi panel scene mới đã vào |
| Gradient hiện trước chữ | Khoảng đen lơ lửng đầu T3 | Delay shade `data-start` đến trước keyword đầu ~0.2s |
| Inline `style="z-index: ..."` trên face-wrapper | CSS class `.docked` không áp được | Bỏ inline, để class CSS rule lo z-index |

---

## 5 · Pre-flight checklist (chạy trước mỗi render final)

- [ ] Scene đầu là **T2** (face full) — KHÔNG bắt đầu T1
- [ ] T4 và T5 trong video — có scene face-full hoặc T1 ở giữa không?
- [ ] Mỗi face transition: panel scene mới vào TRƯỚC, face vào sau hoặc cùng nhịp
- [ ] T3 shade `data-start` >= keyword đầu - 0.3s
- [ ] Tất cả child clips trong sub-comp có `data-duration` ≥ parent
- [ ] Tất cả `gsap.to(..., { repeat: -1 })` đã chuyển sang finite hoặc CSS keyframes
- [ ] Hardcoded selectors thay vì `${root}` template literals
- [ ] Brand: Cosmic Red cho emphasis, Stardust cho text chính, Deep Space cho bg
- [ ] Font: Be Vietnam Pro display + Plus Jakarta Sans body, KHÔNG Montserrat
- [ ] `npx hyperframes lint` → **0 errors** (warnings OK)
- [ ] Draft render xong: extract frame hero mỗi scene, Read PNG verify
- [ ] Verify: mặt người không bị crop, text không overflow, brand colors đúng

---

## 6 · Code recipes (copy-paste)

### 6.1 Parent index.html shell

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700&family=Plus+Jakarta+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600;700&family=Caveat:wght@600;700&display=block" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1920px; height: 1080px; overflow: hidden;
      background: #070409; font-family: 'Be Vietnam Pro', sans-serif;
      color: #FAF7F5;
    }
    #face-wrapper {
      position: absolute; top: 0; left: 0;
      width: 1920px; height: 1080px;
      overflow: hidden; transform-origin: 0 0;
      z-index: 1; background: #000;
    }
    #face-video {
      position: absolute; top: 0; left: 50%;
      height: 100%; width: auto;
      transform: translateX(-50%); display: block;
      filter: contrast(1.04) saturate(1.05);
    }
    #face-wrapper.docked {
      border-radius: 32px;
      box-shadow:
        0 30px 80px rgba(0,0,0,0.55),
        0 0 0 4px rgba(250,247,245,0.95),
        0 0 60px rgba(225,14,31,0.18);
      z-index: 5;
    }
    .scene-layer { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="<slug>"
       data-start="0" data-duration="<total>"
       data-width="1920" data-height="1080">
    <div id="face-wrapper">
      <video id="face-video" data-start="0" data-duration="<total>"
             data-track-index="-1" src="assets/source.mp4" muted playsinline></video>
    </div>
    <audio id="face-audio" data-start="0" data-duration="<total>"
           data-track-index="2" data-volume="1" src="assets/source.mp4"></audio>

    <!-- Scenes ở đây, mỗi cái: data-composition-id, data-composition-src, data-start, data-duration -->
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    const mainTl = gsap.timeline({ paused: true });

    const FULL  = { x: 0,    y: 0,  width: 1920, height: 1080, opacity: 1 };
    const LEFT  = { x: 60,   y: 60, width: 680,  height: 960,  opacity: 1 };
    const RIGHT = { x: 1180, y: 60, width: 680,  height: 960,  opacity: 1 };
    const wrapper = document.getElementById('face-wrapper');
    gsap.set('#face-wrapper', FULL);

    // Face transitions ở đây — quy tắc background trước, face sau

    mainTl.to({}, { duration: <total> }, 0);
    window.__timelines["<slug>"] = mainTl;
  </script>
</body>
</html>
```

### 6.2 Face transition snippets

```js
// FULL → LEFT (T2/T3 → T4): face shrink trong sync với T4 panel slide
// T4 starts at scene_start, panel slides 0–0.6s local.
mainTl.to('#face-wrapper',
  { ...LEFT, duration: 0.6, ease: 'power3.inOut',
    onStart: () => wrapper.classList.add('docked') },
  scene_start - 0.3);   // start transition slightly before T4 scene

// LEFT → HIDDEN (T4 → T1): fade out face
mainTl.to('#face-wrapper',
  { opacity: 0, duration: 0.4, ease: 'power2.in',
    onComplete: () => wrapper.classList.remove('docked') },
  scene_start - 0.3);

// HIDDEN → RIGHT (T1 → T5): face slide từ phải vào, matching frame border
// T5 panel enters 0–0.6 local, frame border 0.2–0.8 local.
mainTl.set('#face-wrapper', { ...RIGHT, x: RIGHT.x + 200, opacity: 0 }, scene_start + 0.2);
mainTl.to('#face-wrapper',
  { x: RIGHT.x, opacity: 1, duration: 0.6, ease: 'power3.out',
    onStart: () => wrapper.classList.add('docked') },
  scene_start + 0.2);

// RIGHT → FULL (T5 → T3 outro): face expand back
mainTl.to('#face-wrapper',
  { ...FULL, duration: 0.6, ease: 'power3.inOut',
    onStart: () => wrapper.classList.remove('docked') },
  scene_start - 0.3);
```

### 6.3 Sub-composition skeleton (T3 caption ví dụ)

```html
<template id="T3-phu-de-karaoke-landscape-template">
  <div data-composition-id="T3-phu-de-karaoke-landscape"
       data-start="0" data-duration="8.5"
       data-width="1920" data-height="1080">

    <!-- Shade vào TRƯỚC keyword 0.2s -->
    <div class="clip t3-shade" data-start="3.2" data-duration="5.3" data-track-index="1"></div>

    <!-- Caption keyword 3–5 chữ trắng -->
    <div class="clip t3-caption" data-start="0" data-duration="8.5" data-track-index="2">
      <div class="t3-line">
        <span class="t3-w" data-at="3.50">EDIT</span>
        <span class="t3-w" data-at="3.85">VIDEO</span>
        <span class="t3-w" data-at="4.40">BẰNG</span>
        <span class="t3-w" data-at="4.70">AI</span>
      </div>
    </div>

    <style>
      [data-composition-id="T3-phu-de-karaoke-landscape"] {
        position: absolute; inset: 0; overflow: hidden;
        font-family: 'Be Vietnam Pro', sans-serif;
      }
      [data-composition-id="T3-phu-de-karaoke-landscape"] .t3-shade {
        position: absolute; left: 0; right: 0; bottom: 0;
        height: 45%;
        background: linear-gradient(180deg,
          rgba(7,4,9,0) 0%, rgba(7,4,9,0.55) 50%, rgba(7,4,9,0.90) 100%);
      }
      [data-composition-id="T3-phu-de-karaoke-landscape"] .t3-line {
        position: absolute; left: 0; right: 0; bottom: 12%;
        display: flex; justify-content: center; gap: 28px;
        font-family: 'Be Vietnam Pro', sans-serif;
        font-weight: 700; font-size: 110px;
        color: #FAF7F5;
        text-transform: uppercase;
        text-shadow: 0 4px 24px rgba(0,0,0,0.6);
      }
      [data-composition-id="T3-phu-de-karaoke-landscape"] .t3-w {
        display: inline-block; opacity: 0;
        transform-origin: 50% 80%;
      }
    </style>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      (() => {
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });
        // Hardcoded selector — KHÔNG dùng template literal ${...}
        const words = Array.from(document.querySelectorAll(
          '[data-composition-id="T3-phu-de-karaoke-landscape"] .t3-w'
        ));

        // Shade fade-in tại 3.2s, ngay trước keyword đầu 3.5s
        tl.from('[data-composition-id="T3-phu-de-karaoke-landscape"] .t3-shade',
          { opacity: 0, duration: 0.4, ease: 'power2.out' }, 3.2);

        words.forEach((w) => {
          const at = parseFloat(w.getAttribute('data-at'));
          tl.fromTo(w,
            { y: 30, opacity: 0, scale: 0.92 },
            { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' },
            at);
        });

        tl.to({}, { duration: 8.5 }, 0);
        window.__timelines["T3-phu-de-karaoke-landscape"] = tl;
      })();
    </script>
  </div>
</template>
```

### 6.4 Brand tokens CSS

Reference: `assets/brand-tokens.contentta.css`. Import vào parent hoặc inline trong sub-comp:

```css
:root {
  --cosmic-red:   #E10E1F;
  --deep-space:   #070409;
  --stardust:     #FAF7F5;
  --hot-flare:    #FF2A3C;
  --dust:         #A89BA1;

  --font-display: 'Be Vietnam Pro', system-ui, sans-serif;
  --font-body:    'Plus Jakarta Sans', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;
  --font-hand:    'Caveat', cursive;

  --face-radius-pip: 32px;
  --face-border-w:   4px;
  --face-border-color: var(--stardust);
}
```

---

## 7 · Khi nào dùng philosophy khác

Nếu brand brief explicitly đòi style khác (vd Infinite spot, AIS shorts, hay 1 client riêng), giữ **discipline** (1 idea per beat, background-first transitions, render contract, finite repeats) nhưng adapt **palette + typography + face pattern** theo brand đó.

Nếu không có brand brief riêng → DEFAULT là Contentta v2026.05 Orbital (file này).

---

## 8 · Workflow tham chiếu

Đầy đủ 6 bước ở `WORKFLOW.md` workspace root. Cốt lõi:

1. **Scaffold** — `video-projects/<slug>/` + meta.json + hyperframes.json
2. **Transcribe** — `npx hyperframes transcribe assets/source.mp4 --model small --json`
3. **Plan scenes** — đọc transcript, chia 4–6 scene, map mỗi scene → 1 template (xem § 1 flow chuẩn)
4. **Customize compositions** — copy templates/ vào project, sửa text + duration + `data-at` timing
5. **Build index.html** — face-wrapper transforms theo § 3
6. **Render** — lint → preview → draft render → visual verify → final render

Skill `/edit-video` (sẽ có sau) tự động hoá 6 bước này.

---

## 9 · Source of truth

- **Brand visual:** `assets/brand-visual-guide.md`
- **Templates:** `templates/` workspace root
- **Render contract:** `CLAUDE.md` workspace root
- **Workflow:** `WORKFLOW.md` workspace root
- **Preview reference:** `video-projects/_template-preview/`

Khi conflict giữa file này và brand visual chính thức → defer về brand visual.
