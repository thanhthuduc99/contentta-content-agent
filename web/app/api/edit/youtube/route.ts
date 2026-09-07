import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { generateYouTubeVideoPost } from "@/lib/claude";
import { transcriptYouTubeTimed, ytId, ytTitle } from "@/lib/research";
import { saveItem, newId, type ContentItem } from "@/lib/content";
import { mediaDirFor } from "@/lib/paths";
import { clipYouTube, ensureYouTubeCached } from "@/lib/yt-clip";
import {
  enqueueYtSummaryBuild,
  getDailyNewsBuild,
  getJob,
  attachJobItem,
  ytSummaryProjectDir,
  listDailyNewsJobs,
  InvalidEditParamError,
} from "@/lib/edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // claude viết post (vài phút) + yt-dlp tải cache

// ============================================================================
// YouTube dài → 2 sản phẩm:
//   action "post"  → bài LinkedIn/Threads kèm clip cắt từ video (draft chờ duyệt)
//   action "build" → enqueue video dọc tóm tắt (queue chung daily-news)
//   GET ?slug=     → trạng thái build; build xong tự tạo item short chờ duyệt
//   GET            → danh sách job ys-*
// ============================================================================

async function handlePost(cleanUrl: string, vid: string) {
  const title = (await ytTitle(cleanUrl)) || "Video YouTube";
  const timed = await transcriptYouTubeTimed(cleanUrl);
  if (!timed) {
    return NextResponse.json(
      { error: "Video không có phụ đề — chưa viết post / cắt clip được." },
      { status: 422 }
    );
  }

  const { body, clip } = await generateYouTubeVideoPost({ title, timed, url: cleanUrl });

  const date = new Date().toISOString().slice(0, 10);
  const item: ContentItem = {
    id: newId("post", title, date),
    type: "post",
    content_type: "chia-se-kien-thuc",
    platform: "linkedin;threads",
    date,
    topic: title,
    status: "draft",
    posted: false,
    posted_at: null,
    parent: null,
    source_url: cleanUrl,
    first_comment: `Video đầy đủ: ${cleanUrl}`,
    body,
  };
  await saveItem(item);

  // Cắt clip SAU khi lưu post — clip lỗi thì post vẫn còn, trả lỗi kèm để xử lý tay.
  let clipFile: string | null = null;
  let clipError: string | undefined;
  if (clip) {
    try {
      clipFile = await clipYouTube(vid, clip.start, clip.end, mediaDirFor(item.id));
    } catch (e) {
      clipError = (e as Error).message;
    }
  } else {
    clipError = "AI không trả đoạn cắt hợp lệ";
  }

  return NextResponse.json({ item, clip, clipFile, clipError });
}

async function handleBuild(cleanUrl: string, vid: string, group?: { url?: string; name?: string }) {
  const title = (await ytTitle(cleanUrl)) || "Video YouTube";
  const timed = await transcriptYouTubeTimed(cleanUrl);
  if (!timed) {
    return NextResponse.json(
      { error: "Video không có phụ đề — chưa build video tóm tắt được." },
      { status: 422 }
    );
  }
  // Tải full video vào cache TRƯỚC khi enqueue: agent build chỉ việc cắt, không chờ mạng.
  await ensureYouTubeCached(vid);
  const { slug } = await enqueueYtSummaryBuild({
    url: cleanUrl,
    videoId: vid,
    title,
    transcript: timed,
    groupUrl: group?.url,
    groupName: group?.name,
  });
  return NextResponse.json({ slug });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      url?: string;
      groupUrl?: string;
      groupName?: string;
    };
    const vid = ytId((body.url || "").trim());
    if (!vid) return NextResponse.json({ error: "Link YouTube không hợp lệ" }, { status: 400 });
    const cleanUrl = `https://www.youtube.com/watch?v=${vid}`;

    const action = body.action || "post";
    if (action === "post") return await handlePost(cleanUrl, vid);
    if (action === "build")
      return await handleBuild(cleanUrl, vid, { url: body.groupUrl, name: body.groupName });
    return NextResponse.json({ error: `action không hỗ trợ: ${action}` }, { status: 400 });
  } catch (e) {
    const status = e instanceof InvalidEditParamError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

// Build xong → tạo item short chờ duyệt (1 lần duy nhất, đánh dấu itemId vào job).
async function ensureShortItem(slug: string): Promise<string | null> {
  const job = getJob(slug);
  if (!job) return null;
  if (job.itemId) return job.itemId;

  const projDir = ytSummaryProjectDir(slug);
  const src = path.join(projDir, "renders", "final.mp4");
  if (!fsSync.existsSync(src)) return null;

  let caption = "";
  try {
    caption = (await fs.readFile(path.join(projDir, "assets", "caption.txt"), "utf8")).trim();
  } catch {}
  let script = "";
  try {
    script = (await fs.readFile(path.join(projDir, "assets", "vo-script-display.txt"), "utf8")).trim();
  } catch {}

  const date = new Date().toISOString().slice(0, 10);
  const item: ContentItem = {
    id: newId("short", job.topic || slug, date),
    type: "short",
    content_type: "chia-se-kien-thuc",
    platform: "facebook;instagram;tiktok;youtube",
    date,
    topic: job.topic || "Video tóm tắt YouTube",
    status: "draft",
    posted: false,
    posted_at: null,
    parent: null,
    publish_caption: caption || undefined,
    edit_state: "ready",
    source_url: job.url,
    first_comment: `Video đầy đủ: ${job.url}`,
    body: script || caption || "(video tóm tắt)",
  };
  await saveItem(item);
  const dstDir = mediaDirFor(item.id);
  await fs.mkdir(dstDir, { recursive: true });
  await fs.copyFile(src, path.join(dstDir, "final.mp4"));
  attachJobItem(slug, item.id);
  return item.id;
}

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (slug) {
      if (!/^ys-\d+$/.test(slug)) return NextResponse.json({ error: "slug không hợp lệ" }, { status: 400 });
      const build = await getDailyNewsBuild(slug);
      let itemId: string | null = null;
      if (build.state === "done") {
        try {
          itemId = await ensureShortItem(slug);
        } catch (e) {
          return NextResponse.json({ ...build, itemId: null, itemError: (e as Error).message });
        }
      }
      return NextResponse.json({ ...build, itemId });
    }
    return NextResponse.json({ jobs: await listDailyNewsJobs(10, "ys-") });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
