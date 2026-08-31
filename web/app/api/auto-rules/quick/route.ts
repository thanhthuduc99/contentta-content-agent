import { NextRequest, NextResponse } from "next/server";
import {
  createNativeAutomation,
  waitForPlatformPostId,
} from "@/lib/comment-automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tạo nhanh native Comment-to-DM sau khi đăng.
// Không bao giờ fallback sang rule account-wide khi thiếu post ID.
export async function POST(req: NextRequest) {
  try {
    const { keyword, message, commentReply, targets, postIds, platforms } = (await req.json()) as {
      keyword?: string;
      message?: string;
      commentReply?: string;
      targets?: Record<string, {
        accountId?: string;
        postId?: string;
        platformPostId?: string;
        postTitle?: string;
      }>;
      postIds?: Record<string, string>;
      platforms?: string[];
    };
    if (!keyword?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "thiếu keyword/message" }, { status: 400 });
    }
    const normalized = targets || Object.fromEntries(
      (platforms || Object.keys(postIds || {})).map((platform) => [platform, {
        platformPostId: postIds?.[platform],
      }])
    );
    const accountMap = new Map<string, { accountId: string; platform: string }>();
    const { listAccountsAll } = await import("@/lib/zernio");
    for (const account of await listAccountsAll()) {
      const platform = account.platform.toLowerCase();
      if (!accountMap.has(platform)) accountMap.set(platform, account);
    }

    let created = 0;
    const errors: string[] = [];
    for (const [rawPlatform, target] of Object.entries(normalized)) {
      // Key có thể là slot "instagram2" (account Instagram thứ hai) - cắt số đuôi lấy platform.
      const platform = rawPlatform.toLowerCase().replace(/\d+$/, "");
      if (platform !== "facebook" && platform !== "instagram") continue;
      const account = target.accountId
        ? { accountId: target.accountId, platform }
        : accountMap.get(platform);
      if (!account) {
        errors.push(`${platform}: chưa kết nối account`);
        continue;
      }
      if (!target.postId) {
        errors.push(`${platform}: thiếu Zernio post ID`);
        continue;
      }
      try {
        const platformPostId = await waitForPlatformPostId(
          account.accountId,
          target.postId,
          platform,
          target.platformPostId
        );
        await createNativeAutomation({
          accountId: account.accountId,
          platform,
          postId: target.postId,
          platformPostId,
          postTitle: target.postTitle,
          keywords: [keyword],
          dmMessage: message,
          commentReply,
          name: `Comment to DM · ${platform}`,
        });
        created++;
      } catch (e) {
        const err = e as Error & { status?: number };
        errors.push(
          err.status === 409
            ? `${platform}: automation cho post này đã tồn tại.`
            : `${platform}: ${err.message}`
        );
      }
    }
    return NextResponse.json({ created, errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
