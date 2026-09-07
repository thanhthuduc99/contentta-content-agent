import fs from "node:fs/promises";
import path from "node:path";
import { CONTENT_DIR } from "./paths";
import { scrapeTiktokComments, scrapeTiktokProfile, type TtComment, type TtVideo } from "./tiktok";

// TikTok không có API comment cho creator → scrape Apify, CHỈ ĐỌC, không reply được.
// Mỗi lần quét tốn tiền ($0.005/comment) nên luôn cache lại, chỉ gọi khi user bấm.
const FILE = path.join(CONTENT_DIR, "_comments", "tiktok.json");
// Cache riêng danh sách video (khỏi quét lại profile mỗi lần refresh comment).
const VIDEOS_FILE = path.join(CONTENT_DIR, "_comments", "tiktok-videos.json");

export const TIKTOK_HANDLE = "thanhvuducc";

async function getVideoList(): Promise<TtVideo[]> {
  try {
    const v = JSON.parse(await fs.readFile(VIDEOS_FILE, "utf8")) as TtVideo[];
    if (Array.isArray(v) && v.length) return v;
  } catch {}
  const videos = await scrapeTiktokProfile(TIKTOK_HANDLE, 30);
  await fs.mkdir(path.dirname(VIDEOS_FILE), { recursive: true });
  await fs.writeFile(VIDEOS_FILE, JSON.stringify(videos, null, 2), "utf8");
  return videos;
}

export type TiktokCommentCache = {
  lastScanAt: string | null;
  videoCount: number;
  comments: (TtComment & { videoCaption: string })[];
};

const EMPTY: TiktokCommentCache = { lastScanAt: null, videoCount: 0, comments: [] };

export async function getCachedTiktokComments(): Promise<TiktokCommentCache> {
  try {
    const c = JSON.parse(await fs.readFile(FILE, "utf8")) as TiktokCommentCache;
    return {
      lastScanAt: c.lastScanAt || null,
      videoCount: Number(c.videoCount || 0),
      comments: Array.isArray(c.comments) ? c.comments : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function refreshTiktokComments(
  videoCount = 10,
  perPost = 10
): Promise<TiktokCommentCache> {
  const videos = await getVideoList();
  const picked = videos.slice(0, videoCount);
  const raw = await scrapeTiktokComments(picked.map((v) => v.url), perPost);
  const capByUrl = new Map(picked.map((v) => [v.url, v.caption]));
  const comments = raw
    .map((c) => ({ ...c, videoCaption: (capByUrl.get(c.videoUrl) || "").slice(0, 120) }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const next: TiktokCommentCache = {
    lastScanAt: new Date().toISOString(),
    videoCount: picked.length,
    comments,
  };
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}
