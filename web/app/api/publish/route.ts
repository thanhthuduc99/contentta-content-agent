import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { MEDIA_DIR } from "@/lib/paths";
import { zernioPublish, type Platform } from "@/lib/zernio-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safe(id: string): string {
  return id.replace(/\//g, "__").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: NextRequest) {
  try {
    const { id, files, platforms, accountIds, scheduledTime, caption, playlistId, firstComment } =
      (await req.json()) as {
        id: string;
        files: string[];
        platforms?: Platform[];
        accountIds?: string[];
        scheduledTime?: string;
        caption: string;
        playlistId?: string;
        firstComment?: string;
      };

    if (!caption?.trim()) {
      return NextResponse.json({ error: "thiếu caption" }, { status: 400 });
    }
    if (playlistId && !/^[A-Za-z0-9_-]{10,64}$/.test(playlistId)) {
      return NextResponse.json({ error: "playlistId không hợp lệ" }, { status: 400 });
    }
    if (accountIds && (!Array.isArray(accountIds) || accountIds.some((a) => typeof a !== "string"))) {
      return NextResponse.json({ error: "accountIds phải là mảng string" }, { status: 400 });
    }
    const dir = path.join(MEDIA_DIR, safe(id));
    const mediaPaths = (files || []).map((f) => path.join(dir, path.basename(f)));

    const result = await zernioPublish({
      mediaPaths,
      caption,
      platforms,
      accountIds,
      scheduledTime: scheduledTime || undefined,
      youtube: playlistId ? { playlistId } : undefined,
      firstComment,
    });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
