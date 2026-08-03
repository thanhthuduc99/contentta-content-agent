import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "@/lib/paths";
import { getItem } from "@/lib/content";
import { generateImages } from "@/lib/imagegen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safe(id: string): string {
  return id.replace(/\//g, "__").replace(/[^a-zA-Z0-9._-]/g, "_");
}

// POST { id } → Claude design + Satori render (KHÔNG Gemini) theo loại content.
// youtube → 1 thumbnail (có mặt) ; nhan-tai-lieu → 1 card ; chia-se-kien-thuc → carousel.
export async function POST(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id: string };
    if (!id) return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    const item = await getItem(id);
    if (!item) return NextResponse.json({ error: "không tìm thấy bài" }, { status: 404 });

    const result = await generateImages({
      type: item.type,
      content_type: item.content_type,
      topic: item.topic,
      body: item.body,
    });

    const dir = path.join(MEDIA_DIR, safe(id));
    await fs.mkdir(dir, { recursive: true });

    const files: string[] = [];
    if (result.kind === "carousel") {
      for (let i = 0; i < result.buffers.length; i++) {
        const name = `slide-${i + 1}.png`;
        await fs.writeFile(path.join(dir, name), result.buffers[i]);
        files.push(name);
      }
    } else {
      const name = "cover.png";
      await fs.writeFile(path.join(dir, name), result.buffers[0]);
      files.push(name);
    }

    return NextResponse.json({ kind: result.kind, files });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
