import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getItem, saveItem } from "@/lib/content";
import { CONTENT_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { id, scheduledTime? } → đánh dấu đã đăng/đã lên lịch + ghi post-log.md.
export async function POST(req: NextRequest) {
  try {
    const { id, scheduledTime } = (await req.json()) as {
      id: string;
      scheduledTime?: string;
    };
    const item = await getItem(id);
    if (!item) return NextResponse.json({ error: "không tìm thấy" }, { status: 404 });

    const when = scheduledTime || new Date().toISOString();
    item.posted = true;
    item.posted_at = when;
    // Luôn set publish_at để item lên calendar: đăng ngay = giờ hiện tại, hẹn lịch = giờ hẹn.
    item.publish_at = when;
    item.status = scheduledTime ? "scheduled" : "published";
    await saveItem(item);

    const log = path.join(CONTENT_DIR, "post-log.md");
    const line = `- ${when} — ${item.type} — ${item.topic || item.id} (${item.id})\n`;
    await fs.appendFile(log, line, "utf8");

    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
