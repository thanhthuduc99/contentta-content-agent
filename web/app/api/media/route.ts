import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "@/lib/paths";
import { serveFile } from "@/lib/serve-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safe(id: string): string {
  return id.replace(/\//g, "__").replace(/[^a-zA-Z0-9._-]/g, "_");
}
function dirFor(id: string): string {
  return path.join(MEDIA_DIR, safe(id));
}

const CT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

// GET ?id=..        → { files: string[] }
// GET ?id=..&file=. → stream file (preview)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const file = req.nextUrl.searchParams.get("file");
  if (!id) return NextResponse.json({ error: "thiếu id" }, { status: 400 });
  const dir = dirFor(id);

  if (file) {
    try {
      return await serveFile(
        req,
        path.join(dir, path.basename(file)),
        CT[path.extname(file).toLowerCase()] || "application/octet-stream"
      );
    } catch {
      return NextResponse.json({ error: "không thấy file" }, { status: 404 });
    }
  }

  try {
    const files = (await fs.readdir(dir)).filter((f) => !f.startsWith("."));
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}

// POST multipart: id + files[]  → lưu vào content/_media/<id>/
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const id = form.get("id");
    if (typeof id !== "string") return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    const dir = dirFor(id);
    await fs.mkdir(dir, { recursive: true });

    const saved: string[] = [];
    for (const entry of form.getAll("files")) {
      if (!(entry instanceof File)) continue;
      const name = path.basename(entry.name).replace(/[^a-zA-Z0-9._-]/g, "_");
      const buf = Buffer.from(await entry.arrayBuffer());
      await fs.writeFile(path.join(dir, name), buf);
      saved.push(name);
    }
    return NextResponse.json({ saved });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE ?id=..&file=..  → xóa 1 media
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const file = req.nextUrl.searchParams.get("file");
  if (!id || !file) return NextResponse.json({ error: "thiếu id/file" }, { status: 400 });
  try {
    await fs.unlink(path.join(dirFor(id), path.basename(file)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "xóa lỗi" }, { status: 404 });
  }
}
