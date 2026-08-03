import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import { zfetchWith, getAccountMap } from "./zernio";

export type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "linkedin";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
};
const mimeOf = (p: string) => MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
const isVideo = (p: string) => mimeOf(p).startsWith("video/");

// Presign → PUT bytes → publicUrl. Media upload vào workspace của key sẽ đăng.
async function presignUpload(key: string, file: string): Promise<{ url: string; type: "image" | "video" }> {
  const bytes = await fs.readFile(file);
  const r = await zfetchWith<{ uploadUrl: string; publicUrl: string }>(key, "POST", "/media/presign", {
    body: { filename: path.basename(file), contentType: mimeOf(file), size: bytes.length },
  });
  const put = await fetch(r.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeOf(file) },
    body: bytes,
  });
  if (!put.ok) throw new Error(`PUT media ${put.status}`);
  return { url: r.publicUrl, type: isVideo(file) ? "video" : "image" };
}

type PublishResult = { status: string; [k: string]: unknown };

export type PublishInput = {
  mediaPaths: string[];
  caption: string;
  platforms?: Platform[];
  scheduledTime?: string; // ISO
  youtube?: { playlistId?: string; title?: string };
};

// Đăng qua Zernio. Group platform theo key (workspace), mỗi key 1 call POST /v1/posts.
export async function zernioPublish(input: PublishInput): Promise<Record<string, unknown>> {
  const { mediaPaths, caption, platforms, scheduledTime, youtube } = input;
  const wanted = (platforms && platforms.length ? platforms : (["facebook", "instagram", "tiktok", "youtube", "linkedin"] as Platform[]));

  let accMap: Record<string, { key: string; accountId: string }>;
  try {
    accMap = await getAccountMap();
  } catch (e) {
    return { status: "failed", reason: `Không lấy được account Zernio: ${(e as Error).message}` };
  }

  const result: Record<string, unknown> = { status: "ok" };

  // Group platform theo key.
  const byKey = new Map<string, Platform[]>();
  for (const p of wanted) {
    const acc = accMap[p];
    if (!acc) {
      result[p] = { status: "skipped", reason: `chưa kết nối ${p} trong Zernio` };
      continue;
    }
    byKey.set(acc.key, [...(byKey.get(acc.key) || []), p]);
  }

  for (const [key, plats] of byKey) {
    let mediaItems: { type: string; url: string }[] = [];
    try {
      mediaItems = await Promise.all(mediaPaths.map((f) => presignUpload(key, f)));
    } catch (e) {
      for (const p of plats) result[p] = { status: "failed", reason: `upload media lỗi: ${(e as Error).message}` };
      continue;
    }

    const hasTiktok = plats.includes("tiktok");
    // Setting riêng từng nền tảng đi trong platforms[].platformSpecificData. Root-level chỉ
    // có tiktokSettings/facebookSettings trong schema Zernio — youtubeSettings ở root bị bỏ qua.
    const body: Record<string, unknown> = {
      content: caption,
      mediaItems,
      platforms: plats.map((p) => ({
        platform: p,
        accountId: accMap[p].accountId,
        ...(p === "youtube"
          ? {
              platformSpecificData: {
                title: (youtube?.title || caption.split("\n", 1)[0] || "Video").trim().slice(0, 95),
                ...(youtube?.playlistId ? { playlistId: youtube.playlistId } : {}),
              },
            }
          : {}),
      })),
      timezone: "Asia/Bangkok",
    };
    // Zernio: nếu KHÔNG có scheduledFor/publishNow thì post mặc định thành DRAFT (không đăng lên page).
    // scheduledTime ở tương lai → hẹn lịch; còn lại (rỗng/quá khứ/gần bây giờ) → đăng ngay.
    if (scheduledTime && new Date(scheduledTime).getTime() > Date.now() + 60_000) {
      body.scheduledFor = scheduledTime;
    } else {
      body.publishNow = true;
    }
    if (hasTiktok) {
      body.tiktokSettings = {
        privacyLevel: "PUBLIC_TO_EVERYONE",
        allowComment: true,
        contentPreviewConfirmed: true,
        expressConsentGiven: true,
      };
    }

    try {
      const resp = await zfetchWith<{ post?: { platforms?: { platform: string; status: string; platformPostUrl?: string; platformPostId?: string; error?: string }[] } }>(
        key,
        "POST",
        "/posts",
        { body }
      );
      const rp = resp.post?.platforms || [];
      // platformPostId để scope rule Comment-to-DM đúng bài. Chỉ có khi đăng ngay;
      // bài hẹn lịch chưa lên nền tảng nên Zernio không trả id.
      for (const p of plats) {
        const hit = rp.find((x) => x.platform === p);
        result[p] = hit
          ? {
              status: hit.status === "failed" ? "failed" : "ok",
              url: hit.platformPostUrl,
              platformPostId: hit.platformPostId,
              reason: hit.error,
            }
          : { status: "ok" };
      }
    } catch (e) {
      const msg = (e as Error).message;
      for (const p of plats) result[p] = { status: "failed", reason: msg.slice(0, 200) } as PublishResult;
    }
  }

  return result;
}
