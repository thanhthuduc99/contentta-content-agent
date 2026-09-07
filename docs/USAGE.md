# Hướng dẫn sử dụng

App có ba loại nội dung, mỗi loại là một file Markdown trong `content/`:

| Loại | Thư mục | Dùng để |
|---|---|---|
| `youtube` | `content/scripts/` | Script video dài, app không đăng hộ, chỉ nhắc lịch |
| `short` | `content/shorts/` | Video ngắn đăng Facebook, Instagram, TikTok, YouTube |
| `post` | `content/posts/` | Bài text kèm ảnh đăng Facebook, LinkedIn, Threads |

Mỗi file có frontmatter giữ trạng thái: `status`, `posted`, `publish_at`, `accounts`, `first_comment`. App đọc ghi trực tiếp file này, nên bạn sửa bằng editor nào cũng được.

## Tạo nội dung

Vào trang Tạo, chọn loại rồi chọn một trong hai chế độ:

- **AI viết**: Claude Code trên máy viết dựa trên `_system/voice-profile.md` và `_system/business-context.md`. Không tốn API key.
- **Tôi tự dán**: bạn dán nội dung có sẵn, app chỉ lo phần lưu, đính media và đăng.

Từ một script video dài, bạn bấm tạo derivative để sinh short hoặc post. Chúng là nội dung độc lập chứ không phải cắt lại, tạo khi nào cần chứ không sinh sẵn hàng loạt.

## Tạo ảnh

Trong editor có nút tạo thumbnail, ảnh đơn và carousel. Ảnh dựng bằng Satori từ spec do Claude viết, không gọi API ảnh nên không tốn tiền. Muốn ảnh tả thực thì cần `GEMINI_API_KEY`.

## Đăng bài

Editor có nút đăng cho từng account, không phải từng nền tảng. Nghĩa là hai tài khoản Instagram hay hai TikTok đều đăng được, chọn account nào thì đăng account đó. Danh sách account lấy từ Zernio.

Vài giới hạn app đã tự xử lý, bạn không phải nhớ:

- Facebook và Threads nhận tối đa 10 ảnh, LinkedIn 20 ảnh.
- Có video thì chỉ đăng video đầu tiên, không nền tảng nào nhận lẫn ảnh với video.
- Threads giới hạn 500 ký tự mỗi post, nên bài dài tự cắt thành chuỗi reply nối tiếp, ảnh gắn vào phần đầu. Muốn ép chỗ ngắt thì gõ `---` trên một dòng riêng.

Muốn hẹn giờ thì điền `publish_at` trong editor.

## Comment tự động sau khi đăng

Ô "Comment tự động sau khi đăng" trong editor lưu vào frontmatter `first_comment`. Dùng để nhét link mà không dìm reach bài gốc. App gửi kèm cho Facebook, Instagram, LinkedIn, YouTube, chạy cả với bài hẹn lịch.

Threads không có field này nên câu comment thành mắt xích cuối của chuỗi. TikTok không comment tự động được.

Nền tảng không trả xác nhận thật, nên app chỉ báo đã gửi kèm chứ không khẳng định đã comment thành công.

## Đăng vào group Facebook và Zalo

Card "Đăng lên cộng đồng" trong editor. Phần này không đi qua Zernio.

Facebook chạy Playwright ở chế độ hiện cửa sổ, dùng một profile Chromium riêng trong `web/scripts/group_poster/profiles/`. Lần đầu bạn phải đăng nhập tay trong Settings, nhớ tích "Duy trì đăng nhập", nếu không thì cookie phiên bị mất khi đóng trình duyệt.

Zalo không dùng Playwright vì Zalo chỉ giữ một phiên web mỗi tài khoản, mở thêm là đá phiên cũ. App gọi qua zalo-relay chạy trên VPS của bạn. Không có VPS thì bỏ trống `ZALO_RELAY_*`, phần Zalo tự tắt.

Danh sách group khai trong Settings. Facebook điền URL group, Zalo điền đúng tên group như relay thấy.

Giữ phiên Facebook sống lâu bằng cách: không chạy headless, không mở cùng profile ở hai nơi, không xoá thư mục `profiles/`, không bắn một bài quá 3-5 group, không quá 2 đợt mỗi ngày, không bật VPN. Kể cả làm đúng hết thì phiên cũng chỉ sống 2-3 tuần trước khi Facebook thu hồi từ phía họ.

## Comment và inbox

Tab Comment gom bình luận từ YouTube, Facebook, Instagram, LinkedIn qua Zernio inbox, đọc và trả lời được ngay trong app. TikTok thì Zernio không hỗ trợ nên app chỉ đọc được, muốn trả lời phải mở app TikTok.

Trang comment-to-DM cho phép đặt luật: ai comment đúng từ khoá thì tự nhận DM. Hợp với bài dạng nhận tài liệu.

## Analytics

Trang Analytics lấy số liệu theo từng bài đã đăng. Cần `ZERNIO_API_KEY`. Riêng YouTube cần thêm `YOUTUBE_API_KEY` với `YOUTUBE_CHANNEL_HANDLE`, hoặc OAuth nếu muốn số liệu riêng tư của kênh mình.

## Research

Trang Research nhận link YouTube, GitHub hoặc bài viết rồi tóm tắt kèm tìm thêm nguồn. Ngoài ra app tự chạy báo cáo tổng hợp mỗi sáng 8 giờ, lưu vào `research/daily/`. Báo cáo chỉ liệt kê thứ mới, những gì đã báo hôm trước bị lọc bằng `research/_state.json`.

Muốn đổi cổng app tự gọi lại chính nó thì đặt `CONTENT_AGENT_PORT`.

## Tải video về máy

Trang Download nhận link Facebook, Instagram, TikTok, YouTube và tải bằng `yt-dlp`. File về thư mục `downloads/` trong repo, đổi bằng `DOWNLOAD_DIR`.

## Mirror sang Obsidian

Điền `OBSIDIAN_CONTENT_DIR` và `OBSIDIAN_RESEARCH_DIR` trong `.env` là mỗi lần lưu app ghi thêm một bản vào vault. File trong `content/` vẫn là bản gốc. Để trống hai biến này thì mirror tắt hẳn.
