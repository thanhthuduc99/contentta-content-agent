import { NextRequest, NextResponse } from "next/server";
import { generateSharePost } from "@/lib/claude";
import { transcriptYouTube, ytId, ytTitle } from "@/lib/research";
import { saveItem, newId, type ContentItem } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { url, text, keyword } = (await req.json()) as {
      url?: string;
      text?: string;
      keyword?: string;
    };
    const kw = (keyword || "").trim();
    const u = (url || "").trim();
    const t = (text || "").trim();
    if (!u && !t) return NextResponse.json({ error: "Thiếu nội dung hoặc link nguồn" }, { status: 400 });

    let source: string | undefined = t || undefined;
    let topic = t.slice(0, 60) || "post chia sẻ";
    if (u && ytId(u)) {
      // YouTube → transcript làm nguồn (đỡ phải web fetch)
      const tr = await transcriptYouTube(u);
      const title = await ytTitle(u);
      if (title) topic = title;
      if (tr) source = tr;
    } else if (u) {
      try {
        topic = new URL(u).hostname + new URL(u).pathname.slice(0, 40);
      } catch {
        /* keep */
      }
    }

    const { body, threads } = await generateSharePost({
      source,
      url: u || undefined,
      keyword: kw || undefined,
    });

    const date = new Date().toISOString().slice(0, 10);
    const item: ContentItem = {
      id: newId("post", topic, date),
      type: "post",
      // chia-se-kien-thuc → nút "Tạo ảnh carousel (Claude)" đi đường renderSlide (carousel).
      content_type: "chia-se-kien-thuc",
      platform: "facebook;linkedin;threads",
      date,
      topic,
      status: "draft",
      posted: false,
      posted_at: null,
      parent: null,
      threads,
      source_url: u || undefined,
      // Chỉ LƯU keyword để editor prefill. Rule Comment-to-DM tạo lúc đăng, không tạo ở đây.
      cta_keyword: kw || undefined,
      body,
    };
    await saveItem(item);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
