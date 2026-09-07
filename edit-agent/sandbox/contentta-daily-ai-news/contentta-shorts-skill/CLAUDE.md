# Contentta Shorts — Skill edit video ngắn (vertical, có mặt người)

Skill **portable** để edit video ngắn brand Contentta với motion graphics + karaoke caption + nhạc nền, **captions baked-in** (KHÔNG FCPXML, KHÔNG CapCut). Mang folder `contentta-shorts-skill/` sang máy/agent khác là chạy được — chỉ cần các phụ thuộc ở README.

**3 chế độ sản xuất** (chi tiết §3b):
- **Face dọc 1080×1920** (mặc định) — talking-head, giọng thu thật → Whisper. Mẫu: `video-projects/claude-intro-doc`.
- **No-face dọc 1080×1920** — "không mặt người" / bản tin / video tổng hợp, giọng **TTS tự sinh**. Mẫu: `video-projects/daily-ivory-vertical` (hệ màu ivory hiện tại). Bản Orbital cũ đã archive sang `_archive-orbital/video-projects/opus-48-daily-khong-face`, không dùng nữa.
- **Landscape 1920×1080** — "edit video ngang" / intro YouTube, face FULL ↔ dock phải. Mẫu: `video-projects/intro-google-io-ngang`.

> Đọc kèm: `WORKFLOW.md` (10 bước có lệnh), `scripts/README.md` (transcribe + cắt + gen caption), `MOTION_PHILOSOPHY.md` (gu thẩm mỹ — phần T1–T5 là legacy landscape, bỏ qua).

---

## 0. HARD RULES (bắt buộc — từ feedback thực tế)

1. **Dọc 1080×1920 mặc định.** Ngang 1920×1080 khi user nói "edit video ngang"; no-face + TTS khi "không mặt người" → §3b.
2. **Cắt đoạn vấp** trước khi build: dead-air + false-start + đoạn ấp úng (xem §1).
3. **Speed 1.1x** mặc định (user nói chậm).
4. **Tiếng Việt chuẩn**, không lẫn tiếng Anh, không thiếu chữ. Sửa lỗi Whisper qua `replacements.json`.
5. **Short-form ≠ poster:** graphics nửa trên, mặt nửa dưới, caption strip đáy, pacing nhanh, chữ vừa phải.
6. **Caption tách theo câu** (không gộp xuyên câu), KHÔNG đỏ. Dùng `scripts/generate-captions.mjs`.
   - Hệ ivory (mặc định cho daily news): `--theme ivory` — chữ ink `rgba(23,19,13,0.40)` → từ đang đọc plum `#4A3AE0`.
   - Hệ Orbital cũ (nền tối): `--theme orbital` — trắng mờ → trắng sáng.
7. **Giãn dòng** title khi dòng trên dấu nặng + dòng dưới dấu sắc (Ậ/Ớ) → line-height ~1.34.
8. **YouTube outro:** user nói "edit video ngắn giới thiệu youtube" → chèn `youtube-outro` 3s cuối, dòng dưới "Channel: Thành Vũ Đức".
9. **Idle animation = GSAP yoyo hữu hạn** (`repeat: 2`), **KHÔNG** `repeat: -1`, **KHÔNG** CSS `@keyframes`. Lý do: renderer seek theo `__TL.time(t)`, CSS animation chạy theo đồng hồ thật nên mỗi lần render ra một kiểu. Determinism: không `Date.now()`, không `Math.random()`.
10. **Visual-verify gate:** render draft → extract frames → **Read PNG** verify TRƯỚC final.

---

## 1. Pipeline cắt vấp (điểm cốt lõi)

Dùng **OpenAI Whisper API trực tiếp** (key `OPENAI_API_KEY` trong `.env`), KHÔNG phụ thuộc `hyperframes transcribe`.

```
source.mp4 → tách audio → transcribe (verbose_json, word+segment)
           → analyze-transcript.mjs + ffmpeg silencedetect → chốt đoạn giữ
           → ffmpeg trim+concat + setpts/1.1 + atempo=1.1 → face-final.mp4
           → re-transcribe face-final → transcript-final.json (timeline caption)
```

Cắt bỏ: lead-in im lặng, **dead-air** (gap > ~0.7s không cần thiết), **false-start** (lặp từ, "à ờ"), **đoạn ấp úng** — dấu hiệu: Whisper gán **1 từ kéo dài nhiều giây** (vd "hiểu" giữ 9s) = nói xong rồi khựng. Lệnh cụ thể: `scripts/README.md` §1–3. Source gốc giữ nguyên.

---

## 2. Hai hướng motion (đã duyệt)

**IVORY là hướng duy nhất đang dùng.** Nền kem, card trắng nổi, pastel + plum. Bộ 10 template dọc có sẵn animation ở `templates-vertical-ivory/`, bảng chọn template trong `templates-vertical-ivory/README.md`. Sinh scene bằng `tools/template-to-scene.mjs`. Motion theo DS: chỉ transform + opacity, ease `cubic-bezier(.22,1,.36,1)`, 0.25-0.9s, stagger 0.08. Riêng v01/v02/v07 được overshoot mạnh cho hook 3 giây đầu.

Cùng hệ với bộ ngang 1920x1080 ở project `edit motion graphics`: chung 17 token màu, chung 3 font, khác khung và type scale.

> **ĐÃ ARCHIVE, KHÔNG DÙNG NỮA.** Hai hướng cũ **COSMIC** (nền đen, orbital rings, nebula) và **EDITORIAL** (Playfair italic, số chương stroke) đã chuyển vào `_archive-orbital/`. Giữ để đối chiếu lịch sử, **không copy vào project mới**, không trộn với ivory trong cùng một video. Cũng **KHÔNG** dùng HUD/terminal (đã bị loại từ trước).

---

## 3. Kiến trúc scene (index.html)

`index.html` là orchestrator. Mặt người **luôn BOTTOM** (talking-head); graphics nửa trên không đè mặt.

| Track | Nội dung |
|---|---|
| 0 | `ambient-bg` (nebula Deep Space, full canvas) |
| 1 | `#face-wrapper > video` (muted) — BOTTOM: `translate(0,1136) scale(0.5625)` |
| 2 | scenes (tuần tự, không overlap — shave 0.02 tránh float overlap) |
| 3 | `captions` (karaoke, full duration) |
| 4 | `face-audio` (`<audio>` src = face-final.mp4, volume 1) |
| 5 | `music` (`<audio>`, volume 0.14–0.15) |
| 99 | `grain-overlay` |

- **Face math:** `face-wrapper-pattern.md`. BOTTOM scale 0.5625 (1080/1920), y=1136. HIDDEN: opacity 0 (cho scene full-canvas). Seam line đỏ tại y≈1132. Ken Burns: face-video scale 1.0→1.04 over full.
- **Graphics zone:** y ~120–1050. Caption strip bottom 220 (đè phần dưới mặt — đúng chuẩn). Mỗi scene chừa sẵn "vùng mặt" phía dưới.
- **Fonts** (load ở index `<head>`, display=block): Be Vietnam Pro (display/number), Plus Jakarta Sans (body/chip), Playfair Display ital (editorial), JetBrains Mono (label/số).

## 3b. Biến thể: no-face (TTS) & landscape

§3 ở trên mô tả chế độ mặc định (face dọc, thu giọng thật). 2 biến thể dưới đây đổi pipeline + kiến trúc track.

### No-face dọc (giọng TTS) — mẫu `video-projects/daily-ivory-vertical`
Dùng khi user nói "không mặt người", làm bản tin / video tổng hợp không có người quay.
- **Bỏ B2–B5** (thu/cắt vấp). Sinh giọng bằng **Gemini 2.5 Flash Preview TTS** (`gemini-2.5-flash-preview-tts`, voice `Algenib`, style phát thanh viên) — key `GEMINI_API_KEY` trong `.env`. Gemini trả **PCM→WAV→mp3** (ffmpeg trong `tts.mjs`). Style/giọng điều khiển bằng câu chỉ đạo natural-language đầu prompt (không có param riêng). **`hyperframes tts` (Kokoro) KHÔNG hỗ trợ tiếng Việt**, đừng dùng.
- Pipeline: viết `assets/vo-script.txt` (phiên âm tên riêng, vd Contentta→"Còn Ten Ta") → `tts.mjs` → `voice.mp3` → `transcribe.mjs` (**OpenAI Whisper**, key `OPENAI_API_KEY`, word-timing) → `generate-captions.mjs` + `replacements.json` (fix Whisper nghe sai: Claude→"Plot", Anthropic→"Entropic", Contentta→"contenta") → canh `data-start` scene theo segment boundary của transcript. Script mẫu nằm trong `assets/` của project.
- **KHÔNG face-wrapper/seam.** Scene full-canvas trên `ambient-bg`. Track: `ambient` 0 · scenes 2 · `captions` 3 · `voice`(`<audio>`) 4 vol 1 · `music` 5 vol 0.14 · `grain` 99.
- `ambient-bg.html` lấy từ `compositions/` của scaffold `daily-ivory-vertical` (nền kem `#FAF6EF`). **KHÔNG** lấy bản nebula đen trong `_archive-orbital/templates/`.
- Nhịp: câu chỉ đạo "tốc độ vừa phải" + script ~300 từ ≈ 88s. Muốn nhanh/chậm → sửa câu `style` trong `tts.mjs`. Đổi giọng → đổi `voiceName` (danh sách voice xem Google AI Studio).
- **⚠ DAILY NEWS PIPELINE override:** repo daily dùng `AGENT-RUNBOOK.md` ở root — target **55–62s, script 180–210 từ, TTS OpenAI onyx + atempo 1.15, form tùy biến 4–6 scene**. Số liệu 88s/300 từ ở trên là của project mẫu cũ, KHÔNG áp cho daily run.
- Pattern bổ sung (custom, tái dùng): badge số "THAY ĐỔI N" (liệt kê 1→5) · slider mốc (Low→Ultra) · số tương phản gạch (50→15) · split-flow (1 task → nhiều phần).

### Landscape 1920×1080 — mẫu `video-projects/intro-google-io-ngang`
Dùng khi user nói "edit video ngang" / intro YouTube landscape.
- Mặt **full-frame nền**: `#face-wrapper` 1920×1080, `#face-video` `height:100%` căn giữa (`left:50%;translateX(-50%)`). GSAP animate **width/height** trên wrapper (KHÔNG scale như dọc).
- 2 vị trí: `FULL {x:0,y:0,w:1920,h:1080}` ↔ `RIGHT dock {x:1180,y:60,w:680,h:960}` + class `.docked` (viền trắng 4px, bo góc 32px, shadow). Panel scene vào TRƯỚC, face dock sau ~0.15s.
- Track: `face-video` -1 · `voice`(`<audio>` tách) 1 vol 1 · `music` 2 vol 0.12 · scenes 4 (đặt `style="z-index:3"` inline trên div scene ở index). **KHÔNG** track `ambient`/`grain`/`captions` riêng — mỗi scene tự vẽ panel nền (vd panel trái 62%), không karaoke caption.
- Scene file đánh số `01-…html`, nghiêng **editorial** (hook-title · stat · questions · cta). Reveal nội bộ bằng nhiều clip con (`class="clip"` + `data-track-index` trong sub-comp) + thuộc tính `data-at` cho stagger.

## 4. Scene templates — `templates-vertical-ivory/`

10 template dọc 1080x1920, mỗi file tự chứa một GSAP timeline paused trên `window.__TL`. Sinh scene bằng `tools/template-to-scene.mjs` (tool tự bỏ 4 lớp nền, scope CSS + selector GSAP theo composition id, nhúng font và `base-vertical.css`).

| # | File | Dùng khi |
|---|---|---|
| 01 | `v01-title-card.html` | Mở video, mở chương mới |
| 02 | `v02-hook-statement.html` | Câu tuyên bố mạnh, câu hỏi mở |
| 03 | `v03-grid-cards.html` | Liệt kê 3-4 ý ngang hàng |
| 06 | `v06-workflow.html` | Pipeline 3-5 bước |
| 07 | `v07-big-number.html` | Một con số cần đóng đinh |
| 09 | `v09-screenshot-callout.html` | Chỉ vào ảnh thật |
| 10 | `v10-terminal-code.html` | Demo lệnh, YAML, cấu hình |
| 11 | `v11-before-after.html` | Đối chiếu trước và sau |
| 13 | `v13-cta-outro.html` | Chốt cuối video |
| 14 | `v14-media-slideshow.html` | 2-3 ảnh thật trượt nối tiếp |
| 15 | `v15-follow-comment.html` | CTA "Comment X" — cursor demo bấm Follow rồi gõ comment |

Không có 04, 05, 12 (cả ba cần mặt người) và không có lower-third overlay (daily news không có footage nền để đè).

Luật cứng đầy đủ (4 lớp nền, chỉ `var(--token)`, 3 font, một `.accent` Lora mỗi khung, emoji phải là PNG, chữ dưới 24px dùng `--ink-soft`) nằm trong `templates-vertical-ivory/README.md`. Đọc file đó trước khi dựng scene.

Mỗi scene CẦN: entrance animation trên mọi element, nội dung reveal **khớp lời** (mốc = timestamp transcript). Scene nhiều mục phải canh từng mục theo mốc giọng nói, đừng để stagger mặc định chạy hết trong 1,5 giây rồi ngồi im 15 giây.

> Bộ pattern cosmic/editorial cũ (12 file) nằm ở `_archive-orbital/templates/scene-patterns/`. **Không dùng.**

## 5. Caption rules

Dùng `scripts/generate-captions.mjs <transcript-final.json> compositions/captions.html [replacements.json]`:
- Chunk theo **từng câu Whisper**, gộp từ lẻ cuối câu vào dòng trước (không mồ côi "này…").
- Ivory: ink `rgba(23,19,13,0.40)` → plum `#4A3AE0` theo lời (0.10s). Orbital: trắng mờ `rgba(250,247,245,0.55)` → `#FAF7F5`. **KHÔNG đỏ, không scale pop.**
- Be Vietnam Pro 600, 44px, outline 2px stack, bottom 220px. Fade out trước segment kế (SWAP_GUARD).

## 6. Typography
- Title nhiều dòng: nếu dòng trên dấu **nặng** + dòng dưới dấu **sắc** → line-height **~1.34** (per-line). Khác → ~1.15.
- 3 font, không hơn: Bricolage Grotesque (display 700-800), Be Vietnam Pro (body 400-600), Lora italic (nhấn 1-2 từ). Một khung chỉ một cụm `.accent` Lora italic.
- Text mặc định `--ink` trên nền `--ivory`. Accent = `--plum`. Chữ dưới 24px dùng `--ink-soft`, **không** `--ink-muted` (3.6:1, trượt WCAG AA).
- Caption emphasis: plum `#4A3AE0`, không đỏ, không scale pop.

## 7. Brand Contentta, hệ Ivory (hiện tại)

Nguồn sự thật về hình: `templates-vertical-ivory/base-vertical.css`.
Nguồn sự thật về brand: `D:\thanh\Obsidian\thanh\Business\Contentta\_context\INFRASTRUCTURE\Contentta Design System`.

| Token | Value | Vai trò |
|---|---|---|
| `--ivory` | `#FAF6EF` | bg chính |
| `--ivory-deep` | `#F3ECE0` | bg chìm |
| `--paper` | `#FFFFFF` | card nổi |
| `--ink` | `#17130D` | text chính |
| `--ink-soft` | `#4A4339` | text phụ, chữ dưới 24px |
| `--ink-muted` | `#8A8073` | chỉ cho chữ từ 24px trở lên |
| `--plum` | `#4A3AE0` | accent chính |
| `--plum-2` | `#7B6CFF` | accent nhạt |
| `--lavender` `--peach` `--sky` `--sage` `--gold` | `#B7A8FF` `#FFB39C` `#9AD0FF` `#A9E0C2` `#E6B45A` | pastel phân loại |

Màu chỉ lấy qua `var(--token)`. Cần màu mới thì thêm token vào `base-vertical.css`, không viết hex thẳng trong scene.

> **Brand Orbital cũ (v2026.05)**, Cosmic Red `#E10E1F` + Deep Space `#070409` + Stardust `#FAF7F5`, đã thay. Token file cũ giữ ở `assets/brand-tokens.contentta.css` cho project legacy, **không dùng cho video mới**.

## 8. Render contract (compact)
1. Root `<div>`: id, data-composition-id, data-start="0", data-width, data-height.
2. Element có thời gian cần data-start/data-duration/data-track-index (trừ `<video>`/`<audio>`).
3. `<video>` phải `muted`; audio ở `<audio>` riêng.
4. Mỗi composition đăng ký 1 GSAP timeline **paused** trên `window.__timelines["<id>"]` (key = data-composition-id).
5. Pad timeline tới đúng data-duration: `tl.set({},{},DUR)`.
6. Scene cùng track không overlap → shave 0.02 nếu end == next start (tránh float).
7. KHÔNG .play()/.pause()/.currentTime trên media. KHÔNG animate width/height/top/left trên `<video>` (bọc div).
8. Idle = CSS @keyframes. Không Date.now/Math.random.

## 9. Visual-verify gate (BẮT BUỘC)
```bash
npx hyperframes render --quality draft --output renders/draft.mp4
# extract frame hero mỗi scene rồi Read PNG vào context:
for t in <scene-times>; do ffmpeg -y -ss $t -i renders/draft.mp4 -frames:v 1 -q:v 3 renders/frames/t$t.jpg; done
```
Read TỪNG PNG, verify: mặt không crop, caption sync đúng từ, brand color, KHÔNG va dấu, không overflow, jump-cut được transition che. Sai → sửa → re-render. Chỉ render `--quality standard` sau khi pass.

## 10. Commands
```bash
node scripts/analyze-transcript.mjs transcript.json     # tìm chỗ vấp
node scripts/generate-captions.mjs transcript-final.json compositions/captions.html [rep.json]
npx hyperframes lint                                     # phải 0 error
npx hyperframes preview                                  # Studio localhost:3002 (gate duyệt live)
npx hyperframes render --quality draft|standard --output renders/X.mp4
npx hyperframes doctor                                   # check env
```

Toàn bộ 10 bước có lệnh: `WORKFLOW.md`.
