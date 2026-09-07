
# 2026-08-26

## Topic (user chỉ định, không qua vòng chọn candidate)
obra/superpowers — https://github.com/obra/superpowers

## Số liệu nguồn (GitHub API, không bịa)
- 277.637 sao, 24.831 fork
- Ngôn ngữ Shell, giấy phép MIT
- Tạo 2025-10-09, push gần nhất 2026-08-19
- 14 skill (đếm từ mục "What's Inside" trong README)
- Lệnh cài: /plugin install superpowers@claude-plugins-official

## Form kể chuyện
Demo dẫn dắt: vấn đề ai cũng gặp → tool chặn ở đâu → quy trình → luật cứng → cách cài.

## Script outline
- Hook: 277.637 sao cho một bộ file hướng dẫn
- Vấn đề: bảo agent làm tính năng, nó gõ code luôn
- Superpowers dừng lại, hỏi ngược
- Quy trình 4 bước: spec → plan 2-5 phút/task → subagent → review 2 vòng
- Luật cứng: test viết trước, code viết trước test thì xóa
- 14 skill, tự kích hoạt, chạy trên nhiều harness

## Ghi chú kỹ thuật
- TTS lần 1 nuốt mất câu CTA cuối (đứng riêng một đoạn ngắn). Gộp CTA vào câu
  trước rồi gen lại thì đọc đủ. Duration 59.71s.
- Scaffold `contentta-shorts-skill/video-projects/daily-ivory-vertical` THIẾU block
  đăng ký `window.__timelines` trong ambient-bg.html và grain-overlay.html
  → lint fail 2 error. Project tham chiếu dn-ivory-test có block này.
  Đã vá thủ công trong project. NÊN vá luôn vào scaffold.
- Autostart .cmd/.vbs của app trỏ path cũ D:\thanh\CONTENTTA AGENCY\... sau khi
  chuyển repo vào vault. Đã đổi sang %~dp0 để khỏi gãy lần sau.

---

# 2026-08-30 — archify (theo yêu cầu user, không auto-pick)

## Topic
https://github.com/tt-a1i/archify — agent skill dựng sơ đồ kiến trúc/workflow
thành HTML tự chứa, có motion + export PNG/SVG/WebM.

## Số liệu thật (fetch-media.mjs, API GitHub)
32.444 sao · 2.035 fork · JavaScript · MIT · push code 2026-08-30 · v2.16

## Form kể chuyện
Demo dẫn dắt: con số shock → nó là gì → vẽ được gì → điểm khác biệt (tự kiểm)
→ bằng chứng thật → cách cài.

## Script outline
- Hook: 32.444 sao cho một công cụ chỉ để vẽ sơ đồ
- Tả hệ thống bằng lời, agent tự dựng
- 5 loại: kiến trúc / quy trình / luồng dữ liệu / chuỗi gọi / vòng đời
- Điểm hay nhất không phải đẹp, là nó TỰ KIỂM (9 bài kiểm tra bố cục)
- Bắt: đường cắt nhau, chữ tràn khung, nhãn đè đường kẻ → báo đúng chỗ, bắt sửa
- Bằng chứng: tự dựng thử 1 sơ đồ quy trình, 9/9 không lỗi
- Cài 1 dòng npx, chạy trong Claude Code/Cursor/Codex, MIT

## Ghi chú kỹ thuật
- Ảnh scene 6 KHÔNG lấy từ repo mà là sơ đồ tự dựng bằng chính archify
  (daily-news-pipeline.html chụp 1280x720) — khớp đúng lời VO "mình vừa thử dựng".
- TTS: tempo mặc định 0.95 cho ra 77.6s (quá 65s). Cắt script 194 -> 177 từ,
  bỏ các từ viết tắt đánh vần (HTML/JSON/PNG/SVG/WebM/API/npx) vì tốn thời gian đọc,
  chạy lại TTS_TEMPO=1.05 -> 61.46s. Đạt khung 55-62s.
- Whisper nghe sai nhiều tên riêng, replacements.json phải map theo ĐÚNG token
  (vd "3 2 nhìn" -> "32 nghìn", "at key file" -> "archify", "Plot Code" -> "Claude Code").
- template-to-scene sinh selector lồng sai trong JS của v06-workflow:
  n.querySelector('[data-composition-id="..."] .sq') không bao giờ match
  (attribute nằm ở tổ tiên, không nằm trong node). Đã sửa thành n.querySelector('.sq').
  NÊN vá luôn trong tool hoặc template.
- Lint: 0 error, 110 warning (đều là composition_self_attribute_selector do
  template-to-scene, giống các project trước).

## Kết quả render
final.mp4 · 9.5 MB · 1080x1920 · 30fps · 62.42s · render 3m50s · lint 0 error.
Verify frame t3/t20/t44/t51/t59: số liệu đúng, caption sync, card stagger canh
đúng mốc giọng, không tràn khung, không face wrapper.
Chưa commit/push (chờ user duyệt).

---

# 2026-08-30 (chiều) — microduck, chạy tiếp job dn-1788083811716

## Topic
https://github.com/pollen-robotics/microduck — robot vịt biped hai chân, mã nguồn mở.
Keyword comment: microduck.

## Vì sao job này dở dang
Agent headless chết ở giữa Step 8 với `api_error_status 429`
("You've hit your session limit · resets 8:40pm"), sau 37 turn, $3.119.
Lúc chết đã xong: TTS (voice.mp3 53.69s), transcript-final.json, captions.html,
scene 1-3 viết nội dung thật. CHƯA xong: scene 4-6, index.html, render.

## Bẫy: scene 4-6 lint PASS nhưng nội dung SAI
`template-to-scene.mjs` sinh scene kèm nguyên nội dung mẫu của repo khác.
Scene 4/5/6 lúc đó vẫn là "Context database cho AI agent", "32.227 sao · 2.461 fork
· AGPL-3.0", "Comment X", panel before/after nói về skill/token.
Lint 0 error, render vẫn ra MP4 bình thường. Chỉ đọc text từng scene mới bắt được.
=> Trước khi render, luôn dump text scene và đối chiếu với vo-script.

## Số liệu thật (GitHub API, fetch lúc 18:00)
2.698 sao · 314 fork · Rust · Apache-2.0 · 642 commit · 24 release · 3 contributor
· tạo 2026-07-29 · push 2026-08-30. Homepage pollen-robotics.com/microduck.

## Đã làm để chạy tiếp
- `assets/media/gh-repo-169.png`: scene 4 trỏ tới file chưa tồn tại. Ảnh
  `shot-viewport.png` sẵn có đã đúng 2560x1440 (16:9) nên copy sang tên đó.
- Scene 1: cập nhật 2.628 -> 2.698 sao, 300 -> 314 fork.
- Scene 4: viết lại cho microduck (642 commit, 24 bản phát hành, 2.698 sao).
  Dời callout 1.16/1.62/2.20 -> 3.30/4.60/6.20 để khớp lúc VO đọc số.
- Scene 5: đổi trục before/after thành "Robot thường đóng kín" vs "microduck mở".
  Dời panel 0.46/1.58 -> 4.40/7.55 bám segment 41.30 và 44.88.
- Scene 6: "Comment X" -> "Comment microduck", gõ 9 ký tự thay 1, caret tắt 4.75 -> 4.92.
- index.html dựng mới, scene boundary lấy từ segments[].start:
  0 / 7.02 / 15.66 / 28.06 / 36.58 / 48.28, tổng 55.28. Trừ 0.02 duration mọi scene
  trừ scene cuối theo luật chống chồng lấn.
- Không nhạc nền, khớp convention 2 project gần nhất (chỉ track voice).

## Kết quả render
final.mp4 · 10.8 MB · 1080x1920 · 30fps · 55.32s · render 3m04s · lint 0 error,
100 warning (đều là composition_self_attribute_selector của template-to-scene).
Verify frame t3/t20/t32/t42/t51: số liệu đúng, caption karaoke sync đúng lời,
không tràn khung. Chưa commit/push (chờ user duyệt).

## Còn tồn
- Scene 1 sub vẫn ghi "robot vịt biped tí hon". "biped" là từ Anh lạc trong câu
  Việt, VO đọc là "hai chân". Sửa thì phải render lại 3 phút, chưa sửa.
- generate-captions.mjs: mọi segment đều có khe trống giữa hideAt và fadeInAt của
  segment sau (dài nhất 0.77s). Phần lớn trùng chỗ VO ngắt hơi nên không thấy,
  nhưng chỗ nói liền (vd 41.98 -> 42.02) tạo 1 frame mất caption.
