# templates-vertical-human — bộ template dọc 1080x1920 "giống người làm"

Bộ 11 template cho video TÓM TẮT VIDEO YOUTUBE (pipeline contentta-yt-summary).
Cùng DNA ivory/plum với templates-vertical-ivory của daily-news nhưng motion khác hẳn:
cursor giả, marker gạch tay, typing, sticky note, nét vẽ SVG, camera drift.
KHÔNG dùng lẫn với set daily-news.

## Danh sách

| # | File | Dùng khi | Motion chính | DUR mặc định |
|---|------|----------|--------------|--------------|
| h01 | `h01-title-notebook.html` | mở video, nêu chủ đề | card giấy + tape dán, marker gạch chân vẽ dần | 5.0s |
| h02 | `h02-hook-typing.html` | câu hỏi/hook đầu video | gõ từng cụm từ + caret nháy | 5.5s |
| h03 | `h03-cursor-list.html` | 3-4 ý chính của video | cursor trượt tới từng dòng, click highlight | 7.0s |
| h04 | `h04-video-frame.html` | BỌC ĐOẠN THAO TÁC cắt từ video gốc | khung 16:9 + nhãn + mũi tên doodle | 8.0s |
| h05 | `h05-sticky-steps.html` | các bước làm (2-3 bước) | sticky note rơi vào, xoay lệch | 6.5s |
| h06 | `h06-big-number-circle.html` | 1 con số đắt | số overshoot + nét khoanh tròn tay vẽ | 5.5s |
| h07 | `h07-quote-highlight.html` | trích câu nói đắt trong video | bút dạ quét highlight 2 cụm | 6.0s |
| h08 | `h08-compare-doodle.html` | trước/sau, đổi cách làm | 2 card + mũi tên doodle nối | 6.5s |
| h09 | `h09-zoom-note.html` | nhấn 1 điều phải nhớ | camera drift zoom nhẹ + chú thích Lora | 6.0s |
| h10 | `h10-cta-group.html` | outro CTA xem video gốc | card video + cursor bấm Xem video | 6.0s |
| h11 | `h11-yt-thumb.html` | SCENE 1 giới thiệu video gốc | thumbnail YouTube + tape, cursor bấm play, thanh tiến trình chạy | 6.5s |

Video chuẩn 60-90s dùng 5-7 scene: **h11 mở** (khớp câu "Đây là video nói về…") → thân
(h03/h05/h06/h07/h08 tùy nội dung, h04 tại mỗi đoạn thao tác) → h10 chốt.
Không có thumbnail thì h01 hoặc h02 mở thay. Overshoot mạnh chỉ cho h01/h02/h06.

## h11 — ẢNH THUMBNAIL

Ảnh nằm TRONG scene (khác h04 dùng raw track): `<img src="demo-assets/thumb.jpg">`.
`template-to-scene.mjs` đổi `demo-assets/` thành `assets/media/` nên file thật phải là
`assets/media/thumb.jpg` (server tải sẵn từ `i.ytimg.com` trước khi agent chạy).
`demo-assets/thumb.jpg` trong thư mục này chỉ là ảnh mẫu để preview.
Init của h11 `await img.decode()` trước `__READY` — bỏ bước đó là frame đầu ra ô đen.

## h04 — HÌNH HỌC KHUNG VIDEO (bắt buộc khớp từng pixel)

Scene h04 chỉ vẽ viền + nhãn quanh một Ô TRỐNG trong suốt. Video thao tác là RAW TRACK
(track-index 1, dưới scenes track 2) đặt trong `index.html` với đúng:

```
x=72  y=700  width=936  height=527   (16:9, khớp .vframe trong template)
```

- `<video>` phải là con TRỰC TIẾP của `#root`, KHÔNG có `data-composition-id`
  (chỉ id + src + muted + data-start/data-duration/data-track-index + style position).
- Video 1920x1080 gốc: để nguyên tỉ lệ, scale về 936x527. LUÔN muted — voice TTS đọc xuyên suốt.
- Sửa text `.vlabel` + câu `.point-note .accent` theo nội dung đoạn thao tác.

## Quy tắc (thừa kế 11 rule của set ivory)

1. `.stage` đúng 1080x1920, không đơn vị fluid.
2. Đủ 4 lớp nền đúng thứ tự trước `.content` (khi thành scene sẽ bị strip, ambient-bg lo).
3. Màu CHỈ qua `var(--token)`. Token human bổ sung nằm cuối `base-vertical.css`
   (`--note-*`, `--tape`, `--marker`, `--pencil`).
4. Đúng 3 font: Bricolage Grotesque (display), Be Vietnam Pro (body), Lora italic
   (`.accent`, kiêm luôn vai "chữ viết tay" của set này).
5. MỘT cụm `.accent` Lora italic mỗi khung (chú thích tay `.margin-note`/`.point-note` tính là cụm đó).
6. Emoji = `<img src="../shared/emoji/*.png">`, cấm ký tự emoji.
7. Cấm `Math.random()`, `Date.now()` — độ lệch sticky note là hằng số cố định (`--tilt`).
8. Chữ dưới 24px dùng `--ink-soft`.
9. Idle = GSAP yoyo repeat HỮU HẠN (≤2). Cấm CSS @keyframes.
10. Expose `window.__TL`, `window.__DUR`, `__timelines[<id>]`, `__READY` sau `document.fonts.ready`.
11. Ký hiệu (cursor, mũi tên, dấu nháy, plus/check) vẽ bằng CSS/SVG inline, cấm glyph hệ thống.

Riêng set này:
12. Nét vẽ tay = SVG path inline + tween `strokeDashoffset` (đo `getTotalLength()` rồi `gsap.set`
    dasharray/dashoffset). Stroke màu qua CSS class, KHÔNG qua attribute (var() không chạy trong attr).
13. Highlight bút dạ = `.hl` với biến `--hl-x` 0→1 (GSAP tween CSS var), không override `::before`.
14. Toạ độ cursor đo bằng `getBoundingClientRect()` SAU `document.fonts.ready` (xem h03/h10).
15. **CẤM tự thêm `@font-face` vào scene.** `hyperframes lint` báo `font_family_without_font_face`
    là FALSE POSITIVE (linter không đọc theo `<link>` tới brand-fonts.css). Thêm `@font-face` trỏ
    file woff2 latin mà không kèm `unicode-range` là nó chiếm cả dải Unicode, chữ "ề" vỡ thành
    "ê" + dấu huyền rời trong video render (dính 2026-08-31, mất 1 lần render lại).
16. Font body khai ở `.content` chứ không chỉ `.stage`: `template-to-scene.mjs` BỎ HẲN `.stage`
    khi biến template thành scene, khai ở đó là scene rơi về serif hệ thống.

## Giới hạn ký tự tiếng Việt (đo thật, thừa kế set ivory)

| Slot | Class | Size | Ký tự/dòng |
|------|-------|------|------------|
| Headline XL | `.headline.xl` | 96px | 22 |
| Headline | `.headline` | 76px | 29 |
| Headline sm | `.headline.sm` | 62px | 36 |
| Eyebrow | `.eyebrow` | 26px | 45 |
| Sub | `.sub` | 34px | 64 |
| Card label | `.card-label` | 34px | 48 |
| Row label (h03) | `.row-label` | 34px | 46 |
| Note label (h05) | `.note-label` | 36px | 44 |
| Focus title (h09) | `.focus-title` | 44px | 36 |
| Quote (h07) | `.headline.sm` | 62px | 36 |

Safe zone: content box 936x1320, y 240→1560. Caption strip nằm 1620-1780.

## Preview

```
node render-preview.mjs still h03-cursor-list.html 6.0
node render-preview.mjs clip  h03-cursor-list.html
node render-preview.mjs clip  all
node render-preview.mjs bake     # chỉ khi đổi nền
```

Sau khi sửa template LUÔN render still và ĐỌC file PNG: tràn chữ, dấu tiếng Việt,
độ tương phản, nét vẽ có chạy.

## Thành scene

```
node ../../tools/template-to-scene.mjs <template.html> <out.html> <compId> <duration>
```
Giữ đúng contract parse: có `<style>`, `<div class="stage">…</div>` rồi NGAY `<script src="vendor/gsap.min.js">`,
JS là `<script>(function () { … })();</script>`.
