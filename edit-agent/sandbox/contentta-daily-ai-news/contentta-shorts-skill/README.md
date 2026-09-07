# Contentta Shorts Skill — Video Ngắn AI

Skill edit video ngắn vertical (1080×1920) với Claude Code + HyperFrames.
Input video talking-head landscape → **cắt đoạn vấp** (OpenAI Whisper) → **speed 1.1x** → output MP4 vertical shorts với motion graphics (cosmic / editorial) + karaoke caption + nhạc nền. Captions baked-in, KHÔNG FCPXML.

> AI đọc `CLAUDE.md` (rule) + `WORKFLOW.md` (10 bước) + `scripts/README.md` (cắt vấp + gen caption).

## Yêu cầu hệ thống

- **Node.js** ≥ 18
- **FFmpeg** (có trong PATH)
- **Chrome / Chromium** (cho headless render)
- **Claude Code CLI** (phiên bản mới nhất)

## Cài đặt (3 bước)

### 1. Cài dependencies

```bash
npm install
npx skills add heygen-com/hyperframes --yes
```

### 2. Cài OpenAI API key (cho Whisper transcribe)

```bash
cp .env.example .env
```

Mở `.env`, paste API key:

```
OPENAI_API_KEY=sk-...your-key-here
```

Lấy key tại: https://platform.openai.com/api-keys

### 3. Kiểm tra

```bash
npx hyperframes doctor
```

Nếu tất cả check pass → sẵn sàng sử dụng.

## Thay đổi brand visual

Mặc định skill dùng brand **Contentta v2026.05 Orbital** (Cosmic Red + Deep Space + Stardust).

Để đổi brand:

1. Mở `assets/brand-tokens.contentta.css`
2. Đổi CSS vars: `--cosmic-red`, `--deep-space`, `--stardust`, `--font-display`, `--font-body`
3. Đọc `assets/brand-visual-guide.md` cho chi tiết palette + font pairing
4. Load font mới qua Google Fonts link trong composition `<head>`
5. Test: `npx hyperframes preview` xem màu/font render đúng chưa

## Thêm nhạc nền

Bỏ file `.mp3` hoặc `.wav` vào folder `music/`.
Claude sẽ tự chọn nhạc phù hợp khi edit video.

Yêu cầu:
- Format: MP3 hoặc WAV
- Thời lượng: 30-90s (tự trim theo video)
- Loại: instrumental, không lời
- Volume: 0.12-0.18 (Claude tự set)

## Sử dụng

### Edit từ video talking-head

1. Copy video (.mp4/.mkv) vào `video-projects/<tên-project>/assets/`
2. Mở Claude Code trong folder này
3. Nói: **"edit video ngắn từ file này"**
4. Claude sẽ: transcribe (Whisper) → **cắt đoạn vấp** → **1.1x** → re-transcribe → sinh caption → plan & build scenes (cosmic/editorial) → lint → preview → render draft + **visual-verify** → final
5. Câu lệnh đặc biệt: **"edit video ngắn giới thiệu youtube"** → tự chèn outro 3s "XEM CHI TIẾT Ở KÊNH YOUTUBE" + "Channel: Thành Vũ Đức". **"edit video ngang"** → 1920×1080.

### Helper scripts (portable)
```bash
node scripts/analyze-transcript.mjs transcript.json                       # tìm chỗ vấp
node scripts/generate-captions.mjs transcript-final.json out.html [rep.json]  # karaoke caption
```

## Output

- `renders/final.mp4` — video vertical 1080×1920, baked caption + motion graphics + music

## Ví dụ tham chiếu

Mẫu ngắn trong `examples/`:
- **may-shorts-sample-contentta** — Motion graphics only (16s, 4 scene, không face)
- **bai-giang-shorts** — Tutorial n8n (30s, face + SVG card cascade + step flow)
- **demo-gioi-thieu-shorts** — Self-intro (20s, face + music + full-canvas intro)

Project mẫu đầy đủ trong `video-projects/` (mỗi cái = 1 chế độ sản xuất, xem `CLAUDE.md` §3b):
- **claude-intro-doc** — Face dọc, giọng thu thật, 7 bước (74s) · chế độ **mặc định**
- **opus-48-daily-khong-face** — **No-face dọc + giọng TTS** (88s, bản tin AI). Có sẵn `assets/{tts.mjs,vo-script.txt,transcribe.mjs,replacements.json}` làm mẫu pipeline TTS
- **intro-google-io-ngang** — **Landscape 1920×1080** YouTube intro (46.5s), face FULL ↔ dock phải

## Cấu trúc folder

```
contentta-shorts-skill/
├── CLAUDE.md          ← AI đọc file này (rule + kiến trúc + scene patterns)
├── WORKFLOW.md        ← Quy trình 10 bước (có lệnh ffmpeg/curl)
├── MOTION_PHILOSOPHY.md ← Gu thẩm mỹ (phần T1–T5 là legacy, bỏ qua)
├── README.md          ← File bạn đang đọc
├── .env.example       ← Mẫu OPENAI_API_KEY (Whisper cắt vấp)
├── .claude/           ← Claude Code settings (whitelist curl/node/ffmpeg)
├── scripts/           ← generate-captions.mjs + analyze-transcript.mjs (+README)
├── assets/            ← Brand tokens + guide
├── music/             ← Bỏ nhạc nền vào đây (vol 0.14–0.15)
├── templates-vertical-ivory/ ← 10 template dọc 1080×1920 hệ ivory (ĐANG DÙNG)
├── templates/
│   ├── grain-overlay.html    ← lớp grain track 99 (neutral)
│   └── face-wrapper-pattern.md ← toán vị trí mặt cho mode có face
├── _archive-orbital/     ← bộ cosmic/editorial cũ + project Orbital cũ (KHÔNG dùng)
├── examples/          ← 3 mẫu ngắn (16–30s)
└── video-projects/    ← Project mẫu đầy đủ + tạo project mới (_template/ là scaffold)
    ├── daily-ivory-vertical/     ← scaffold no-face + TTS hệ ivory (ĐANG DÙNG)
    └── dn-ivory-test/            ← project ivory đã render, dùng đối chiếu
```
