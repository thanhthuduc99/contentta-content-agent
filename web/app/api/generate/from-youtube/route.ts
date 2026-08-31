import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { generateYouTubePost } from "@/lib/claude";
import { transcriptYouTube, ytId, ytTitle } from "@/lib/research";
import { saveItem, newId, type ContentItem } from "@/lib/content";
import { mediaDirFor } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Tải thumbnail YouTube về media của item. maxres có thể 404 hoặc trả placeholder nhỏ → fallback hq.
async function fetchThumbnail(videoId: string, itemId: string): Promise<boolean> {
  for (const name of ["maxresdefault", "hqdefault"]) {
    try {
      const r = await fetch(`https://img.youtube.com/vi/${videoId}/${name}.jpg`);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5_000) continue; // placeholder xám của YouTube
      const dir = mediaDirFor(itemId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "thumbnail.jpg"), buf);
      return true;
    } catch {
      /* thử ảnh tiếp theo */
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string };
    const vid = ytId((url || "").trim());
    if (!vid) return NextResponse.json({ error: "Link YouTube không hợp lệ" }, { status: 400 });

    const cleanUrl = `https://www.youtube.com/watch?v=${vid}`;
    const title = (await ytTitle(cleanUrl)) || "Video YouTube";
    const transcript = await transcriptYouTube(cleanUrl);
    if (!transcript) {
      return NextResponse.json(
        { error: "Video không có phụ đề — dùng tab Thủ công để dán nội dung." },
        { status: 422 }
      );
    }

    const { body, threads } = await generateYouTubePost({ title, transcript, url: cleanUrl });

    const date = new Date().toISOString().slice(0, 10);
    const item: ContentItem = {
      id: newId("post", title, date),
      type: "post",
      content_type: "chia-se-kien-thuc",
      platform: "facebook;linkedin;threads",
      date,
      topic: title,
      status: "draft",
      posted: false,
      posted_at: null,
      parent: null,
      threads,
      source_url: cleanUrl,
      body,
    };
    await saveItem(item);
    const thumbnail = await fetchThumbnail(vid, item.id);

    return NextResponse.json({ item, thumbnail });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
