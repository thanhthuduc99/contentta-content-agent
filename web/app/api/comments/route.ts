import { NextRequest, NextResponse } from "next/server";
import {
  COMMENT_PLATFORMS,
  getPostComments,
  listPlatformComments,
  replyToComment,
  type CommentPlatform,
} from "@/lib/zernio";
import { getCachedTiktokComments, refreshTiktokComments } from "@/lib/tiktok-comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function asPlatform(v: string | null): CommentPlatform | null {
  return (COMMENT_PLATFORMS as readonly string[]).includes(v || "") ? (v as CommentPlatform) : null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const raw = q.get("platform");
  try {
    // TikTok: Zernio không hỗ trợ → cache Apify, chỉ quét khi bấm nút (tốn tiền).
    if (raw === "tiktok") {
      const cache = q.get("rescan") === "1" ? await refreshTiktokComments() : await getCachedTiktokComments();
      return NextResponse.json({ tiktok: cache });
    }
    const platform = asPlatform(raw);
    if (!platform) {
      return NextResponse.json(
        { error: `platform phải là một trong: ${COMMENT_PLATFORMS.join(", ")}, tiktok` },
        { status: 400 }
      );
    }
    return NextResponse.json(await listPlatformComments(platform));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const postId = String(body.postId || "");
    const accountId = String(body.accountId || "");
    const message = String(body.message || "").trim();
    if (!postId || !accountId) return NextResponse.json({ error: "thiếu postId/accountId" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "thiếu nội dung reply" }, { status: 400 });

    await replyToComment({
      postId,
      accountId,
      commentId: body.commentId ? String(body.commentId) : undefined,
      message,
    });
    // Trả lại thread mới để UI cập nhật tại chỗ, khỏi tải lại cả feed.
    const comments = await getPostComments(postId, accountId, {
      platform: String(body.platform || ""),
      postContent: body.postContent ? String(body.postContent) : "",
      postPicture: body.postPicture ? String(body.postPicture) : null,
      postUrl: body.postUrl ? String(body.postUrl) : null,
    });
    return NextResponse.json({ ok: true, comments });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
