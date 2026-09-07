# contentta-yt-summary

Pipeline dựng **video dọc 1080x1920 tóm tắt 1 video YouTube dài** (60-90s), xen 2-3 đoạn
thao tác cắt từ chính video gốc, CTA mời group Facebook.

Không chạy tay. App Personal Brand (`Content Agent/web`) gọi vào đây:
trang `/edit/youtube` → `POST /api/edit/youtube {action:"build"}` → `enqueueYtSummaryBuild()`
trong `web/lib/edit.ts` ghi `assets/source.json` rồi spawn `claude -p` headless với prompt
`buildYtSummaryPrompt()`. Prompt đó LÀ runbook, sửa quy trình thì sửa ở `web/lib/edit.ts`.

## Quan hệ với daily-news

| | contentta-daily-ai-news | contentta-yt-summary (repo này) |
|---|---|---|
| Nguồn | topic/link user gõ | 1 video YouTube dài (transcript + video file) |
| Template | `templates-vertical-ivory` (11) | `skill/templates-vertical-human` (10) |
| Đoạn video thật | demo.mp4 scrape từ web (nếu có) | 2-3 đoạn thao tác cắt từ video gốc |
| CTA | comment keyword nhận link GitHub | mời vào group (mặc định AI Automation Academy) |
| Hàng đợi | `contentta-daily-ai-news/video-projects/_jobs/` | **DÙNG CHUNG** file đó, slug `ys-*` |

Hàng đợi chung là bắt buộc: 2 process `claude -p` chạy song song refresh OAuth đá nhau khỏi
phiên. `MAX_CONCURRENT=1` áp cho cả 2 loại job.

## Cấu trúc

```
tools/          tts-vivibe · tts-openai · transcribe-openai · ffmpeg-bin · browser-bin
                template-to-scene · yt-clip.mjs (cắt đoạn từ cache)
scripts/        generate-captions.mjs (karaoke caption, --theme ivory)
skill/
  templates-vertical-human/   10 template + base-vertical.css + bg-vertical.png
                              + render-preview.mjs + gallery.html + README.md
  shared/{emoji,fonts}
video-projects/
  scaffold-yt-summary/        scaffold copy cho mỗi build
  ys-<timestamp>/             1 build (assets/source.json do app ghi trước)
.env                          OPENAI_API_KEY (whisper). Vivibe key nằm ở edit-agent/.env
```

## Tải / cắt video YouTube

`tools/yt-clip.mjs <urlOrId> <start> <end> <out.mp4>`

yt-dlp `--download-sections` ĐÃ HỎNG với YouTube (m3u8 trả file rỗng 262B do PO token/SABR;
DASH cắt đoạn sâu thì chậm tới timeout — đo 2026-08-31). Nên tool tải **nguyên video 1 lần**
vào cache rồi cắt local bằng ffmpeg:

```
Content Agent/content/_media/_ytcache/<videoId>.mp4
```

Cache dùng chung với `web/lib/yt-clip.ts` (bước tạo post đã tải sẵn), nên lúc build chỉ cắt,
mất vài giây mỗi đoạn. Xoá cache an toàn, lần sau tự tải lại.

## Sau khi render

App poll `GET /api/edit/youtube?slug=ys-...`; thấy `renders/final.mp4` thì tự tạo item
`short` trạng thái chờ duyệt trong `content/shorts/`, copy video vào `content/_media/`,
gắn `first_comment` = link group và `cta_keyword` = "tài liệu" nếu script có CTA tài liệu.
Thanh duyệt và bấm đăng trong app như short thường.
