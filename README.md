# Contentta Content Agent

Ứng dụng local-first để tạo, lưu, quản lý, nghiên cứu và phân phối nội dung bằng Claude Code. App chạy trên máy của bạn tại `http://localhost:8502`; file Markdown trong `content/` là nguồn dữ liệu chính.

> Muốn dựng cả quy trình thay vì chỉ cài app? Bắt đầu với [Content OS Local-First: checklist từ brand context đến lịch xuất bản](docs/CONTENT-SYSTEM-PLAYBOOK.md).

## Cài bằng Claude Code từ link GitHub

Dán nguyên câu này cho Claude Code:

```text
Hãy cài Contentta Content Agent từ https://github.com/thanhthuduc99/contentta-content-agent. Đọc README.md, CLAUDE.md và docs/CONTENT-SYSTEM-PLAYBOOK.md trước; kiểm tra máy; clone repo; chạy script setup phù hợp; tạo .env từ .env.example nhưng không tự điền hoặc in secret; sau đó chạy app trên localhost:8502. Không tạo ảnh. Nếu thiếu key tuỳ chọn thì bỏ qua tính năng đó.
```

Claude sẽ thực hiện các bước clone, cài dependency và mở app. Những bước cần đăng nhập hoặc lấy API key vẫn cần bạn thao tác trên tài khoản của chính mình.

## Cài nhanh thủ công

Yêu cầu tối thiểu:

- Git.
- Node.js `20.9+` (khuyên dùng bản LTS).
- Claude Code đã cài và đăng nhập nếu muốn dùng tính năng AI viết/research.

Windows PowerShell:

```powershell
git clone https://github.com/thanhthuduc99/contentta-content-agent.git
cd contentta-content-agent
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
npm run dev
```

macOS, Linux hoặc WSL:

```bash
git clone https://github.com/thanhthuduc99/contentta-content-agent.git
cd contentta-content-agent
bash scripts/setup.sh
npm run dev
```

Mở `http://localhost:8502`.

## Cấu hình bắt buộc trước khi để AI viết

Sửa bốn file sau để nội dung mang đúng giọng và đúng offer của bạn:

- `_system/voice-profile.md`
- `_system/business-context.md`
- `_system/skills/writing-patterns.md`
- `_system/templates/`

Không có API key nào bắt buộc chỉ để mở app, dán nội dung thủ công và quản lý file local. Claude Code dùng phiên đăng nhập trên máy; bạn không cần đặt Anthropic API key nếu đang dùng gói Claude tương thích.

## Tính năng và tích hợp

| Tính năng | Cần thêm |
|---|---|
| Mở app, quản lý Markdown, calendar, kanban | Không cần API key |
| AI viết và tóm tắt | Claude Code CLI đã đăng nhập |
| Đăng đa kênh, analytics, inbox, comment-to-DM | Zernio API key |
| Research TikTok/Reddit | Apify API key |
| YouTube analytics | YouTube API key hoặc OAuth |
| Tải Facebook/Instagram/YouTube | `yt-dlp` |
| Mirror sang Obsidian | Đường dẫn vault trong `.env` |
| Custom domain | Cloudflare Tunnel + Cloudflare Access |
| Edit daily-news | Project edit-agent riêng; mặc định tắt |

Xem [playbook dựng hệ thống content](docs/CONTENT-SYSTEM-PLAYBOOK.md), [hướng dẫn cài đặt đầy đủ](docs/SETUP.md), [cách lấy API key](docs/API-KEYS.md) và [cách dùng custom domain](docs/CUSTOM-DOMAIN.md).

## Lưu ý về deploy

Đây không phải app stateless để bấm Deploy lên Vercel. App ghi file xuống ổ đĩa và gọi Claude Code CLI trên chính máy đang chạy. Cách phù hợp là:

1. Chạy app trên máy/VPS bằng `npm run build` rồi `npm run start`.
2. Nếu cần domain, đưa `localhost:8502` ra ngoài bằng Cloudflare Tunnel.
3. Bắt buộc bảo vệ domain bằng Cloudflare Access vì app có quyền đọc/ghi nội dung và gọi các tích hợp đã kết nối.

## Cấu trúc

```text
contentta-content-agent/
├── web/          # Next.js 16 app
├── content/      # scripts, posts, shorts và media local
├── _system/      # voice, business context, template viết
├── research/     # báo cáo research
├── docs/         # hướng dẫn setup/key/domain
└── .env          # secrets local, không được commit
```

## Bảo mật

- Không commit `.env`, `web/data/app-keys.json`, browser profile hoặc token.
- Chỉ cấp quyền tối thiểu cho API key và xoay key nếu nghi bị lộ.
- Không mở thẳng port `8502` ra Internet.
- Không dùng Quick Tunnel cho production; dùng named tunnel và Access policy.
