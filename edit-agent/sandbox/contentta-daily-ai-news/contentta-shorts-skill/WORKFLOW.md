# WORKFLOW — edit video ngắn dọc (10 bước)

Quy trình chuẩn cho shorts vertical 1080×1920 có mặt người. Output: `renders/final.mp4` (captions baked-in). KHÔNG FCPXML/CapCut. Đọc rule ở `CLAUDE.md` trước.

Inputs: 1 video raw talking-head (ngang). Tuỳ chọn: style prompt (cosmic / editorial / trộn), nhạc nền.

> **Biến thể** (chi tiết `CLAUDE.md` §3b):
> - **No-face (TTS)** — không có video người quay. **Bỏ B2–B5**, thay bằng: viết `vo-script.txt` → OpenAI TTS `gpt-4o-mini-tts` (`tts.mjs`) → `voice.mp3` → re-transcribe (`transcribe.mjs`) → B6 caption. Track không có face. Mẫu: `video-projects/daily-ivory-vertical` (hệ ivory hiện tại).
>   **Daily news run → đọc `AGENT-RUNBOOK.md` ở repo root thay vì file này** (60s, 180–210 từ, form tùy biến).
> - **Landscape 1920×1080** — `meta.json` 1920×1080; face full-frame + dock phải (animate width/height); không track ambient/grain/captions. Mẫu: `video-projects/intro-google-io-ngang`.

---

## B1 — Scaffold
```bash
slug="<kebab-name>"
mkdir -p video-projects/$slug/{assets,compositions,renders}
cp video-projects/_template/{meta.json,hyperframes.json} video-projects/$slug/   # sửa name trong meta
cp assets/brand-tokens.contentta.css video-projects/$slug/assets/
cp templates/{ambient-bg.html,grain-overlay.html} video-projects/$slug/compositions/
ffmpeg -y -i "<raw>" -c copy video-projects/$slug/assets/source.mp4   # remux nếu đã H.264, else re-encode
```

## B2 — Tách audio + transcribe (OpenAI Whisper API)
```bash
cd video-projects/$slug
ffmpeg -y -i assets/source.mp4 -vn -ac 1 -ar 16000 -b:a 64k assets/audio.mp3
KEY=$(grep '^OPENAI_API_KEY=' ../../.env | sed 's/^OPENAI_API_KEY=//' | tr -d '"' | tr -d '\r')
curl -s https://api.openai.com/v1/audio/transcriptions -H "Authorization: Bearer $KEY" \
  -F file=@assets/audio.mp3 -F model=whisper-1 -F response_format=verbose_json \
  -F "timestamp_granularities[]=word" -F "timestamp_granularities[]=segment" -o assets/transcript-raw.json
```

## B3 — Tìm chỗ vấp
```bash
node ../../scripts/analyze-transcript.mjs assets/transcript-raw.json
ffmpeg -i assets/audio.mp3 -af silencedetect=noise=-32dB:d=0.4 -f null - 2>&1 | grep silence_
```
Chốt các đoạn GIỮ (bỏ lead-in, dead-air, false-start, đoạn ấp úng). Source gốc giữ nguyên.

## B4 — Cắt + speed 1.1x → face-final.mp4
Dùng template ffmpeg `trim+concat + setpts/1.1 + atempo=1.1` (xem `scripts/README.md` §3). Output `assets/face-final.mp4`.

## B5 — Re-transcribe bản cut
Lặp B2 trên `assets/face-final.mp4` → `assets/transcript-final.json` (timeline mới cho caption + mốc reveal scene).

## B6 — Sinh caption
```bash
# (tuỳ chọn) tạo assets/replacements.json sửa lỗi Whisper, vd {"ComCore":"Claude"}
node ../../scripts/generate-captions.mjs assets/transcript-final.json compositions/captions.html assets/replacements.json
```

## B7 — Plan + build scenes
- Đọc `transcript-final.json` (segments), chia 4–7 scene theo ý. Chọn template từ `templates-vertical-ivory/` (bảng chọn trong `templates-vertical-ivory/README.md`).
- Sinh scene: `node ../../tools/template-to-scene.mjs ../../templates-vertical-ivory/vNN-*.html compositions/sceneN-*.html <id> <dur>`. Tool tự scope CSS, bỏ 4 lớp nền, nhúng font + `base-vertical.css`.
- Sửa text + **mốc reveal khớp timestamp** lời nói. Giữ đúng giới hạn ký tự tiếng Việt trong README template.
- Bộ pattern cosmic/editorial cũ đã archive ở `_archive-orbital/templates/scene-patterns/`, không dùng.
- Viết `index.html`: face-wrapper BOTTOM + Ken Burns + seam; các scene track 2 (shave 0.02 tránh overlap); `captions` track 3; `face-audio` track 4; `music` track 5 (vol 0.14–0.15); `grain` track 99. Load đủ 4 font ở `<head>`.
- Nếu là "video giới thiệu youtube" → thêm `youtube-outro` 3s cuối, extend ambient/music/grain +3s (face/captions giữ nguyên).

## B8 — Lint + preview
```bash
npx hyperframes lint        # phải 0 error (idle dùng CSS keyframes, không gsap repeat:-1)
npx hyperframes preview     # localhost:3002 — hand URL cho Nate duyệt live (gate)
```

## B9 — Render draft + visual-verify (BẮT BUỘC)
```bash
npx hyperframes render --quality draft --output renders/draft.mp4
mkdir -p renders/frames
for t in <hero-time mỗi scene>; do ffmpeg -y -ss $t -i renders/draft.mp4 -frames:v 1 -q:v 3 renders/frames/t$t.jpg; done
```
**Read từng PNG** verify: mặt không crop, caption sync, brand đúng, không va dấu, jump-cut được che. Sai → sửa → lặp.

## B10 — Render final
```bash
npx hyperframes render --quality standard --output renders/final.mp4
```
Trả path `renders/final.mp4`. (Serve xem: `npx serve renders -p 8080 -n`.)

---

## Map nội dung → pattern (gợi ý)
- Mở đầu / liệt kê nhiều ý → `slideshow`
- Bước hướng dẫn → `step-badge` (BƯỚC N)
- Liệt kê sản phẩm/tính năng → `card-cascade`
- Nhấn 1 con số → `big-number-reveal` (cosmic) / `editorial-stat` (%)
- Quy trình → `step-flow`
- 2 câu hỏi / đối lập → `editorial-questions`
- Chốt quan điểm → `editorial-headline`
- CTA cuối → `cta-supernova` (hiện sớm ~1s)
- Giới thiệu YouTube → `youtube-outro`
