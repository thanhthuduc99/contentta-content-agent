# scripts/ — helper portable cho pipeline shorts

Node thuần (≥18, không cần npm install). Dùng cho 2 việc cốt lõi: **cắt đoạn vấp** và **sinh karaoke caption**.

---

## 1. Transcribe — OpenAI Whisper API (trực tiếp)

Cần `OPENAI_API_KEY` trong `.env`. Tách audio rồi gọi API (word + segment timestamps):

```bash
# Tách audio nhẹ (mono 16k mp3 < 25MB)
ffmpeg -y -i source.mp4 -vn -ac 1 -ar 16000 -b:a 64k audio.mp3

# Transcribe
KEY=$(grep '^OPENAI_API_KEY=' .env | sed 's/^OPENAI_API_KEY=//' | tr -d '"' | tr -d '\r')
curl -s https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $KEY" \
  -F file=@audio.mp3 -F model=whisper-1 \
  -F response_format=verbose_json \
  -F "timestamp_granularities[]=word" -F "timestamp_granularities[]=segment" \
  -o transcript.json
```

## 2. Tìm chỗ vấp để cắt

```bash
node scripts/analyze-transcript.mjs transcript.json
# + đối chiếu khoảng lặng trong audio:
ffmpeg -i audio.mp3 -af silencedetect=noise=-32dB:d=0.4 -f null - 2>&1 | grep silence_
```
Cắt bỏ: lead-in im lặng đầu, **dead-air** (gap dài), **false-start** (lặp từ / "à ờ"), **đoạn ấp úng** (HOLD — Whisper gán 1 từ kéo dài nhiều giây = nói xong rồi khựng).

## 3. Cắt + tăng tốc 1.1x (1 pass)

Giữ các đoạn sạch `[A_start..A_end]`, `[B_start..B_end]`... rồi nối + speed 1.1x:

```bash
ffmpeg -y -i source.mp4 -filter_complex "\
[0:v]trim=A_start:A_end,setpts=PTS-STARTPTS[v0];\
[0:a]atrim=A_start:A_end,asetpts=PTS-STARTPTS[a0];\
[0:v]trim=B_start:B_end,setpts=PTS-STARTPTS[v1];\
[0:a]atrim=B_start:B_end,asetpts=PTS-STARTPTS[a1];\
[v0][v1]concat=n=2:v=1:a=0[vc];\
[a0][a1]concat=n=2:v=0:a=1[ac];\
[vc]setpts=PTS/1.1[v];[ac]atempo=1.1[a]" \
-map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 192k -movflags +faststart face-final.mp4
```
> 1 đoạn thì bỏ phần `[B...]` + `concat`, dùng thẳng `setpts/1.1` + `atempo=1.1`.

Sau đó **re-transcribe `face-final.mp4`** (lặp bước 1) để lấy timeline mới cho caption.

## 4. Sinh caption karaoke

```bash
node scripts/generate-captions.mjs transcript-final.json compositions/captions.html [replacements.json]
```
- Chunk **theo từng câu Whisper** (không gộp xuyên câu), gộp từ lẻ cuối câu vào dòng trước.
- `replacements.json` (tuỳ chọn) sửa lỗi Whisper, vd: `{"ComCore":"Claude","CloudCode":"Claude","ReMotion":"Remotion"}`
- Output: trắng mờ→sáng theo lời, KHÔNG đỏ, bottom 220px, track `captions`.

---

Xem `../WORKFLOW.md` cho toàn bộ 10 bước, `../CLAUDE.md` cho rule + scene patterns.
