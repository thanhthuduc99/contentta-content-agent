# Cách lấy API key

Không có key nào bắt buộc để mở app và quản lý content local. Chỉ điền key cho tính năng bạn thực sự dùng.

## Claude Code

App dùng phiên đăng nhập Claude Code trên máy, không đọc `ANTHROPIC_API_KEY` từ `.env`.

1. Cài Claude Code theo [hướng dẫn chính thức](https://docs.anthropic.com/en/docs/claude-code/getting-started).
2. Chạy `claude` trong repo.
3. Chọn đăng nhập Claude App nếu dùng Pro/Max/Team/Enterprise, hoặc Anthropic Console nếu dùng billing API.
4. Chạy `claude doctor` để xác minh.

Lưu ý: nếu máy đang có biến hệ thống `ANTHROPIC_API_KEY`, Claude Code có thể ưu tiên API key đó thay vì subscription.

## Zernio — đăng bài, analytics, inbox và comment-to-DM

Biến: `ZERNIO_API_KEY`.

1. Đăng nhập [Zernio](https://zernio.com/).
2. Kết nối các tài khoản social cần dùng.
3. Vào **Settings → API Keys → Create API Key**.
4. Copy key ngay khi tạo vì key đầy đủ chỉ được hiển thị một lần.
5. Dán vào `.env`, hoặc nhập trong trang **Settings** của app.

Nếu có nhiều Zernio workspace, phân cách các key bằng dấu phẩy:

```env
ZERNIO_API_KEY=sk_workspace_1,sk_workspace_2
```

Tài liệu: [Zernio API Quickstart](https://docs.zernio.com/).

## Apify — research TikTok và Reddit

Biến: `APIFY_API_KEY`.

1. Đăng nhập [Apify Console](https://console.apify.com/).
2. Vào **Settings → API & Integrations**.
3. Tạo token riêng cho app; nên giới hạn quyền và đặt thời hạn nếu có thể.
4. Dán token vào `.env`.

Tài liệu: [Apify API authentication](https://docs.apify.com/api/v2).

## YouTube Data API — analytics public

Biến: `YOUTUBE_API_KEY` và `YOUTUBE_CHANNEL_HANDLE`.

1. Tạo hoặc chọn project trong [Google Cloud Console](https://console.cloud.google.com/).
2. Vào **APIs & Services → Library** và bật **YouTube Data API v3**.
3. Vào **Credentials → Create credentials → API key**.
4. Giới hạn key chỉ cho YouTube Data API v3 nếu cấu hình restriction.
5. Điền key và handle kênh:

```env
YOUTUBE_API_KEY=...
YOUTUBE_CHANNEL_HANDLE=tenkenh
```

Tài liệu: [YouTube Data API overview](https://developers.google.com/youtube/v3/getting-started).

## YouTube OAuth — đọc đúng kênh đang đăng nhập

Biến: `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`, `YOUTUBE_OAUTH_REFRESH_TOKEN`.

1. Trong Google Cloud Console, bật YouTube Data API v3.
2. Cấu hình OAuth consent screen.
3. Tạo OAuth client cho desktop/installed app.
4. Điền client ID và secret vào `.env`.
5. Chạy:

```bash
cd web
node scripts/yt-oauth.mjs
```

6. Đồng ý quyền `youtube.readonly`. Script nhận callback tại `http://localhost:53682` và tự lưu refresh token vào `.env` ở repo root.

## GitHub — tăng hạn mức research repo

Biến: `GITHUB_TOKEN`.

Token không bắt buộc, nhưng giúp API GitHub có hạn mức cao hơn.

1. Vào GitHub **Settings → Developer settings → Personal access tokens**.
2. Ưu tiên fine-grained token, quyền tối thiểu và có ngày hết hạn.
3. Research public repo thường không cần quyền ghi.

Tài liệu: [GitHub personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Gemini — tính năng ảnh tuỳ chọn

Biến: `GEMINI_API_KEY`.

1. Mở [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Chọn hoặc tạo Google Cloud project.
3. Tạo API key và giới hạn key cho Gemini API.

Tài liệu: [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key).

## OpenAI — transcribe và giọng đọc cho video

Biến: `OPENAI_API_KEY`.

Bắt buộc nếu dùng build video dọc. Pipeline gọi Whisper để nghe lại giọng đọc và sinh phụ đề khớp từng từ, và dùng `gpt-4o-mini-tts` làm giọng dự phòng.

1. Mở [OpenAI API keys](https://platform.openai.com/api-keys).
2. Tạo key mới, đặt giới hạn chi tiêu cho project nếu có.
3. Điền vào `.env` gốc, hoặc vào `.env` của từng sandbox trong `edit-agent/sandbox/`.

## Vivibe — giọng đọc tiếng Việt (tuỳ chọn)

Biến: `VIVIBE_API_KEY` và `VOICE_ID`.

Giọng Việt tự nhiên hơn TTS của OpenAI, dịch vụ của lucylab. Không có key thì `tools/tts-vivibe.mjs` tự chuyển sang OpenAI, build vẫn chạy bình thường.

`VOICE_ID` là id giọng bạn đã tạo hoặc chọn trong tài khoản Vivibe.

## Pixabay — ảnh và video stock (tuỳ chọn)

Biến: `PIXABAY_API_KEY`.

Dùng khi scene cần ảnh minh hoạ mà nguồn không có sẵn ảnh thật. Lấy key miễn phí tại [Pixabay API](https://pixabay.com/api/docs/).

## Obsidian — không cần API key

Điền đường dẫn tuyệt đối tới hai thư mục trong vault:

```env
OBSIDIAN_CONTENT_DIR=C:\duong-dan\vault\Content
OBSIDIAN_RESEARCH_DIR=C:\duong-dan\vault\Research
```

Nếu để trống, app chỉ ghi vào `content/` và `research/` trong repo.

## Bảo mật key

- Không gửi `.env` cho người khác.
- Không chụp màn hình hoặc dán key vào issue/chat công khai.
- Không commit `web/data/app-keys.json`.
- Tạo key riêng cho app, cấp quyền tối thiểu và xoay key định kỳ.
- Nếu key từng xuất hiện trong Git, hãy thu hồi key; xóa commit thôi là chưa đủ.
