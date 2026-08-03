import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import { runActor } from "./apify";

// yt-dlp vỡ extractor TikTok (2026-07) → mọi thao tác TikTok đi qua Apify.
// Dùng chung cho tab Tải video, tab Đăng lại và tab Comment.

// Bỏ ký tự Windows cấm trong tên file.
export const safeName = (s: string) =>
  s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);

type TtItem = { id?: string; text?: string; mediaUrls?: string[]; authorMeta?: { name?: string } };

// Tải 1 video về destDir. Actor bắt maxTotalChargeUsd tối thiểu $0.50; postURLs 1 link
// nên thực tế chỉ tốn ~$0.006.
export async function downloadTiktok(
  url: string,
  destDir: string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const items = await runActor<TtItem>(
    "clockworks~tiktok-scraper",
    { postURLs: [url], shouldDownloadVideos: true, resultsPerPage: 1 },
    0.5
  );
  const it = items[0];
  const media = it?.mediaUrls?.[0];
  if (!media) return { ok: false, error: "Apify không trả về video (link chết hoặc video riêng tư)" };
  // Record nằm trong key-value store riêng của run → phải kèm token mới đọc được.
  const token = (process.env.APIFY_API_KEY || "").trim();
  const src = media + (media.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(300_000) });
    if (!r.ok) return { ok: false, error: `tải file từ Apify lỗi ${r.status}` };
    const name = `${safeName(it.authorMeta?.name || "tiktok")} - ${safeName(it.text || "video")} [${it.id || Date.now()}].mp4`;
    await fs.mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, name);
    await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------- Scrape profile ----------

export type TtVideo = {
  id: string;
  caption: string;
  url: string;
  cover: string;
  duration: number; // giây
  views: number;
  createdAt: string;
};

type TtProfileItem = {
  id?: string;
  text?: string;
  webVideoUrl?: string;
  playCount?: number;
  createTimeISO?: string;
  videoMeta?: { coverUrl?: string; duration?: number };
};

export async function scrapeTiktokProfile(handle: string, limit = 30): Promise<TtVideo[]> {
  const items = await runActor<TtProfileItem>(
    "clockworks~tiktok-scraper",
    {
      profiles: [handle.replace(/^@/, "")],
      resultsPerPage: limit,
      profileSorting: "latest",
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    },
    0.5
  );
  return items
    .filter((i) => i.id && i.webVideoUrl)
    .map((i) => ({
      id: String(i.id),
      caption: (i.text || "").trim(),
      url: String(i.webVideoUrl),
      cover: i.videoMeta?.coverUrl || "",
      duration: Number(i.videoMeta?.duration || 0),
      views: Number(i.playCount || 0),
      createdAt: i.createTimeISO || "",
    }))
    .slice(0, limit);
}

// ---------- Scrape comment (chỉ đọc, TikTok không có API reply cho creator) ----------

export type TtComment = {
  id: string;
  text: string;
  author: string;
  avatar: string;
  likes: number;
  createdAt: string;
  videoUrl: string;
};

type TtCommentItem = {
  cid?: string;
  text?: string;
  uniqueId?: string;
  avatarThumbnail?: string;
  diggCount?: number;
  createTimeISO?: string;
  videoWebUrl?: string;
};

export async function scrapeTiktokComments(
  videoUrls: string[],
  perPost = 10
): Promise<TtComment[]> {
  if (!videoUrls.length) return [];
  // $0.005/comment → cap = số comment tối đa * giá, sàn $0.50 của actor.
  const cap = Math.max(0.5, videoUrls.length * perPost * 0.005);
  const items = await runActor<TtCommentItem>(
    "clockworks~tiktok-comments-scraper",
    { postURLs: videoUrls, commentsPerPost: perPost },
    cap
  );
  return items
    .filter((i) => i.cid && i.text)
    .map((i) => ({
      id: String(i.cid),
      text: String(i.text),
      author: i.uniqueId || "",
      avatar: i.avatarThumbnail || "",
      likes: Number(i.diggCount || 0),
      createdAt: i.createTimeISO || "",
      videoUrl: i.videoWebUrl || "",
    }));
}
