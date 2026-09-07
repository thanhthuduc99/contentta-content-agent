# Build video dọc

Repo có hai tính năng dựng video dọc 1080x1920, cùng chạy trên một hạ tầng: app xếp job vào hàng đợi rồi spawn Claude Code headless, agent đó dựng scene HTML và render bằng hyperframes.

| Trang | Đầu vào | Đầu ra |
|---|---|---|
| `/edit/youtube` | 1 link YouTube dài | Post kèm clip 60-180s, và video dọc tóm tắt 60-90s |
| `/edit/daily-news` | 1 chủ đề dạng text, thường kèm link repo | Video dọc tin AI 50-62s |

Job của trang YouTube có slug `ys-*`, job daily news có slug `dn-*`. Cả hai dùng chung một hàng đợi.

## Bật tính năng

Trong `.env`:

```env
DAILY_NEWS_BUILD_ENABLED=1
OPENAI_API_KEY=sk-...
```

Rồi cài dependency cho hai sandbox:

```bash
npm ci --prefix edit-agent/sandbox/contentta-daily-ai-news
npm ci --prefix edit-agent/sandbox/contentta-yt-summary
cp edit-agent/sandbox/contentta-daily-ai-news/.env.example edit-agent/sandbox/contentta-daily-ai-news/.env
cp edit-agent/sandbox/contentta-yt-summary/.env.example edit-agent/sandbox/contentta-yt-summary/.env
```

Điền `OPENAI_API_KEY` vào hai file `.env` vừa tạo, hoặc để trong `.env` gốc là đủ.

Mặc định tắt vì tính năng này spawn Claude Code với `--permission-mode bypassPermissions` trong thư mục sandbox. Chỉ bật khi bạn hiểu điều đó.

## Giọng đọc

Pipeline ưu tiên Vivibe (lucylab) cho giọng tiếng Việt. Không có `VIVIBE_API_KEY` và `VOICE_ID` thì `tools/tts-vivibe.mjs` tự chuyển sang `tools/tts-openai.mjs`, giọng onyx của OpenAI. Bạn không cần làm gì để fallback chạy.

Phụ đề không lấy từ script mà lấy từ Whisper nghe lại chính file `voice.mp3`. Whisper nghe nhầm là chữ trên màn hình sai theo, nên bước làm caption có đối chiếu transcript với `vo-script-display.txt` từng câu và ghi chỗ lệch vào `replacements.json`.

## Trang /edit/youtube

Dán link YouTube, app lấy transcript rồi cho ra hai sản phẩm, mỗi cái bấm riêng.

**Post kèm clip.** AI đọc transcript có timestamp và viết bài tổng hợp cả video. Clip luôn cắt từ giây 0, AI chỉ chọn điểm dừng trong khoảng 60-180 giây ở chỗ trọn ý mà vẫn còn tò mò. Clip giữ ngang 16:9. CTA cuối bài đẩy người đọc xuống comment, link video đặt ở `first_comment`. Bài lưu dạng draft chờ duyệt.

**Video dọc tóm tắt.** Dài 60-90 giây, mở đầu bằng thumbnail video gốc, xen 2-3 đoạn thao tác cắt từ chính video đó. Build xong app tự tạo item short chờ duyệt, `first_comment` là link video gốc.

Về việc tải video: yt-dlp `--download-sections` không dùng được nữa, m3u8 trả file rỗng vì PO token và SABR, còn DASH cắt đoạn sâu thì chậm tới timeout. Nên app tải nguyên video một lần vào cache `content/_media/_ytcache/<videoId>.mp4` rồi cắt local bằng ffmpeg. Cache dùng chung cho cả hai sản phẩm. Đổi chỗ cache bằng `YT_CACHE_DIR`.

Video không có phụ đề thì cả hai luồng trả lỗi 422.

## Trang /edit/daily-news

Nhập chủ đề, thường kèm link repo GitHub hoặc bài viết. Agent tự lấy screenshot và số liệu thật của repo, viết script 120-145 từ, dựng 4-6 scene rồi render.

Video có đuôi im lặng 2 giây: tổng thời lượng bằng độ dài `voice.mp3` cộng 2. Hai giây cuối không có tiếng, scene CTA đứng yên để người xem kịp đọc. Vì vậy `voice.mp3` phải từ 62 giây trở xuống.

Video daily news không có nhạc nền, chỉ có giọng đọc.

## Sửa template

Mỗi sandbox có một bộ template scene HTML riêng:

- `edit-agent/sandbox/contentta-daily-ai-news/contentta-shorts-skill/templates-vertical-ivory/` gồm 11 template v01 đến v15, tông kem sáng
- `edit-agent/sandbox/contentta-yt-summary/skill/templates-vertical-human/` gồm 11 template h01 đến h11, có con trỏ giả, marker, sticky note, khung video

Mỗi thư mục có `README.md` là bảng chọn template kèm giới hạn ký tự tiếng Việt đã đo thật. Agent bắt buộc đọc file đó trước khi dựng scene, nên sửa README là cách nhanh nhất để đổi hành vi.

Đổi màu và font thì sửa `base-vertical.css` trong cùng thư mục.

## Ba cái bẫy đã dính, đừng dẫm lại

**Font body biến mất.** `template-to-scene.mjs` bỏ hẳn lớp `.stage`, nên font body phải khai ở `.content`. Khai ở `.stage` thì scene rơi về serif. Lỗi này chỉ lộ ở frame video thật, preview vẫn đẹp.

**Chữ "ề" vỡ thành "ê" cộng dấu huyền rời.** Lint `font_family_without_font_face` là false positive. Thấy lỗi đó thì bỏ qua, đừng thêm `@font-face`. File woff2 trong repo là bản subset chỉ có Latin, thêm `@font-face` mà không kèm `unicode-range` là nó chiếm hết dải Unicode và làm vỡ dấu tiếng Việt.

**Video demo không hiện.** Thẻ `<video>` phải là con trực tiếp của `#root` trong `index.html`, và tuyệt đối không đặt `data-composition-id` lên nó. Hyperframes coi mọi element có thuộc tính đó là một composition phải đăng ký timeline, `<video>` không đăng ký nên bị chờ 45 giây rồi loại khỏi output.

Vì cả ba chỉ lộ ở frame thật, bước cuối của pipeline luôn trích 6-8 frame bằng ffmpeg và đọc ảnh.

## Hàng đợi

Giữ `DAILY_NEWS_MAX_CONCURRENT=1` nếu chạy Claude Code bằng subscription. Hai process headless song song dùng chung credential, thằng spawn sau refresh OAuth token làm thằng đang chạy mất phiên và chết giữa build. Muốn chạy song song thì mỗi process phải có `ANTHROPIC_API_KEY` riêng.

Hàng đợi không có worker riêng, nó tick mỗi lần trang poll trạng thái. Đóng tab không dừng build đang chạy, nhưng job xếp sau sẽ chờ tới khi có người mở lại trang.

Log của mỗi build nằm ở `video-projects/<slug>/build.log` trong sandbox tương ứng. Video ra ở `video-projects/<slug>/renders/final.mp4`.

## Xem lại video trong app

Trang `/edit/youtube` bấm một build ở mục "Build gần đây" là hiện player. Ô media trong item editor phát được cả `final.mp4` lẫn `clip.mp4`.
