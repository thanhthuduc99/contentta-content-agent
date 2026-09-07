# Daily Agent Runbook

Mỗi daily run agent đọc file này rồi thực thi tuần tự. KHÔNG hỏi user, KHÔNG mở Studio preview, fail thì commit current state + log lỗi.

**Target video: 55–62 giây.** KHÔNG vượt 65s. Hook 3 giây đầu quyết định tất cả.

---

## Variables

```bash
TODAY=$(TZ=Asia/Ho_Chi_Minh date +%Y-%m-%d)   # vd 2026-06-07 (giờ VN)
SLUG=daily-$(TZ=Asia/Ho_Chi_Minh date +%Y%m%d) # vd daily-20260607
BRANCH=daily/$TODAY                              # vd daily/2026-06-07
PROJECT=video-projects/$SLUG
```

## Step 0 — Chuẩn bị repo + deps

```bash
git checkout -b $BRANCH
npm install --silent --no-audit   # cài luôn ffmpeg-static + gsap (vendored), không cần system ffmpeg
npx hyperframes doctor            # check env: browser
```

- **ffmpeg:** KHÔNG cần `apt-get` — `ffmpeg-static` trong deps, tools tự dò qua `tools/ffmpeg-bin.mjs`. Cho lệnh bash thủ công (extract frame, probe duration) đặt biến: `FFMPEG=$(node -e "console.log(require('ffmpeg-static'))")` rồi dùng `"$FFMPEG"` thay `ffmpeg`. (ffmpeg-static KHÔNG có ffprobe → đọc duration bằng `"$FFMPEG" -i file 2>&1 | grep Duration`.)
- **gsap:** template đã vendor sẵn `assets/vendor/gsap.min.js` (ref local trong mọi scene), KHÔNG phụ thuộc CDN jsdelivr.
- Thiếu browser → `npx hyperframes browser` (hoặc `npx playwright install chromium`). Fail khác → log notes.md + exit theo Error handling.
- **Network:** pipeline chỉ cần `api.openai.com` (TTS+Whisper) + `github.com` (push) + Google Fonts. Nếu OpenAI bị chặn → xem mục Fallback cuối file.

## Step 1 — Scaffold project từ template daily-ivory-vertical

```bash
cp -r contentta-shorts-skill/video-projects/daily-ivory-vertical $PROJECT
cd $PROJECT
rm -rf renders/* assets/voice.* assets/transcript-*.json
rm -f assets/vo-script.txt.example assets/transcript-final.json.example
mkdir -p renders/frames assets/media
```

Scaffold này dùng **hệ màu ivory hiện tại** (nền kem `#FAF6EF`, ink `#17130D`, plum `#4A3AE0`).
Bản Orbital cũ (nền đen, đỏ) đã archive sang `contentta-shorts-skill/_archive-orbital/video-projects/opus-48-daily-khong-face`, không dùng nữa.

Trong `compositions/` chỉ có sẵn `ambient-bg.html` và `grain-overlay.html`.
Scene sinh từ template ở Step 7b.

## Step 2 — Lấy news source

```bash
# YouTube @nateherk RSS → 5 video latest
node ../../tools/fetch-nateherk.mjs > /tmp/yt.json

# GitHub trending weekly + filter AI
node ../../tools/fetch-github-trending.mjs > /tmp/gh.json
```

Nếu Nate có video mới <72h, lấy transcript:

```bash
VID=$(node -e 'const j=require("/tmp/yt.json"); console.log(j.items[0].videoId)')
node ../../tools/fetch-yt-transcript.mjs $VID > /tmp/transcript-yt.txt 2>/dev/null || echo "(no transcript)" > /tmp/transcript-yt.txt
```

## Step 2b — Lấy media thật từ link nguồn

Sau khi chốt topic ở Step 3, chạy tool này trên link chính của topic (repo GitHub, blog post):

```bash
node ../../tools/fetch-media.mjs "<url>" --out assets/media
```

Trả JSON ra stdout, ghi file vào `assets/media/`:
- `shot-viewport.png` — screenshot nguyên khung **16:9** (2560x1440). Template thu nhỏ cho vừa, **không cắt**.
- `shot-full.png` — full page, dùng làm b-roll cuộn.
- `og-image.png` + `images/img-NN.png` — ảnh có sẵn trong trang, thường là ảnh demo trong README.
- `github` trong JSON — sao, fork, ngôn ngữ, license, ngày đẩy code. **Dùng số này, đừng bịa.**

Cần phóng to một khối cụ thể thì thêm `--clip "<css selector>"`.

Lưu ý: `tools/fetch-github-trending.mjs` đang trả `stars_total: null` (regex `octicon-star`
không còn khớp DOM GitHub). Lấy số sao từ `fetch-media.mjs` vì nó đọc qua API GitHub.

## Step 3 — Reason 3 candidates → pick 1

Đọc `/tmp/yt.json`, `/tmp/gh.json`, `/tmp/transcript-yt.txt`. Sinh ra 3 topic candidate, mỗi candidate gồm:

- **Tên topic** (ngắn, kiểu headline)
- **Nguồn** (link YouTube hoặc GitHub repo)
- **Tại sao thú vị** (1 câu — mới mẻ / actionable / kể gọn trong 60s tiếng Việt)

Sau đó reason chọn 1 winner. Tiêu chí ưu tiên:
1. Mới trong tuần (publish/push <7 ngày)
2. Có demo / số liệu cụ thể
3. Dễ kể thành 3-5 ý trong 60s (KHÔNG ép format liệt kê)
4. Khán giả AI builder tiếng Việt thấy hữu ích

Ghi reasoning vào `notes.md` ở repo root (tạo nếu chưa có):

```markdown
# $TODAY

## Candidates
1. [topic A] — nguồn — lý do
2. [topic B] — nguồn — lý do
3. [topic C] — nguồn — lý do

## Winner
[B] vì ...

## Script outline
- Hook: ...
- Change 1: ...
- ...
```

## Step 4 — Viết VO script tiếng Việt (QUAN TRỌNG NHẤT — đầu tư thời gian ở đây)

File: `assets/vo-script.txt`. Mục tiêu **180–210 từ → sau speed-up 1.15x ≈ 55–62 giây**. Đếm từ trước khi chốt. Quá 210 từ → cắt, không thương tiếc.

### Form TÙY BIẾN theo nội dung — KHÔNG có cấu trúc cứng

KHÔNG mặc định "liệt kê 5 thay đổi". Đọc kỹ nguồn rồi chọn form kể chuyện khớp bản chất nội dung:

| Nội dung nguồn | Form phù hợp | Ví dụ skeleton |
|----------------|--------------|----------------|
| 1 sự kiện lớn / tuyên bố shock | **Câu chuyện leo thang**: hook → bối cảnh → twist → ý nghĩa với người xem | "Anthropic vừa thừa nhận điều không ai dám nói..." |
| Tool/repo mới hay | **Demo dẫn dắt**: vấn đề ai cũng gặp → tool giải thế nào → 1 use-case cụ thể → cách thử | "Bạn tốn 2 tiếng mỗi ngày cho việc X? Repo này..." |
| So sánh / thay đổi version | **Trước–Sau**: trước đây thế nào → giờ khác gì → con số chứng minh | "Trước đây 50 bước. Giờ còn 15." |
| Tranh cãi / 2 phe | **Đối lập**: phe A nói gì → phe B nói gì → data nghiêng về đâu | "Một nửa dev nói X chết rồi. Họ sai." |
| Nhiều tin nhỏ cùng chủ đề | **Liệt kê** (chỉ khi thật sự cần): tối đa 3 ý, mỗi ý 1 câu đinh | — |

Số scene đi theo form: **4–6 scene** cho 60s (mỗi scene 8–15s). KHÔNG ép 8 scene.

### Hook — 3 giây đầu (1 câu, ≤15 từ)

Câu đầu PHẢI tạo tension hoặc curiosity. Quy tắc:
- Mở bằng con số shock, mâu thuẫn, hoặc hệ quả trực tiếp với người xem
- KHÔNG mở bằng: "Hôm nay...", "Xin chào...", "Có một tin...", tên công ty + "vừa ra mắt"
- Tốt: "Tám mươi phần trăm code của Anthropic giờ do AI tự viết." / "Cái kỹ năng này giúp Nate Herk tăng tốc gấp mười lần."
- Dở: "Anthropic vừa công bố báo cáo mới về AGI."

### Thuần Việt

- Viết như người Việt kể cho bạn nghe, KHÔNG dịch word-by-word từ tiếng Anh
- Câu ngắn. Chủ động. Không "được cho là", "có thể nói rằng", "một cách đáng kể"
- Thuật ngữ giữ tiếng Anh khi dân AI quen dùng (prompt, token, agent), còn lại dùng từ Việt
- Đọc to thử trong đầu: chỗ nào trúc trắc → viết lại

### CHỈ dùng số liệu CÓ trong nguồn (CQ4)
Số liệu (stars, %, mốc thời gian) PHẢI lấy từ nguồn thật: transcript YouTube hoặc README/description repo (`/tmp/gh.json`, `/tmp/transcript-yt.txt`). **KHÔNG bịa số.** Không chắc → bỏ số, kể định tính. Caption sai số = video mất uy tín.

### Phiên âm tên riêng (CQ2 + CQ3) — 2 FILE SCRIPT

**Quy tắc tổng quát:** với BẤT KỲ tên/từ tiếng Anh nào → viết phiên âm tiếng Việt theo cách đọc trong `vo-script.txt` (cho TTS đọc đúng). Bảng có sẵn:

| Tên thật | Phiên âm (TTS) |
|----------|----------------|
| Claude | Plot |
| Anthropic | Entropic |
| OpenAI | Open AI |
| Contentta | Còn Ten Ta |
| ChatGPT | Chát Gi Pi Ti |
| Gemini | Gemini |
| LLM | Eo Eo Em |
| API | A Pi I |
| GitHub | Gít Hấp |

Tên KHÔNG có trong bảng (tin daily luôn có tên mới): tự phiên âm theo cách đọc — vd Grok→"Grốc", Mistral→"Mít-trô", Perplexity→"Pơ-pléc-xi-ti", headroom→"Hét-rum", Llama→"La-ma". Thà phiên âm hơi sai còn hơn để TTS đọc giọng Anh lạc lõng.

**BẮT BUỘC ghi 2 file (CQ3 — quan trọng nhất):**
- `assets/vo-script.txt` — bản PHIÊN ÂM, cho TTS đọc (vd "Hét-rum vừa nổ 12 nghìn sao trên Gít Hấp")
- `assets/vo-script-display.txt` — bản TÊN THẬT cùng nội dung, cho caption hiển thị (vd "headroom vừa nổ 12 nghìn sao trên GitHub")

Caption phải hiện TÊN THẬT, KHÔNG hiện phiên âm. Cơ chế nối ở Step 7.

## Step 5 — TTS + speed-up

```bash
cd assets
node ../../../tools/tts-openai.mjs   # voice.mp3 (onyx + ffmpeg atempo 1.15)
cd ..
```

Script tự apply **atempo 1.15** sau TTS (deterministic — không phụ thuộc param `speed` của OpenAI). Check duration:

```bash
"$FFMPEG" -i assets/voice.mp3 2>&1 | grep Duration   # hoặc ffprobe nếu có system ffmpeg
```

- **>62s** → tăng tempo: `TTS_TEMPO=1.2 node ../../../tools/tts-openai.mjs` (max 1.25 — quá nữa nghe gấp). Vẫn >65s → quay lại Step 4 CẮT script.
- **<50s** → script hơi ngắn, OK nếu nội dung trọn vẹn; KHÔNG độn từ cho dài.

## Step 6 — Transcribe word-timing

```bash
node ../../tools/transcribe-openai.mjs   # assets/transcript-final.json
```

## Step 7 — Gen caption karaoke (CQ3 + CQ4 — caption phải hiện TÊN THẬT)

Whisper transcribe audio (đọc phiên âm) → lời ra dạng phiên âm ("Hét-rum", "Gít Hấp"). Caption PHẢI map ngược về tên thật.

1. **Tạo `assets/replacements.json`** map phiên âm/Whisper-nghe-sai → tên thật. Đối chiếu `vo-script.txt` (phiên âm) ↔ `vo-script-display.txt` (tên thật) để biết cặp nào. Hỗ trợ cả key nhiều từ:
   ```json
   {
     "Hét-rum": "headroom", "Gít Hấp": "GitHub", "Eo Eo Em": "LLM",
     "A Pi I": "API", "Plot": "Claude", "Entropic": "Anthropic",
     "Còn Ten Ta": "Contentta", "content ta": "Contentta"
   }
   ```
2. **Gen caption với replacements:**
   ```bash
   node ../../contentta-shorts-skill/scripts/generate-captions.mjs \
     assets/transcript-final.json compositions/captions.html assets/replacements.json
   ```
3. **VERIFY (bắt buộc):** grep caption xem còn sót phiên âm không — nếu còn → bổ sung replacements rồi chạy lại:
   ```bash
   grep -oE "Hét-rum|Gít Hấp|Eo Eo Em|A Pi I|Plot|Entropic|Còn Ten Ta" compositions/captions.html && echo "CÒN SÓT PHIÊN ÂM — sửa replacements" || echo "caption tên thật OK"
   ```
4. **Đối chiếu số (CQ4):** đọc `transcript-final.json` so với `vo-script-display.txt` — số liệu trong caption phải khớp nguồn, không sai/bịa.

## Step 8 — Update index.html + scenes

Mở `assets/transcript-final.json` đọc `segments[].start/end` và lấy boundary cho **4–6 scene theo form đã chọn ở Step 4**.

Scene sinh từ bộ template dọc ivory trong `../../templates-vertical-ivory/`
(10 cái, bảng chọn trong `README.md` ở đó). Mỗi scene một lệnh:

```bash
node ../../../tools/template-to-scene.mjs   ../../templates-vertical-ivory/v01-title-card.html   compositions/scene1-title.html s1-title 6.04
```

Tool tự bỏ 4 lớp nền (ambient-bg lo), scope CSS và selector GSAP theo composition id,
nhúng font + `base-vertical.css` vào từng scene, đổi đường dẫn asset sang `assets/`.

Sau khi sinh, **sửa nội dung và canh lại timing ngay trong file scene**:
- Text khớp ĐÚNG lời đang nói trong khoảng đó, giữ đúng giới hạn ký tự trong README template.
- Scene nhiều mục (v03 grid, v06 workflow, v11 before-after): canh thời điểm từng mục
  theo mốc giọng nói trong `transcript-final.json`. Đừng để stagger mặc định chạy hết
  trong 1,5 giây rồi ngồi im 15 giây.
- Ảnh thật trỏ vào `assets/media/` lấy từ Step 2b.
- `data-start` + `data-duration` trên scene container trong `index.html` khớp segment boundary.

Template là gợi ý. Nội dung không khớp cái nào thì tự dựng scene mới theo luật cứng
trong `templates-vertical-ivory/README.md`.

**Chống chồng lấn clip:** trừ 0.02 vào `data-duration` của mọi scene trừ scene cuối,
nếu không lint báo `overlapping_clips_same_track` do sai số float.

KHÔNG đụng face-wrapper (no-face mode — không có face).
KHÔNG đụng ambient-bg, grain-overlay, music track (giữ nguyên).
Music track ở `index.html` point vào `assets/music.mp3`. Repo KHÔNG kèm file nhạc (bản quyền) — tự bỏ nhạc của bạn vào `contentta-shorts-skill/music/` rồi copy sang:

```bash
[ -f assets/music.mp3 ] || cp ../../contentta-shorts-skill/music/*.mp3 assets/music.mp3
```

Thiếu nhạc thì video vẫn render được, chỉ không có nhạc nền. Yêu cầu định dạng xem `contentta-shorts-skill/music/README.md`.

Update tổng `data-duration` của root composition trong `index.html` = `Math.ceil(transcript.duration) + 1`.

## Step 9 — Lint + render

```bash
npx hyperframes lint                                             # phải 0 error
npx hyperframes render --quality standard --output renders/final.mp4
```

Nếu lint fail vì idle animation dùng `gsap.to(..., { repeat: -1 })` → chuyển sang CSS `@keyframes` trong scene HTML (xem rule 8 trong `contentta-shorts-skill/CLAUDE.md`).

## Step 10 — Verify lightweight

```bash
for t in 5 20 40 55; do
  "$FFMPEG" -y -ss $t -i renders/final.mp4 -frames:v 1 -q:v 3 renders/frames/t$t.jpg 2>/dev/null
done
```

Read 1 frame (vd `renders/frames/t20.jpg`) verify: brand Contentta đúng (Cosmic Red emphasis, Stardust text, Deep Space bg), caption sync với lời nói tại t=20s, KHÔNG face wrapper, không overflow.

Sai nghiêm trọng → log vào `notes.md` rồi vẫn tiếp tục commit.

## Step 11 — Commit + push

```bash
cd ../..
git add $PROJECT/ notes.md
git commit -m "daily $TODAY: <winner topic ngắn gọn>"
git push -u origin $BRANCH
```

## Error handling

Bất kỳ step fail nghiêm trọng:

```bash
echo "[$(date -u +%H:%M:%S)] FAIL at step X: <error>" >> notes.md
git add -A
git commit -m "daily $TODAY: FAIL at step X" || true
git push -u origin $BRANCH || true
```

KHÔNG retry vô hạn. KHÔNG hỏi user. Push state hiện tại lên branch để user pull về xem.

## Fallback khi api.openai.com bị chặn (network policy chưa mở)

Nếu Step 5 TTS hoặc Step 6 Whisper bị `403 Host not in allowlist`:
- **KHÔNG** thử edge-tts/gTTS/Gemini — proxy SSL-intercept, đều fail (đã verify 2026-06-06). Gemini quota cũng cạn.
- Đây là blocker hạ tầng, KHÔNG sửa được trong session. Ghi rõ vào `notes.md`:
  ```
  TTS/Whisper FAIL: api.openai.com bị network policy chặn (403).
  Cần user mở: env settings → Network → Custom → thêm api.openai.com.
  ```
- Vẫn build tiếp để có bản nháp xem được: tạo silent placeholder + caption từ char-estimation:
  ```bash
  DUR=60
  "$FFMPEG" -y -f lavfi -i anullsrc=r=44100:cl=mono -t $DUR -c:a libmp3lame assets/voice.mp3
  ```
  Dùng `assets/vo-script-display.txt` chia segment theo số ký tự để ước lượng `transcript-final.json`, gen caption như Step 7. Video sẽ có nhạc + caption + motion, KHÔNG có giọng.
- Commit + push branch + ghi notes rõ "cần rerun sau khi mở network". KHÔNG coi đây là thành công.
