# Contentta Content Agent — hướng dẫn cho Claude Code

Khi người dùng yêu cầu cài repo này:

1. Đọc `README.md`, `docs/SETUP.md` và file này trước khi chạy lệnh.
2. Kiểm tra `git`, Node.js `>=20.9`, `npm` và lệnh `claude`.
3. Nếu repo chưa được clone, clone vào một thư mục mới do người dùng chọn. Không ghi đè thư mục có sẵn.
4. Chạy `scripts/setup.ps1` trên Windows hoặc `scripts/setup.sh` trên macOS/Linux/WSL.
5. Không tự đoán, đọc, in hoặc commit API key. Chỉ tạo `.env` từ `.env.example` nếu `.env` chưa tồn tại.
6. App phải chạy mặc định bằng localhost tại `http://localhost:8502`.
7. Không tạo ảnh trong quá trình setup.
8. Các tích hợp là tuỳ chọn. Nếu thiếu key, vẫn cài và chạy phần local trước.
9. Trước khi dùng AI viết, nhắc người dùng hoàn thiện `_system/voice-profile.md` và `_system/business-context.md`.
10. Không đưa app ra Internet nếu chưa có lớp đăng nhập. Với custom domain, làm theo `docs/CUSTOM-DOMAIN.md` và bật Cloudflare Access.

Lệnh kiểm tra chuẩn:

```text
node --version
npm --version
claude --version
npm run build
```

Không sửa nội dung cá nhân trong `content/` nếu người dùng chưa yêu cầu.
