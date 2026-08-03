import { NextRequest, NextResponse } from "next/server";
import { handleComment } from "@/lib/auto-react";
import { wasProcessed, markProcessed } from "@/lib/comment-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      event?: string;
      timestamp?: string | number;
      data?: Record<string, any>;
    };

    if (body?.event !== "comment.received") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const data = body.data || {};
    const commentId = data.comment?.id || data.commentId || data.id;
    const postId = data.postId || data.post?.id || data.comment?.postId;
    const accountId = data.accountId || data.comment?.accountId;
    const text =
      data.comment?.content || data.comment?.text || data.content || data.text;
    const platform = data.platform;

    if (postId && commentId && accountId && text) {
      if (await wasProcessed(String(commentId))) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      const result = await handleComment({
        postId: String(postId),
        commentId: String(commentId),
        accountId: String(accountId),
        text: String(text),
        platform: platform ? String(platform) : undefined,
      });
      await markProcessed(String(commentId));
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: true, skipped: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
