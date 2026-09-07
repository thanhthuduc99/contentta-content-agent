import { NextRequest, NextResponse } from "next/server";
import {
  getDailyNewsBuild,
  enqueueDailyNewsBuild,
  listDailyNewsJobs,
  tickQueue,
  publishDailyNews,
  generateDailyNewsCaption,
  generateDailyNewsAutoDm,
  setDailyNewsPublished,
  InvalidEditParamError,
} from "@/lib/edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET (không slug) → trạng thái chung + hàng đợi job. GET ?slug=... → trạng thái 1 build.
// Cả hai đều tick hàng đợi trước: page poll 4s/lần nên hàng đợi tự chạy tiếp sau khi
// restart server 8502, không cần worker riêng.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  try {
    tickQueue();
  } catch {}
  if (slug) {
    try {
      return NextResponse.json(await getDailyNewsBuild(slug));
    } catch (e) {
      const status = e instanceof InvalidEditParamError ? 400 : 500;
      return NextResponse.json({ error: (e as Error).message }, { status });
    }
  }
  return NextResponse.json({ jobs: await listDailyNewsJobs() });
}

// POST action=build → xếp job vào hàng đợi (trả slug ngay). action=publish → đăng Zernio.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as "build" | "publish" | "caption" | "autodm" | "mark";

    if (action === "build") {
      const res = await enqueueDailyNewsBuild(String(body.info || ""), String(body.keyword || ""));
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "caption") {
      const caption = await generateDailyNewsCaption(String(body.slug || ""));
      return NextResponse.json({ ok: true, caption });
    }

    if (action === "autodm") {
      const autoDm = await generateDailyNewsAutoDm(String(body.slug || ""));
      return NextResponse.json({ ok: true, autoDm });
    }

    // Đánh dấu tay đã đăng / chưa đăng (video đăng ngoài app, hoặc bấm nhầm).
    if (action === "mark") {
      setDailyNewsPublished(String(body.slug || ""), body.published !== false);
      return NextResponse.json({ ok: true });
    }

    if (action === "publish") {
      const autoDmBody = body.autoDm as
        | { keyword?: string; link?: string; dmMessage?: string; commentReply?: string }
        | undefined;
      const result = await publishDailyNews({
        slug: String(body.slug || ""),
        caption: String(body.caption || ""),
        platforms: body.platforms as string[] | undefined,
        scheduledTime: body.scheduledTime || undefined,
        playlistId: body.playlistId || undefined,
        autoDm:
          autoDmBody && autoDmBody.keyword && autoDmBody.dmMessage
            ? {
                keyword: String(autoDmBody.keyword),
                link: String(autoDmBody.link || ""),
                dmMessage: String(autoDmBody.dmMessage),
                commentReply: String(autoDmBody.commentReply || ""),
              }
            : undefined,
      });
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ error: "action phải là 'build', 'caption', 'autodm', 'mark' hoặc 'publish'" }, { status: 400 });
  } catch (e) {
    const status = e instanceof InvalidEditParamError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
