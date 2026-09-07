import { NextRequest, NextResponse } from "next/server";
import { generate, type GenerateInput } from "@/lib/claude";
import { saveItem, newId, type ContentItem } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const input = (await req.json()) as GenerateInput & {
      save?: boolean;
      manual?: boolean;
      body?: string;
      publish_caption?: string;
    };
    if (!input.topic?.trim()) {
      return NextResponse.json({ error: "thiếu chủ đề" }, { status: 400 });
    }
    let body: string;
    if (input.manual) {
      if (!input.body?.trim()) {
        return NextResponse.json({ error: "thiếu nội dung dán vào" }, { status: 400 });
      }
      body = input.body.trim();
    } else {
      ({ body } = await generate(input));
    }

    const date = new Date().toISOString().slice(0, 10);
    // Đích dự kiến, item editor đọc field này để tick sẵn nền tảng lúc đăng.
    const platform =
      input.type === "youtube"
        ? "youtube"
        : input.type === "short"
        ? "facebook;instagram;tiktok;youtube"
        : "facebook;linkedin;threads";
    const item: ContentItem = {
      id: newId(input.type, input.topic, date),
      type: input.type,
      content_type: input.content_type,
      platform,
      date,
      topic: input.topic,
      status: "draft",
      posted: false,
      posted_at: null,
      parent: null,
      publish_caption: input.publish_caption?.trim() || undefined,
      body,
    };
    if (input.save !== false) await saveItem(item);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
