import "./env";

// Reddit OAuth API (app-only, client_credentials). Đọc public listing đủ dùng.
// Cần REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (Reddit app type "script").
const UA = "web:contentta-research:1.0 (by /u/contentta)";

export type RedditPost = {
  title: string;
  url: string; // permalink đầy đủ
  ups: number;
  comments: number;
  subreddit: string;
  selftext: string;
};

let cachedToken: string | null = null;
let tokenExp = 0;

async function redditToken(): Promise<string> {
  const id = (process.env.REDDIT_CLIENT_ID || "").trim();
  const secret = (process.env.REDDIT_CLIENT_SECRET || "").trim();
  if (!id || !secret) throw new Error("chưa cấu hình REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET");
  if (cachedToken && Date.now() < tokenExp) return cachedToken;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`Reddit token ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) throw new Error("Reddit không trả access_token");
  cachedToken = d.access_token;
  tokenExp = Date.now() + ((d.expires_in || 3600) - 120) * 1000;
  return cachedToken;
}

type Listing = {
  data?: {
    children?: {
      data?: {
        title?: string;
        permalink?: string;
        ups?: number;
        num_comments?: number;
        subreddit?: string;
        selftext?: string;
        stickied?: boolean;
      };
    }[];
  };
};

// Top bài của mỗi sub (t=day/week/month...) → gộp, sort theo ups.
export async function redditHot(
  subs: string[],
  t: "day" | "week" | "month" = "day",
  perSub = 5
): Promise<RedditPost[]> {
  const token = await redditToken();
  const all: RedditPost[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const r = await fetch(
          `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/top?t=${t}&limit=${perSub}`,
          { headers: { Authorization: `Bearer ${token}`, "User-Agent": UA } }
        );
        if (!r.ok) return;
        const j = (await r.json()) as Listing;
        for (const c of j.data?.children || []) {
          const d = c.data;
          if (!d || d.stickied || !d.title) continue;
          all.push({
            title: d.title.trim(),
            url: `https://www.reddit.com${d.permalink || ""}`,
            ups: d.ups || 0,
            comments: d.num_comments || 0,
            subreddit: d.subreddit || sub,
            selftext: (d.selftext || "").replace(/\s+/g, " ").trim(),
          });
        }
      } catch {
        /* sub lỗi → bỏ qua */
      }
    })
  );
  return all.sort((a, b) => b.ups - a.ups);
}
