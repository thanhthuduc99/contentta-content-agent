import "./env";

// YouTube Data API v3 (API key cho dữ liệu public, OAuth cho kênh đã đăng nhập).
const API = "https://www.googleapis.com/youtube/v3";

export type YtVideo = {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  url: string;
  thumb: string;
};

export type YtStats = {
  channelId: string;
  title: string;
  handle: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  videos: YtVideo[];
};

function key(): string {
  const k = (process.env.YOUTUBE_API_KEY || "").trim();
  if (!k) throw new Error("Chưa cấu hình YouTube: thiếu OAuth (chạy `node scripts/yt-oauth.mjs`) hoặc YOUTUBE_API_KEY.");
  return k;
}

// OAuth access token từ refresh token (ưu tiên hơn API key — không dính API-key restriction).
let cachedToken: string | null = null;
let tokenExp = 0;
async function oauthToken(): Promise<string | null> {
  const rt = (process.env.YOUTUBE_OAUTH_REFRESH_TOKEN || "").trim();
  const cid = (process.env.YOUTUBE_OAUTH_CLIENT_ID || "").trim();
  const cs = (process.env.YOUTUBE_OAUTH_CLIENT_SECRET || "").trim();
  if (!rt || !cid || !cs) return null;
  if (cachedToken && Date.now() < tokenExp) return cachedToken;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cid, client_secret: cs, refresh_token: rt, grant_type: "refresh_token" }),
  });
  if (!r.ok) return null;
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) return null;
  cachedToken = d.access_token;
  tokenExp = Date.now() + ((d.expires_in || 3600) - 60) * 1000;
  return cachedToken;
}

async function yt<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = await oauthToken();
  const q = new URLSearchParams(token ? params : { ...params, key: key() });
  const r = await fetch(`${API}/${path}?${q}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!r.ok) {
    const body = (await r.text()).slice(0, 500);
    if (r.status === 403 || body.includes("API_KEY_SERVICE_BLOCKED") || body.includes("blocked") || body.includes("PERMISSION_DENIED")) {
      throw new Error(
        "YouTube API key đang bị chặn (403). Mở Google Cloud Console > APIs & Services: (1) Library: bật 'YouTube Data API v3'. (2) Credentials > key này > API restrictions: chọn 'Don't restrict' hoặc thêm 'YouTube Data API v3'. Lưu rồi đợi 1-2 phút."
      );
    }
    throw new Error(`YouTube API ${r.status}: ${body.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

type ChannelResp = {
  items?: {
    id: string;
    snippet: { title: string; customUrl?: string };
    statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string };
    contentDetails: { relatedPlaylists: { uploads: string } };
  }[];
};
type PlaylistResp = { items?: { contentDetails: { videoId: string } }[] };
type VideosResp = {
  items?: {
    id: string;
    snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string } } };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
};

export async function getYouTubeStats(maxVideos = 10): Promise<YtStats> {
  const useOAuth = !!(process.env.YOUTUBE_OAUTH_REFRESH_TOKEN || "").trim();
  const handle = (process.env.YOUTUBE_CHANNEL_HANDLE || "").trim().replace(/^@/, "");
  if (!useOAuth && !handle) {
    throw new Error("Thiếu YOUTUBE_CHANNEL_HANDLE trong .env (hoặc cấu hình YouTube OAuth).");
  }
  // Có OAuth: lấy thẳng kênh của tài khoản đã consent (mine=true), khỏi đoán handle.
  const ch = await yt<ChannelResp>(
    "channels",
    useOAuth
      ? { part: "snippet,statistics,contentDetails", mine: "true" }
      : { part: "snippet,statistics,contentDetails", forHandle: handle }
  );
  const c = ch.items?.[0];
  if (!c) throw new Error(useOAuth ? "Tài khoản đã consent không có kênh YouTube" : `Không tìm thấy kênh @${handle}`);

  const pl = await yt<PlaylistResp>("playlistItems", {
    part: "contentDetails",
    playlistId: c.contentDetails.relatedPlaylists.uploads,
    maxResults: String(maxVideos),
  });
  const ids = (pl.items || []).map((i) => i.contentDetails.videoId);

  let videos: YtVideo[] = [];
  if (ids.length) {
    const vs = await yt<VideosResp>("videos", {
      part: "snippet,statistics",
      id: ids.join(","),
    });
    videos = (vs.items || []).map((v) => ({
      id: v.id,
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt.slice(0, 10),
      views: Number(v.statistics.viewCount || 0),
      likes: Number(v.statistics.likeCount || 0),
      comments: Number(v.statistics.commentCount || 0),
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumb: v.snippet.thumbnails?.medium?.url || "",
    }));
  }

  return {
    channelId: c.id,
    title: c.snippet.title,
    handle: c.snippet.customUrl ? (c.snippet.customUrl.startsWith("@") ? c.snippet.customUrl : `@${c.snippet.customUrl}`) : `@${handle}`,
    subscribers: Number(c.statistics.subscriberCount || 0),
    totalViews: Number(c.statistics.viewCount || 0),
    videoCount: Number(c.statistics.videoCount || 0),
    videos,
  };
}
