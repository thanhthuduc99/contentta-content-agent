import { NextRequest, NextResponse } from "next/server";
import { listPublishedPosts } from "@/lib/zernio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const accountId = req.nextUrl.searchParams.get("accountId") || undefined;
    const posts = await listPublishedPosts({ accountId });
    return NextResponse.json({ posts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
