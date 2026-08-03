import { NextRequest, NextResponse } from "next/server";
import { createCommentToDmRules } from "@/lib/auto-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tạo nhanh rule Comment-to-DM sau khi đăng. postIds = { facebook: "<platformPostId>", ... }
// để rule chỉ áp đúng bài vừa đăng; platforms = danh sách platform user đã tick.
export async function POST(req: NextRequest) {
  try {
    const { keyword, message, commentReply, react, postIds, platforms } = (await req.json()) as {
      keyword?: string;
      message?: string;
      commentReply?: string;
      react?: boolean;
      postIds?: Record<string, string>;
      platforms?: string[];
    };
    if (!keyword?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "thiếu keyword/message" }, { status: 400 });
    }
    const created = await createCommentToDmRules(
      { keyword, message, commentReply, react, postIds },
      platforms?.length ? platforms : ["facebook", "instagram"]
    );
    return NextResponse.json({ created });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
