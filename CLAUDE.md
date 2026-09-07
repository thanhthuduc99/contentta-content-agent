# Contentta Content Agent — hướng dẫn cho Claude Code

Khi người dùng yêu cầu cài repo này:

1. Đọc `README.md`, `docs/SETUP.md` và file này trước khi chạy lệnh.
2. Kiểm tra `git`, Node.js `>=20.9`, `npm` và lệnh `claude`.
3. Repo chưa clone thì clone vào thư mục mới do người dùng chọn. Không ghi đè thư mục có sẵn.
4. Chạy `scripts/setup.ps1` trên Windows hoặc `scripts/setup.sh` trên macOS/Linux/WSL.
5. Không tự đoán, đọc, in hoặc commit API key. Chỉ tạo `.env` từ `.env.example` nếu `.env` chưa tồn tại.
6. App chạy mặc định ở `http://localhost:8502`.
7. Không tạo ảnh trong quá trình setup.
8. Tích hợp đều là tuỳ chọn. Thiếu key thì vẫn cài và chạy phần local trước.
9. Trước khi dùng AI viết, nhắc người dùng hoàn thiện `_system/voice-profile.md` và `_system/business-context.md`.
10. Không đưa app ra Internet nếu chưa có lớp đăng nhập. Với custom domain, làm theo `docs/CUSTOM-DOMAIN.md` và bật Cloudflare Access.

Lệnh kiểm tra chuẩn:

```text
node --version
npm --version
claude --version
npm run build
```

## Build video dọc

Chỉ setup phần này khi người dùng yêu cầu, vì nó nặng và cần thêm key.

- Chạy setup với cờ `-WithVideo` (PowerShell) hoặc `--with-video` (bash).
- Hai sandbox nằm ở `edit-agent/sandbox/`, mỗi cái cần `npm ci` riêng và có `.env` riêng.
- Nhắc người dùng điền `OPENAI_API_KEY` và đặt `DAILY_NEWS_BUILD_ENABLED=1`.
- Không commit `.env` của sandbox. Không commit thư mục `video-projects/` trừ scaffold có sẵn.
- Kiểm tra `ffmpeg`, `ffprobe`, `yt-dlp` có trên PATH không trước khi báo là cài xong.
- Chi tiết và các bẫy đã biết nằm ở `docs/VIDEO-BUILD.md`. Đọc file đó trước khi sửa template hoặc pipeline.

## Quy ước khi sửa code

- Không sửa nội dung cá nhân trong `content/` nếu người dùng chưa yêu cầu.
- Đường dẫn phải đọc từ env, không hardcode ổ đĩa hay tên người dùng.
- Build đè lên server đang chạy sẽ làm route mới trả 404. Dừng server trước, build xong mới start lại.
