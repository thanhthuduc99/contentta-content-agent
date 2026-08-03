import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { DAILY_NEWS_DIR } from "@/lib/edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// Stream final.mp4 của 1 build cho <video> preview. Hỗ trợ Range để tua.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!SAFE_SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "slug không hợp lệ" }, { status: 400 });
  }
  const file = path.join(DAILY_NEWS_DIR, "video-projects", slug, "renders", "final.mp4");
  if (!file.startsWith(path.join(DAILY_NEWS_DIR, "video-projects")) || !fsSync.existsSync(file)) {
    return NextResponse.json({ error: "chưa có video" }, { status: 404 });
  }
  const size = fsSync.statSync(file).size;
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    const chunk = await fs.readFile(file);
    return new NextResponse(chunk.subarray(start, end + 1), {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
      },
    });
  }
  const data = await fs.readFile(file);
  return new NextResponse(data, {
    status: 200,
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Accept-Ranges": "bytes" },
  });
}
