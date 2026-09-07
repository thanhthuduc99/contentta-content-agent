# Template dọc ivory — daily news

Khung cố định **1080x1920**, hệ màu Contentta hiện tại (ivory sáng), **no-face**, mỗi template tự chứa một GSAP timeline.

Nguồn sự thật về hình: `base-vertical.css`.
Nguồn sự thật về brand: `D:\thanh\Obsidian\thanh\Business\Contentta\_context\INFRASTRUCTURE\Contentta Design System`.

Bộ ngang 1920x1080 nằm ở project `edit motion graphics`. Hai bộ dùng chung token màu, khác khung và type scale.

## 10 template

| # | File | Dùng khi | Dài |
|---|---|---|---|
| 01 | `v01-title-card.html` | Mở video, mở chương mới | 5,0s |
| 02 | `v02-hook-statement.html` | Câu tuyên bố mạnh, câu hỏi mở | 5,5s |
| 03 | `v03-grid-cards.html` | Liệt kê 3-4 ý ngang hàng, xếp 1 cột | 6,0s |
| 06 | `v06-workflow.html` | Pipeline 3-5 bước, mũi tên đi xuống | 6,5s |
| 07 | `v07-big-number.html` | Một con số cần đóng đinh | 5,5s |
| 09 | `v09-screenshot-callout.html` | Chỉ vào ảnh thật lấy từ link | 6,0s |
| 10 | `v10-terminal-code.html` | Demo lệnh, YAML, cấu hình | 6,5s |
| 11 | `v11-before-after.html` | Đối chiếu trước và sau | 6,5s |
| 13 | `v13-cta-outro.html` | Chốt cuối video | 5,0s |
| 14 | `v14-media-slideshow.html` | 2-3 ảnh thật trượt nối tiếp | 8,0s |
| 15 | `v15-follow-comment.html` | CTA "Comment X", cursor demo bấm nút Follow (không có ô comment) | 4,2s |

Bỏ 04, 05, 12 của bộ ngang vì cả ba đều cần mặt người. Bỏ luôn lower-third overlay: daily news không có footage nền để đè lên.

Template là gợi ý, không phải khuôn cứng. Lúc dựng video cứ đổi bố cục theo nội dung, miễn giữ đúng luật cứng bên dưới.

## Luật cứng

1. `.stage` luôn đúng 1080x1920. Không dùng đơn vị co giãn cho khung.
2. Đủ 4 lớp nền, đúng thứ tự, trước `.content`: `.bg-orbs` (4 span o1..o4) → `.bg-dots` → `.bg-floor` → `.bg-grain`.
3. Màu chỉ lấy qua `var(--token)`. Cần màu mới thì thêm token vào `base-vertical.css`.
4. Chỉ 3 font: Bricolage Grotesque (display 700-800), Be Vietnam Pro (body 400-600), Lora italic (1-2 từ nhấn).
5. Một khung chỉ có **một** cụm `.accent` Lora italic.
6. Emoji phải là `<img>` trỏ `../shared/emoji/*.png`. Không viết ký tự emoji trong HTML.
7. Không `Math.random()`, không `Date.now()`.
8. Chữ dưới 24px dùng `--ink-soft`, không dùng `--ink-muted`.
9. Idle animation dùng GSAP yoyo **hữu hạn** (`repeat: 2`), không `repeat: -1`, không CSS `@keyframes`. Lý do: renderer seek theo `__TL.time(t)`, CSS animation chạy theo đồng hồ thật nên không deterministic.
10. Mỗi file phải expose `window.__TL`, `window.__DUR`, và set `window.__READY = true` sau `document.fonts.ready`.
11. Không viết ký tự phải mượn font hệ thống để vẽ (emoji, dấu tick, mũi tên box-drawing). Máy khác render khác. Emoji thì dùng PNG, ký hiệu thì dùng ASCII hoặc vẽ bằng CSS.

## Motion

Theo DS `tokens/motion.css`: chỉ animate transform + opacity, ease `cubic-bezier(.22,1,.36,1)`, 0.25-0.9s, stagger 0.08.

Ngoại lệ được phép overshoot mạnh cho hook 3 giây đầu: **v01, v02, v07**.

## Giới hạn ký tự tiếng Việt

Đo thật bằng `measureText` với chuỗi tiếng Việt có dấu, font đã vendor. Không ước lượng.

| Slot | Class | Size | Khung | Ký tự/dòng |
|---|---|---|---|---|
| Headline lớn | `.headline.xl` | 96px | 936 | **22** |
| Headline thường | `.headline` | 76px | 936 | **29** |
| Headline nhỏ | `.headline.sm` | 62px | 936 | **36** |
| Eyebrow pill | `.eyebrow` | 26px | 936 | **45** |
| Sub | `.sub` | 34px | 936 | **64** |
| Card label | `.card-label` | 34px | 732 | **48** |
| Card note | `.card-note` | 26px | 732 | **66** |
| Callout | `.callout` | 30px | 820 | **62** |
| Result pill | `.result` | 44px | 848 | **45** |
| Code | `.term pre` | 28px mono | 868 | **56 cột** |

Card label/note ở bản dọc rộng gấp đôi bản ngang vì card xếp 1 cột chứ không phải 4 cái cạnh nhau.

## Safe zone

Content box thật dùng: **936 x 1320**, tương ứng y 240 đến 1560.

- Trên 240px: chừa UI platform và username.
- Dưới 360px: caption strip nằm y 1620-1780, cộng nút tương tác TikTok/Shorts ở góc phải dưới.
- `.bg-floor` cao 360px, đã hạ so với bản ngang (520px) để không đụng caption.

## Ảnh thật

Lấy bằng `node ../../tools/fetch-media.mjs <url> --out <dir>`.

Mặc định tool chụp nguyên khung **16:9** (viewport 1280x720, deviceScaleFactor 2, ra 2560x1440), template thu nhỏ cho vừa chứ **không cắt**.

Đánh đổi: chữ trong ảnh sẽ nhỏ. Bù bằng cách để `.callout` và typography của mình gánh thông tin, đừng bắt người xem đọc chữ trong screenshot.

Cần phóng to một khối cụ thể thì truyền `--clip "<selector>"`, tool sẽ chụp riêng element đó. Nguồn càng hẹp thì phóng ra càng to.

Ảnh nền trắng đặt trên nền kem `#FAF6EF` sẽ đá nhau. Xử lý bằng `.shot` + `.shot-bar` ivory-deep + `shadow-lift` + viền trong `inset 0 0 0 1px rgba(23,19,13,.10)`.

Callout ở khung dọc phải straddle **mép trên/dưới** của ảnh, lệch trái và lệch phải. Khung dọc chỉ 1080px bề ngang, chip đặt hai bên cạnh sẽ đè chữ trong ảnh hoặc tràn mép khung.

## Render preview

```bash
node render-preview.mjs bake                        # sinh bg-vertical.png, chạy lại khi đổi nền
node render-preview.mjs still v01-title-card.html 3 # 1 frame tại giây thứ 3
node render-preview.mjs clip  v01-title-card.html   # 1 clip mp4
node render-preview.mjs clip  all                   # tất cả template
```

Lúc quay clip, script tráo 4 lớp nền bằng `bg-vertical.png` đã bake. Nền tĩnh nên không mất gì, mà nhanh hơn nhiều.

Xem kết quả: mở `gallery.html` bằng trình duyệt.
