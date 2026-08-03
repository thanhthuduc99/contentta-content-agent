# Hướng dẫn cài đặt

## 1. Cần tải những gì?

### Bắt buộc

1. **Git** để tải và cập nhật repo.
2. **Node.js 20.9 trở lên**. Next.js 16 yêu cầu tối thiểu Node.js 20.9; nên dùng bản LTS từ [nodejs.org](https://nodejs.org/en/download/).
3. **npm**, được cài cùng Node.js.

### Cần cho tính năng AI

4. **Claude Code**. App gọi trực tiếp lệnh `claude -p` trên máy, vì vậy không cần nhúng Anthropic API key nếu bạn đăng nhập bằng gói Claude phù hợp.

Windows PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

Hoặc dùng WinGet:

```powershell
winget install Anthropic.ClaudeCode
```

macOS/Linux/WSL:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Sau đó kiểm tra và đăng nhập:

```bash
claude --version
claude
```

Trong Claude Code, chạy `/login` nếu chưa đăng nhập. Có thể dùng Claude Pro/Max/Team/Enterprise hoặc Anthropic Console tuỳ tài khoản. Xem [hướng dẫn Claude Code chính thức](https://docs.anthropic.com/en/docs/claude-code/getting-started).

### Tuỳ chọn

- **yt-dlp** để tải video Facebook, Instagram và YouTube. Windows có thể chạy `winget install yt-dlp`; macOS dùng `brew install yt-dlp`. Xem [hướng dẫn yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/Installation).
- **cloudflared** nếu muốn dùng domain. Tải từ [Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).
- **Obsidian** nếu muốn mirror file Markdown vào vault riêng.

## 2. Tải và cài app

Windows:

```powershell
git clone https://github.com/thanhthuduc99/contentta-content-agent.git
cd contentta-content-agent
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

macOS/Linux/WSL:

```bash
git clone https://github.com/thanhthuduc99/contentta-content-agent.git
cd contentta-content-agent
bash scripts/setup.sh
```

Script setup sẽ:

- Kiểm tra Node.js.
- Tạo `.env` từ `.env.example` nếu chưa có.
- Tạo các thư mục dữ liệu local.
- Chạy `npm ci` trong `web/`.
- Không tự điền key và không tạo ảnh.

## 3. Khai báo thương hiệu

Trước khi bấm “AI viết”, sửa:

1. `_system/voice-profile.md`: giọng văn, cách xưng hô, câu hay dùng, điều cần tránh.
2. `_system/business-context.md`: khách hàng, offer, proof, CTA và giới hạn claim.
3. `_system/skills/writing-patterns.md`: cấu trúc viết ưu tiên.
4. `_system/templates/`: format video/post đầu ra.

Đây là context được app gửi cho Claude Code. Nếu để nguyên placeholder, output sẽ chỉ mang tính minh hoạ.

## 4. Chạy localhost

Chế độ phát triển:

```bash
npm run dev
```

Mở `http://localhost:8502`.

Chế độ ổn định:

```bash
npm run build
npm run start
```

Sau khi thay `.env`, hãy tắt và chạy lại server.

## 5. Kiểm tra nhanh

```bash
node --version
npm --version
claude --version
claude doctor
npm run build
```

Trong app:

1. Mở trang tổng hợp.
2. Tạo một post ở chế độ “Tôi tự dán” để kiểm tra ghi file local.
3. Sau khi Claude Code đã đăng nhập, tạo một post ngắn ở chế độ “AI viết”.
4. Chỉ cấu hình Zernio/API khác khi cần tính năng tương ứng.

## 6. Lỗi thường gặp

### `claude: command not found`

Đóng rồi mở lại terminal. Trên Windows, kiểm tra `%USERPROFILE%\.local\bin` đã nằm trong `PATH`. Chạy `claude doctor` để chẩn đoán.

### Node quá cũ

Chạy `node --version`. Nếu thấp hơn `20.9`, cài bản Node.js LTS mới rồi chạy lại setup.

### App mở được nhưng AI viết lỗi

Chạy `claude` trực tiếp trong terminal của repo và hoàn tất đăng nhập/trust project trước.

### Analytics hoặc đăng bài báo thiếu key

Đây là tích hợp tuỳ chọn. Làm theo [API-KEYS.md](API-KEYS.md), điền `.env`, rồi restart app.

### Build daily-news lỗi

Tính năng này mặc định tắt vì cần một project edit-agent riêng. Chỉ bật khi đã khai báo `DAILY_NEWS_DIR`, `DAILY_NEWS_MUSIC_PATH` và `DAILY_NEWS_BUILD_ENABLED=1`.
