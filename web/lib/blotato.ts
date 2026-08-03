import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_BASE = "https://backend.blotato.com/v2";
const TIKTOK_W = 1080;
const TIKTOK_H = 1920;
const THREADS_MAX = 500;

export type Platform =
  | "facebook"
  | "instagram"
  | "instagram2"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "threads";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

function mimeOf(p: string): string {
  return MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
}
function isVideo(p: string): boolean {
  return mimeOf(p).startsWith("video/");
}

function headers(apiKey: string) {
  return { "blotato-api-key": apiKey, "Content-Type": "application/json" };
}

function env(name: string): string {
  return (process.env[name] || "").trim();
}

// Pad ảnh thành 1080x1920 nền đen cho TikTok. Video pass-through.
async function padForTiktok(file: string): Promise<string> {
  if (isVideo(file)) return file;
  const out = path.join(
    path.dirname(file),
    `tt_${path.basename(file, path.extname(file))}.jpg`
  );
  await sharp(file)
    .resize(TIKTOK_W, TIKTOK_H, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0 },
    })
    .jpeg({ quality: 92 })
    .toFile(out);
  return out;
}

async function uploadMedia(file: string, apiKey: string, base: string): Promise<string> {
  const r = await fetch(`${base}/media/uploads`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ filename: path.basename(file) }),
  });
  if (!r.ok) throw new Error(`media/uploads ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const { presignedUrl, publicUrl } = (await r.json()) as {
    presignedUrl: string;
    publicUrl: string;
  };
  const bytes = await fs.readFile(file);
  const put = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeOf(file) },
    body: bytes,
  });
  if (!put.ok) throw new Error(`presigned PUT ${put.status}`);
  return publicUrl;
}

type PublishResult = { status: string; [k: string]: unknown };

async function publishOne(
  apiKey: string,
  base: string,
  accountId: string,
  platform: string,
  caption: string,
  mediaUrls: string[],
  target: Record<string, unknown>,
  scheduledTime?: string
): Promise<PublishResult> {
  const payload: Record<string, unknown> = {
    post: {
      accountId: String(accountId),
      content: { text: caption, mediaUrls, platform },
      target,
    },
  };
  if (scheduledTime) payload.scheduledTime = scheduledTime;
  const r = await fetch(`${base}/posts`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(payload),
  });
  if (!r.ok) return { status: "failed", code: r.status, body: (await r.text()).slice(0, 500) };
  try {
    return { status: "ok", data: await r.json() };
  } catch {
    return { status: "ok" };
  }
}

// Threads khác: ≤500 ký tự, strip hashtag.
export function adaptThreads(caption: string): string {
  const noTags = caption.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\n{3,}/g, "\n\n").trim();
  return noTags.length > THREADS_MAX ? noTags.slice(0, THREADS_MAX - 1).trimEnd() + "…" : noTags;
}

export type PublishInput = {
  mediaPaths: string[];
  caption: string;
  threadsCaption?: string;
  platforms?: Platform[];
  scheduledTime?: string; // ISO 8601
};

export async function publish(input: PublishInput): Promise<Record<string, unknown>> {
  const { mediaPaths, caption, threadsCaption, platforms, scheduledTime } = input;
  const apiKey = env("BLOTATO_API_KEY");
  const base = (env("BLOTATO_API_BASE") || DEFAULT_BASE).replace(/\/$/, "");
  if (!apiKey || apiKey.startsWith("your_")) {
    return { status: "skipped", reason: "BLOTATO_API_KEY chưa cấu hình" };
  }

  const accs = {
    facebook: [env("BLOTATO_FACEBOOK_ACCOUNT_ID"), env("BLOTATO_FACEBOOK_PAGE_ID")] as const,
    instagram: env("BLOTATO_INSTAGRAM_ACCOUNT_ID"),
    instagram2: env("BLOTATO_INSTAGRAM2_ACCOUNT_ID"),
    tiktok: env("BLOTATO_TIKTOK_ACCOUNT_ID"),
    linkedin: env("BLOTATO_LINKEDIN_ACCOUNT_ID"),
    youtube: env("BLOTATO_YOUTUBE_ACCOUNT_ID"),
    threads: env("BLOTATO_THREADS_ACCOUNT_ID"),
  };

  const requested = new Set<Platform>(
    platforms && platforms.length ? platforms : (Object.keys(accs) as Platform[])
  );
  const hasVideo = mediaPaths.some(isVideo);

  let mediaUrls: string[];
  try {
    mediaUrls = await Promise.all(mediaPaths.map((p) => uploadMedia(p, apiKey, base)));
  } catch (e) {
    return { status: "failed", reason: `Upload media lỗi: ${(e as Error).message}` };
  }

  const result: Record<string, unknown> = {
    status: "ok",
    media_count: mediaUrls.length,
  };

  if (requested.has("facebook")) {
    const [acc, page] = accs.facebook;
    result.facebook =
      acc && page
        ? await publishOne(apiKey, base, acc, "facebook", caption, mediaUrls, { targetType: "facebook", pageId: page }, scheduledTime)
        : { status: "skipped", reason: "thiếu FB accountId/pageId" };
  }

  if (requested.has("instagram")) {
    result.instagram = accs.instagram
      ? await publishOne(apiKey, base, accs.instagram, "instagram", caption, mediaUrls, hasVideo ? { targetType: "instagram", mediaType: "reel" } : { targetType: "instagram" }, scheduledTime)
      : { status: "skipped", reason: "thiếu IG accountId" };
  }

  if (requested.has("instagram2")) {
    // Kênh IG thứ 2 — platform string vẫn "instagram", chỉ khác accountId.
    result.instagram2 = accs.instagram2
      ? await publishOne(apiKey, base, accs.instagram2, "instagram", caption, mediaUrls, hasVideo ? { targetType: "instagram", mediaType: "reel" } : { targetType: "instagram" }, scheduledTime)
      : { status: "skipped", reason: "thiếu BLOTATO_INSTAGRAM2_ACCOUNT_ID" };
  }

  if (requested.has("threads")) {
    result.threads = accs.threads
      ? await publishOne(apiKey, base, accs.threads, "threads", adaptThreads(threadsCaption || caption), mediaUrls, { targetType: "threads" }, scheduledTime)
      : { status: "skipped", reason: "thiếu Threads accountId (thêm BLOTATO_THREADS_ACCOUNT_ID vào .env)" };
  }

  if (requested.has("linkedin")) {
    result.linkedin = accs.linkedin
      ? await publishOne(apiKey, base, accs.linkedin, "linkedin", caption, mediaUrls, { targetType: "linkedin" }, scheduledTime)
      : { status: "skipped", reason: "thiếu LinkedIn accountId" };
  }

  if (requested.has("tiktok")) {
    if (!accs.tiktok) {
      result.tiktok = { status: "skipped", reason: "thiếu TikTok accountId" };
    } else {
      try {
        const ttPaths = await Promise.all(mediaPaths.map(padForTiktok));
        const changed = ttPaths.some((p, i) => p !== mediaPaths[i]);
        const ttUrls = changed
          ? await Promise.all(ttPaths.map((p) => uploadMedia(p, apiKey, base)))
          : mediaUrls;
        result.tiktok = await publishOne(apiKey, base, accs.tiktok, "tiktok", caption, ttUrls, {
          targetType: "tiktok",
          privacyLevel: "PUBLIC_TO_EVERYONE",
          disabledComments: false,
          disabledDuet: false,
          disabledStitch: false,
          isBrandedContent: false,
          isYourBrand: false,
          isAiGenerated: false,
          autoAddMusic: false,
        }, scheduledTime);
      } catch (e) {
        result.tiktok = { status: "failed", reason: `Chuẩn bị media TikTok lỗi: ${(e as Error).message}` };
      }
    }
  }

  if (requested.has("youtube")) {
    if (!accs.youtube) {
      result.youtube = { status: "skipped", reason: "thiếu YouTube accountId" };
    } else if (!hasVideo) {
      result.youtube = { status: "skipped", reason: "YouTube cần video, không nhận ảnh" };
    } else {
      const title = (caption.split("\n", 1)[0] || "").trim().slice(0, 95) || "Untitled";
      result.youtube = await publishOne(apiKey, base, accs.youtube, "youtube", caption, mediaUrls, {
        targetType: "youtube",
        title,
        privacyStatus: "public",
        shouldNotifySubscribers: true,
        isShorts: true,
      }, scheduledTime);
    }
  }

  return result;
}
