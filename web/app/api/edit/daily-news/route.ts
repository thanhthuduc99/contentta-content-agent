import { NextRequest, NextResponse } from "next/server";
import {
  getDailyNewsStatus,
  getDailyNewsBuild,
  startDailyNewsBuild,
  publishDailyNews,
  generateDailyNewsCaption,
  InvalidEditParamError,
} from "@/lib/edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET (không slug) → trạng thái chung. GET ?slug=... → trạng thái 1 build đang chạy.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (slug) {
    try {
      return NextResponse.json(await getDailyNewsBuild(slug));
    } catch (e) {
      const status = e instanceof InvalidEditParamError ? 400 : 500;
      return NextResponse.json({ error: (e as Error).message }, { status });
    }
  }
  return NextResponse.json(await getDailyNewsStatus());
}

// POST action=build → spawn build detached (trả slug ngay). action=publish → đăng Blotato.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as "build" | "publish" | "caption";

    if (action === "build") {
      const slug = `dn-${Date.now()}`;
      const res = await startDailyNewsBuild(String(body.info || ""), slug);
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "caption") {
      const caption = await generateDailyNewsCaption(String(body.slug || ""));
      return NextResponse.json({ ok: true, caption });
    }

    if (action === "publish") {
      const result = await publishDailyNews({
        slug: String(body.slug || ""),
        caption: String(body.caption || ""),
        platforms: body.platforms as string[] | undefined,
        scheduledTime: body.scheduledTime || undefined,
        playlistId: body.playlistId || undefined,
      });
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ error: "action phải là 'build', 'caption' hoặc 'publish'" }, { status: 400 });
  } catch (e) {
    const status = e instanceof InvalidEditParamError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
