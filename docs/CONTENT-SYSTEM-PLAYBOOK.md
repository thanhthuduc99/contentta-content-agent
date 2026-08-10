# Content OS Local-First

## Checklist dựng hệ thống từ brand context đến lịch xuất bản

Tài liệu này giúp một creator, consultant hoặc agency nhỏ dựng một hệ thống content chạy trên máy cá nhân. Kết quả cần đạt không phải là “cài được một app”, mà là có một vòng làm việc hoàn chỉnh:

1. Thu thập ý tưởng và nguồn nghiên cứu.
2. Tạo nội dung theo đúng giọng, offer và template của thương hiệu.
3. Lưu mọi nội dung dưới dạng Markdown có cấu trúc.
4. Duyệt, lên lịch và theo dõi trạng thái trên một giao diện.
5. Chỉ kết nối kênh đăng và analytics khi thực sự cần.

Phần lõi hoạt động mà không cần API key. AI viết cần Claude Code đã đăng nhập. Đăng đa kênh, research nâng cao và analytics là các module tuỳ chọn.

> Phù hợp nhất với hệ thống một người hoặc một nhóm nhỏ dùng chung một máy/VPS. Đây chưa phải nền tảng multi-tenant có phân quyền người dùng, database cloud và quy trình duyệt nhiều cấp.

## Đi thẳng tới phần cần làm

1. [Hiểu kiến trúc](#1-hiểu-kiến-trúc-trước-khi-cài)
2. [Cài phần lõi](#2-cài-phần-lõi)
3. [Khai báo bộ nhớ thương hiệu](#3-khai-báo-bộ-nhớ-thương-hiệu)
4. [Chuẩn hoá content](#4-chuẩn-hoá-một-đơn-vị-content)
5. [Chạy vòng content đầu tiên](#5-chạy-vòng-content-đầu-tiên)
6. [Bật integration theo nhu cầu](#6-chỉ-bật-integration-khi-có-nhu-cầu)
7. [Thiết kế nhịp vận hành](#7-thiết-kế-nhịp-vận-hành)
8. [Bảo mật và backup](#8-bảo-mật-và-backup)
9. [Kiểm tra hoàn tất](#9-definition-of-done)

## 1. Hiểu kiến trúc trước khi cài

| Lớp | Nằm ở đâu | Vai trò |
|---|---|---|
| Brand context | `_system/` | Giọng văn, khách hàng, offer, nguyên tắc và template đầu ra |
| Content source of truth | `content/` | Mỗi nội dung là một file Markdown có frontmatter |
| Research memory | `research/` | Báo cáo nghiên cứu và trạng thái chống trùng |
| Giao diện vận hành | `web/` | Tạo, sửa, queue, kanban, calendar, media và settings |
| AI runtime | Claude Code CLI | Nhận context từ `_system/` và sinh nội dung |
| Distribution và feedback | Zernio, YouTube, Apify | Đăng bài, inbox, comment-to-DM, analytics và research nâng cao |

Luồng dữ liệu chính:

```text
Nguồn/ý tưởng
    -> form Tạo mới
    -> _system/ + Claude Code
    -> content/*.md
    -> duyệt + media + lịch
    -> kênh xuất bản
    -> analytics/research cho vòng tiếp theo
```

Nguyên tắc quan trọng nhất là `content/` mới là nguồn dữ liệu chính. Giao diện chỉ đọc và ghi các file này. Bạn có thể sao lưu, tìm kiếm, sửa bằng editor khác hoặc mirror sang Obsidian mà không bị khoá trong một database riêng.

## 2. Cài phần lõi

### Yêu cầu

- Git.
- Node.js `20.9+` và npm.
- Claude Code đã cài và đăng nhập nếu muốn dùng AI viết hoặc research.

### Windows PowerShell

```powershell
git clone https://github.com/thanhthuduc99/contentta-content-agent.git
cd contentta-content-agent
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
npm run dev
```

### macOS, Linux hoặc WSL

```bash
git clone https://github.com/thanhthuduc99/contentta-content-agent.git
cd contentta-content-agent
bash scripts/setup.sh
npm run dev
```

Mở `http://localhost:8502`.

Setup đạt khi:

- [ ] Trang app mở được.
- [ ] Các thư mục `content/posts`, `content/shorts`, `content/scripts` đã tồn tại.
- [ ] File `.env` đã được tạo nhưng không chứa key ngoài ý muốn.
- [ ] Bạn tạo và lưu được một bài bằng chế độ dán thủ công.

Nếu chỉ cần quản lý nội dung local, dừng ở đây vẫn có một hệ thống dùng được.

## 3. Khai báo “bộ nhớ thương hiệu”

AI chỉ viết ổn khi context có ranh giới rõ. Hoàn thiện bốn khu vực sau trước khi tạo nội dung bằng AI.

### `_system/voice-profile.md`

Điền:

- Người đang nói là ai và xưng hô thế nào.
- Ba đến năm đặc điểm giọng điệu có thể quan sát được.
- Những từ/cách nói thường dùng.
- Những kiểu câu, claim hoặc thói quen cần tránh.
- Hai đến năm đoạn bài mẫu thật.

Không viết “giọng chuyên nghiệp, gần gũi” rồi dừng lại. Hãy mô tả hành vi cụ thể, ví dụ: “câu ngắn, giải thích thuật ngữ ngay khi dùng, ưu tiên kinh nghiệm đã làm, không mở bài bằng định nghĩa”.

### `_system/business-context.md`

Điền:

- Chân dung khách hàng và vấn đề họ đang cố giải quyết.
- Offer, kết quả cung cấp và quy trình thực tế.
- Proof nào được phép dùng.
- Giá hoặc thông tin nào không được công khai.
- CTA chính và đường dẫn chính xác.
- Các giới hạn claim bắt buộc.

Nếu một con số, testimonial hoặc khách hàng chưa được xác minh, không đưa vào mục proof.

### `_system/skills/writing-patterns.md`

Đây là bộ luật biên tập dùng chung. Giữ các nguyên tắc ngắn, kiểm tra được và không mâu thuẫn với nhau. Ví dụ:

- Một đoạn chỉ mang một ý.
- Hook đi thẳng vào vấn đề hoặc kết quả.
- Mọi số liệu bên ngoài phải có nguồn.
- CTA chỉ xuất hiện khi hợp với mục tiêu bài.

### `_system/templates/`

Template quyết định hình dạng đầu ra. Repo đã có template cho post, Threads và video dài. Chỉ giữ các section bạn thực sự dùng. Nếu muốn thêm format mới, hãy bắt đầu bằng một bài đầu ra hoàn chỉnh rồi rút nó thành cấu trúc, thay vì viết một danh sách chỉ dẫn trừu tượng.

Brand context đạt khi:

- [ ] Người mới đọc có thể nói đúng “ai đang viết cho ai”.
- [ ] Offer và CTA không cần AI tự đoán.
- [ ] Có bài mẫu thật, không chỉ có tính từ mô tả giọng.
- [ ] Các claim bị cấm đã được ghi rõ.
- [ ] Mỗi template tạo ra một deliverable có thể đăng được.

## 4. Chuẩn hoá một đơn vị content

Mỗi nội dung được lưu thành Markdown. Ví dụ:

```markdown
---
type: post
content_type: chia-se-kien-thuc
platform: facebook;linkedin
date: 2026-08-10
topic: Cách biến một buổi tư vấn thành ba nội dung
status: draft
publish_at: null
posted: false
posted_at: null
parent: null
---

Nội dung bài viết bắt đầu ở đây.
```

Ba loại nội dung lõi:

| `type` | Thư mục | Dùng cho |
|---|---|---|
| `post` | `content/posts/` | Bài text và biến thể Threads |
| `short` | `content/shorts/` | Script video ngắn và caption đăng |
| `youtube` | `content/scripts/` | Script video dài, title và description |

Vòng đời nên dùng thống nhất:

```text
draft -> scheduled/queued -> published
                         \-> failed -> sửa và chạy lại
```

Không tạo thêm trạng thái chỉ để mô tả cảm giác như “gần xong” hoặc “đang nghĩ”. Trạng thái tốt phải trả lời được hành động tiếp theo là gì.

## 5. Chạy vòng content đầu tiên

### Vòng A: kiểm tra phần lõi bằng nội dung thủ công

1. Vào **Tạo mới** và chọn **Post**.
2. Chọn chế độ tự dán nội dung.
3. Điền topic, dán một bài ngắn và lưu.
4. Mở file mới trong `content/posts/` để xác nhận frontmatter và body đã được ghi.
5. Chuyển bài qua queue, kanban hoặc calendar rồi lưu lại.

Vòng này tách lỗi hệ thống file khỏi lỗi AI. Nếu nội dung thủ công chưa lưu được, chưa nên nối thêm integration.

### Vòng B: kiểm tra AI viết

1. Chạy `claude --version` và `claude doctor` trong terminal.
2. Mở Claude Code một lần trong repo để hoàn tất login/trust.
3. Trong app, tạo một post bằng chế độ AI.
4. So đầu ra với checklist biên tập bên dưới.
5. Nếu sai giọng hoặc sai offer, sửa `_system/` trước khi sửa prompt trong code.

Checklist duyệt trước khi đăng:

- [ ] Hook nói đúng vấn đề của khách hàng mục tiêu.
- [ ] Bài chỉ có một luận điểm chính.
- [ ] Ví dụ, số liệu và proof đều có thật.
- [ ] Giọng đọc giống bài mẫu trong voice profile.
- [ ] CTA khớp với content type và business context.
- [ ] Platform, media và thời gian đăng đã đúng.
- [ ] Không có dữ liệu nội bộ hoặc secret trong bài và media.

## 6. Chỉ bật integration khi có nhu cầu

Không cần điền toàn bộ `.env`. Mỗi integration phải gắn với một việc đang làm.

| Nhu cầu | Cấu hình | Bật khi |
|---|---|---|
| AI viết và tóm tắt | Claude Code login | Brand context đã hoàn thiện |
| Đăng đa kênh, inbox, analytics | `ZERNIO_API_KEY` | Đã duyệt được content ổn định bằng tay |
| Research TikTok/Reddit | `APIFY_API_KEY` | Có quy trình chọn và lưu insight |
| YouTube analytics public | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_HANDLE` | Cần dashboard kênh |
| YouTube analytics theo tài khoản | OAuth variables | Cần dữ liệu của kênh đã đăng nhập |
| Tạo ảnh | `GEMINI_API_KEY` | Đã có style và quy trình duyệt ảnh |
| Mirror sang Obsidian | `OBSIDIAN_CONTENT_DIR`, `OBSIDIAN_RESEARCH_DIR` | Đang dùng vault làm knowledge base |

Chi tiết lấy và giới hạn quyền key nằm trong [API-KEYS.md](API-KEYS.md).

Quy tắc rollout:

1. Chạy core local.
2. Kiểm tra AI viết.
3. Đăng thử một nền tảng.
4. Kiểm tra trạng thái và analytics trả về.
5. Sau đó mới thêm nền tảng hoặc automation tiếp theo.

## 7. Thiết kế nhịp vận hành

Một hệ thống content tốt cần chỉ rõ lúc nào con người ra quyết định và lúc nào máy thực thi.

### Khi bắt đầu một phiên content

- Mở research hoặc nguồn đầu vào.
- Chọn một insight gắn với khách hàng và offer.
- Quyết định format: post, short hay video dài.
- Ghi topic và note nguồn trước khi generate.

### Khi duyệt

- Kiểm tra fact và claim.
- Chỉnh góc nhìn, ví dụ và CTA.
- Thêm media phù hợp.
- Chuyển trạng thái hoặc đặt `publish_at`.

### Khi review hệ thống

- Nhìn nội dung nào đã xuất bản, nội dung nào kẹt ở draft/failed.
- Đối chiếu analytics theo format và platform.
- Ghi insight quay lại business context, writing pattern hoặc template.
- Loại bỏ rule/template không còn dùng thay vì tiếp tục chồng thêm chỉ dẫn.

Vòng phản hồi đúng là:

```text
Kết quả thật -> insight -> sửa context/template -> nội dung mới
```

Không sửa prompt theo một bài bất thường. Chỉ cập nhật luật dùng chung khi lỗi lặp lại hoặc khi chiến lược đã thay đổi.

## 8. Bảo mật và backup

- Không commit `.env`, `web/data/app-keys.json`, browser profile hoặc token.
- Tạo key riêng cho app và chỉ cấp quyền tối thiểu.
- Nếu key từng xuất hiện trong commit hoặc ảnh chụp, hãy thu hồi và tạo key mới.
- Không mở trực tiếp port `8502` ra Internet.
- Nếu dùng domain, đặt Cloudflare Access hoặc lớp xác thực tương đương ở phía trước.
- Backup `content/`, `_system/` và `research/`. Đây là ba khu vực chứa phần lớn giá trị vận hành.

## 9. Definition of done

Hệ thống được xem là setup xong khi:

- [ ] Một người mới có thể hiểu brand, audience, offer và CTA từ `_system/`.
- [ ] Tạo thủ công và tạo bằng AI đều sinh file Markdown đúng thư mục.
- [ ] Mỗi content có type, topic, status và lịch rõ ràng.
- [ ] Có checklist duyệt trước khi đăng.
- [ ] Có ít nhất một vòng từ ý tưởng đến published được kiểm tra đầu cuối.
- [ ] Integration thiếu key không làm hỏng phần lõi.
- [ ] Secret không nằm trong Git.
- [ ] Có cách backup và khôi phục các thư mục dữ liệu chính.

Nếu chưa đạt một mục, sửa đúng lớp gây lỗi. Đừng thêm automation để che một quy trình lõi chưa rõ.

## Prompt nhờ Claude Code setup repo

Sau khi repo được public, người dùng có thể dán nguyên prompt sau vào Claude Code:

```text
Hãy cài Contentta Content Agent từ https://github.com/thanhthuduc99/contentta-content-agent. Đọc README.md, CLAUDE.md và docs/CONTENT-SYSTEM-PLAYBOOK.md trước. Kiểm tra Git, Node.js và Claude Code; clone repo; chạy script setup đúng hệ điều hành; tạo .env từ .env.example nhưng không tự điền, đọc hoặc in secret. Chạy core local trên localhost:8502 và giúp tôi hoàn thiện lần lượt voice profile, business context, writing patterns và template. Chỉ cấu hình integration khi tôi yêu cầu.
```

Các bước cần login, tạo API key hoặc cấp quyền tài khoản vẫn phải do chính người dùng xác nhận.
