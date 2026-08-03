# Chạy bằng domain với Cloudflare Tunnel

App mặc định chạy local tại `http://localhost:8502`. Vì app ghi file local, gọi Claude Code và giữ secret social trên máy, không nên deploy kiểu stateless lên Vercel/Pages.

## Cảnh báo bảo mật

Không đưa app ra Internet nếu chưa bật lớp đăng nhập. Domain công khai có thể cho người lạ truy cập content, gọi API local hoặc dùng các tài khoản social bạn đã kết nối.

Khuyến nghị:

- Cloudflare Tunnel để không mở port router.
- Cloudflare Access để chỉ email/tài khoản được phép mới vào được.
- Không dùng Quick Tunnel cho production.

## Cách 1: Link tạm để kiểm tra

1. Chạy app:

```bash
npm run dev
```

2. Ở terminal khác:

```bash
cloudflared tunnel --url http://localhost:8502
```

Cloudflare trả về một URL ngẫu nhiên `trycloudflare.com`. Link này chỉ phù hợp để test ngắn hạn. [Quick Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Cách 2: Domain riêng bằng Cloudflare Dashboard

Điều kiện: domain đang quản lý DNS bằng Cloudflare.

1. Build và chạy app:

```bash
npm run build
npm run start
```

2. Vào **Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel**.
3. Chọn Cloudflared và đặt tên, ví dụ `content-agent`.
4. Copy đúng lệnh cài connector mà Dashboard tạo cho hệ điều hành của bạn và chạy trên máy đang host app.
5. Trong tunnel, thêm **Published application**:
   - Subdomain: `content`
   - Domain: domain của bạn
   - Service type: `HTTP`
   - URL: `localhost:8502`
6. Lưu và mở `https://content.tenmiencuaban.com`.

Tài liệu: [Publish a local application](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/).

## Bật Cloudflare Access

1. Vào **Zero Trust → Access → Applications**.
2. Thêm **Self-hosted application** cho hostname vừa tạo.
3. Tạo policy **Allow** chỉ cho email, email domain hoặc identity provider của bạn.
4. Không tạo policy bypass toàn bộ Internet.
5. Mở cửa sổ ẩn danh để kiểm tra: phải đăng nhập trước khi thấy app.

## Cách 3: Named tunnel bằng CLI

```bash
cloudflared tunnel login
cloudflared tunnel create content-agent
cloudflared tunnel route dns content-agent content.tenmiencuaban.com
```

Tạo file cấu hình Cloudflare (`%USERPROFILE%\.cloudflared\config.yml` trên Windows hoặc `~/.cloudflared/config.yml` trên macOS/Linux):

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /absolute/path/to/YOUR_TUNNEL_UUID.json

ingress:
  - hostname: content.tenmiencuaban.com
    service: http://localhost:8502
  - service: http_status:404
```

Chạy:

```bash
cloudflared tunnel run content-agent
```

## Vận hành lâu dài

- Dùng `npm run build && npm run start`, không dùng dev server.
- Thiết lập app và cloudflared chạy cùng hệ điều hành khi khởi động.
- Backup `content/`, `research/` và `_system/`; không backup `.env` vào nơi công khai.
- Sau mỗi lần `git pull`, chạy lại `npm run setup` nếu `package-lock.json` thay đổi, rồi build và restart.
