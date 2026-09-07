import { NextRequest, NextResponse } from "next/server";
import fsSync from "node:fs";
import path from "node:path";
import { DAILY_NEWS_DIR, YT_SUMMARY_DIR } from "@/lib/edit";
import { serveFile } from "@/lib/serve-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// Stream final.mp4 của 1 build cho <video> preview.
// Slug ys-* nằm ở sandbox yt-summary, dn-* ở daily-news (2 sandbox, chung hàng đợi).
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!SAFE_SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "slug không hợp lệ" }, { status: 400 });
  }
  const base = path.join(slug.startsWith("ys-") ? YT_SUMMARY_DIR : DAILY_NEWS_DIR, "video-projects");
  const file = path.join(base, slug, "renders", "final.mp4");
  if (!file.startsWith(base) || !fsSync.existsSync(file)) {
    return NextResponse.json({ error: "chưa có video" }, { status: 404 });
  }
  return serveFile(req, file, "video/mp4");
}
