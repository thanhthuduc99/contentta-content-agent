# Hướng dẫn cài đặt

## 1. Cần tải những gì

### Bắt buộc để mở app

1. **Git** để tải và cập nhật repo.
2. **Node.js 20.9 trở lên**. Next.js 16 yêu cầu tối thiểu 20.9, nên dùng bản LTS từ [nodejs.org](https://nodejs.org/en/download/).
3. **npm**, cài kèm Node.js.

### Cần cho tính năng AI

4. **Claude Code**. App gọi thẳng lệnh `claude -p` trên máy, nên bạn không cần nhúng Anthropic API key nếu đã đăng nhập bằng gói Claude phù hợp.

Windows PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

Hoặc WinGet:

```powershell
winget install Anthropic.ClaudeCode
```

macOS, Linux, WSL:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Kiểm tra và đăng nhập:

```bash
claude --version
claude
```

Trong Claude Code, chạy `/login` nếu chưa đăng nhập. Xem [tài liệu Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started).

### Cần cho build video dọc

5. **ffmpeg và ffprobe** trên PATH. Windows: `winget install Gyan.FFmpeg`. macOS: `brew install ffmpeg`.
6. **yt-dlp**. Windows: `winget install yt-dlp`. macOS: `brew install yt-dlp`.
7. **Google Chrome** hoặc Edge để hyperframes render. Không có thì chạy `npx hyperframes browser` để nó tự tải Chromium.
8. **OpenAI API key** cho Whisper transcribe và TTS dự phòng.

### Tuỳ chọn

- **Python 3 + Playwright** nếu muốn đăng vào group Facebook: `pip install playwright` rồi `python -m playwright install chromium`.
- **cloudflared** nếu muốn dùng domain riêng.
- **Obsidian** nếu muốn mirror file Markdown vào vault.

## 2. Tải và cài app

Windows:

```powershell
git clone https://github.com/thanhthuduc99/contentta-content-agent.git
cd contentta-content-agent
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

macOS, Linux, WSL:

```bash
git clone https://github.com/thanhthuduc99/contentta-content-agent.git
cd contentta-content-agent
bash scripts/setup.sh
```

Script setup sẽ kiểm tra Node.js, tạo `.env` từ `.env.example` nếu chưa có, tạo các thư mục dữ liệu local, chạy `npm ci` trong `web/`, và báo những công cụ còn thiếu. Nó không tự điền key và không tạo ảnh.

Muốn cài luôn phần build video, thêm cờ:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -WithVideo
```

```bash
bash scripts/setup.sh --with-video
```

Cờ này chạy `npm ci` trong hai sandbox `edit-agent/sandbox/*` và tạo `.env` cho chúng.

## 3. Khai báo thương hiệu

Trước khi bấm nút AI viết, sửa bốn chỗ:

1. `_system/voice-profile.md`: giọng văn, cách xưng hô, câu hay dùng, điều cần tránh.
2. `_system/business-context.md`: khách hàng, offer, proof, CTA, giới hạn claim.
3. `_system/skills/writing-patterns.md`: cấu trúc viết ưu tiên.
4. `_system/templates/`: format video và post đầu ra.

Đây là context app gửi cho Claude Code. Để nguyên placeholder thì output chỉ mang tính minh hoạ.

## 4. Chạy

Chế độ phát triển:

```bash
npm run dev
```

Chế độ ổn định:

```bash
npm run build
npm run start
```

Mở `http://localhost:8502`. Sau khi sửa `.env`, tắt và chạy lại server.

Nếu đang chạy `npm run start` mà build đè lên, app sẽ hỏng theo kiểu khó đoán: route mới trả 404 dù code đúng. Luôn dừng server trước, build xong mới start lại.

## 5. Kiểm tra nhanh

```bash
node --version
npm --version
claude --version
ffmpeg -version
yt-dlp --version
npm run build
```

Trong app:

1. Mở trang tổng hợp.
2. Tạo một post ở chế độ "Tôi tự dán" để kiểm tra ghi file local.
3. Sau khi Claude Code đã đăng nhập, tạo một post ngắn ở chế độ "AI viết".
4. Chỉ cấu hình Zernio và các API khác khi cần tính năng tương ứng.

## 6. Lỗi thường gặp

### `claude: command not found`

Đóng rồi mở lại terminal. Trên Windows, kiểm tra `%USERPROFILE%\.local\bin` đã nằm trong `PATH`. Chạy `claude doctor` để chẩn đoán.

### Node quá cũ

Chạy `node --version`. Thấp hơn `20.9` thì cài bản LTS mới rồi chạy lại setup.

### App mở được nhưng AI viết lỗi

Chạy `claude` trực tiếp trong terminal của repo, hoàn tất đăng nhập và trust project trước.

### Analytics hoặc đăng bài báo thiếu key

Đây là tích hợp tuỳ chọn. Làm theo [API-KEYS.md](API-KEYS.md), điền `.env`, rồi restart app.

### Build video không chạy

Kiểm tra theo thứ tự: `DAILY_NEWS_BUILD_ENABLED=1` trong `.env`, hai sandbox đã `npm ci` chưa, `OPENAI_API_KEY` đã điền chưa, `ffmpeg` và `yt-dlp` có trên PATH không. Chi tiết ở [VIDEO-BUILD.md](VIDEO-BUILD.md).

### Đường dẫn content nằm chỗ khác

Điền `CONTENT_AGENT_ROOT`, hoặc từng biến `CONTENT_DIR`, `SYSTEM_DIR`, `RESEARCH_DIR` trong `.env`.
