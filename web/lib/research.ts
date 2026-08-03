import "./env";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { YoutubeTranscript } from "youtube-transcript";
import { REPO_ROOT, RESEARCH_DIR, OBSIDIAN_RESEARCH } from "./paths";
import { runActor } from "./apify";

// 7 channel theo dõi mỗi ngày (handle, không @).
const CHANNELS = [
  "BenAI92",
  "nateherk",
  "nicksaraev",
  "RoboNuggets",
  "Chase-H-AI",
  "TinaHuang1",
  "GregIsenberg",
] as const;
const KNOWN_CHANNEL_IDS: Record<string, string> = { nateherk: "UC2ojq-nuP8ceeHqiroeKhBA" };

// Sub AI theo dõi (dùng cho cả daily qua Apify và fallback WebSearch).
const REDDIT_SUBS = ["ClaudeAI", "LocalLLaMA", "AI_Agents", "artificial", "OpenAI"];

// Chạy tasks với giới hạn đồng thời (bound thời gian khi nhiều video mới).
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---- claude -p (subscription). web=true cho phép WebSearch/WebFetch ----
function runClaude(prompt: string, web = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "text"];
    if (web) args.push("--allowedTools", "WebSearch,WebFetch,Read");
    const child = spawn("claude", args, { cwd: REPO_ROOT, shell: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("claude -p timeout"));
    }, web ? 290_000 : 180_000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out.trim()) : reject(new Error(`claude exit ${code}: ${err.slice(0, 300)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ---- helpers ----
// Hạ mọi heading markdown (#..######) trong output của claude thành **bold** để không đụng
// cấp với heading section của daily report (## 📺 / ## 🟣 ...).
const noHeadings = (s: string) => s.replace(/^\s{0,3}#{1,6}\s+(.*?)\s*#*$/gm, "**$1**");
// Decode entity HTML hay gặp trong title RSS (&quot; &amp; &#39;…).
const unent = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const isYouTube = (u: string) => /youtube\.com|youtu\.be/.test(u);
const isGitHub = (u: string) => /github\.com/i.test(u);
function ghName(u: string): string {
  const m = u.match(/github\.com\/([^/]+\/[^/#?]+)/i);
  return m ? m[1].replace(/\.git$/, "") : "Repo GitHub";
}

// Cấu trúc markdown chung cho mọi research (header tiêu đề/nguồn/file do saveResearch thêm).
const FORMAT = `Trả về markdown tiếng Việt có dấu, giọng casual câu ngắn, theo ĐÚNG cấu trúc:
## Tóm tắt
- (5-8 gạch đầu dòng ý chính)
## Thu thập thêm (WebSearch)
- [tiêu đề](url) — 1 câu vì sao liên quan
Chỉ trả markdown, KHÔNG thêm tiêu đề H1.`;
export function ytId(u: string): string | null {
  const m = u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
export async function ytTitle(u: string): Promise<string> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`);
    const j = (await r.json()) as { title?: string };
    return j.title || "";
  } catch {
    return "";
  }
}
export async function transcriptYouTube(u: string): Promise<string | null> {
  const id = ytId(u);
  if (!id) return null;
  try {
    const t = await YoutubeTranscript.fetchTranscript(id);
    const txt = t.map((x) => x.text).join(" ").trim();
    return txt || null;
  } catch {
    return null;
  }
}

function slugify(s: string): string {
  return (
    s
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "research"
  );
}

export async function saveResearch(
  body: string,
  slug: string,
  opts: { subdir?: string; title?: string; source?: string } = {}
): Promise<string> {
  const { subdir = "", title, source } = opts;
  const date = new Date().toISOString().slice(0, 10);
  const name = `${date}_${slugify(slug)}.md`;
  const rel = (subdir ? `${subdir}/` : "") + name;
  let md = body;
  if (title) {
    const head = [`# ${title}`];
    if (source) head.push(`**Nguồn:** ${source}`);
    head.push(`**Ngày:** ${date}`, `**File:** ${rel}`, "");
    md = head.join("\n") + "\n" + body;
  }
  const dir = path.join(RESEARCH_DIR, subdir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), md, "utf8");
  try {
    if (!OBSIDIAN_RESEARCH) return rel;
    const od = path.join(OBSIDIAN_RESEARCH, subdir);
    await fs.mkdir(od, { recursive: true });
    await fs.writeFile(path.join(od, name), md, "utf8");
  } catch {
    /* vault offline → bỏ qua */
  }
  return rel;
}

// ---- on-demand research ----
export async function researchLink(input: { url?: string; text?: string }): Promise<{
  title: string;
  source: string;
  markdown: string;
}> {
  const url = (input.url || "").trim();
  const text = (input.text || "").trim();

  if (url && isYouTube(url)) {
    const title = (await ytTitle(url)) || "Video YouTube";
    const tr = await transcriptYouTube(url);
    const base = tr
      ? `Dưới đây là TRANSCRIPT video YouTube "${title}". Tóm tắt nội dung chính, rồi dùng WebSearch tìm 3-5 nguồn liên quan để bổ sung mục "Thu thập thêm".\n\nTRANSCRIPT:\n${tr.slice(0, 14000)}`
      : `Research video YouTube này: ${url}. Dùng WebFetch đọc trang video + WebSearch tìm thông tin & nguồn liên quan.`;
    const md = await runClaude(`${base}\n\n${FORMAT}`, true);
    return { title, source: url, markdown: md };
  }

  if (url && isGitHub(url)) {
    const title = ghName(url);
    const md = await runClaude(
      `Research repo GitHub này: ${url}. Dùng WebFetch đọc README + trang repo: repo làm gì, tech/stack, cách cài & dùng, điểm nổi bật. Dùng WebSearch tìm 3-5 bài viết/video liên quan.\n\n${FORMAT}`,
      true
    );
    return { title, source: url, markdown: md };
  }

  const target = url ? `link: ${url} (dùng WebFetch đọc nội dung)` : "nội dung dán bên dưới";
  const md = await runClaude(
    `Research ${target}. Tóm tắt nội dung gốc, rồi dùng WebSearch tìm 3-5 nguồn liên quan.\n\n${FORMAT}${
      text ? "\n\nNỘI DUNG:\n" + text.slice(0, 6000) : ""
    }`,
    true
  );
  let title = "Research";
  if (url) {
    try {
      title = new URL(url).hostname;
    } catch {
      /* keep */
    }
  } else if (text) title = text.slice(0, 40);
  return { title, source: url, markdown: md };
}

// ---- daily agent ----
type State = {
  lastDailyDate?: string;
  reportedRepos?: string[]; // dedup GitHub
  channelIds?: Record<string, string>; // handle -> UC id (cache)
  seenVideos?: Record<string, string>; // handle -> video id đã báo gần nhất
  seenNews?: string[]; // URL post tin đã báo
  seenTweets?: string[]; // tweet id đã báo
  seenReddit?: string[]; // reddit post id đã báo
};
const STATE_FILE = path.join(RESEARCH_DIR, "_state.json");
async function getState(): Promise<State> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as State;
  } catch {
    return {};
  }
}
async function setState(s: State): Promise<void> {
  await fs.mkdir(RESEARCH_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(s, null, 2), "utf8");
}

// Repo AI nhiều sao nhất = repo mới tạo trong N ngày, có keyword AI, sort theo sao.
const AI_KW = /\b(ai|llm|llms|agent|agents|agentic|gpt|claude|ml|machine.?learning|rag|diffusion|model|models|neural|genai|mcp)\b/i;
type Repo = { fullName: string; desc: string; stars: number; url: string; lang: string };
async function githubTrending(days: number): Promise<Repo[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const u = `https://api.github.com/search/repositories?q=${encodeURIComponent(
    `AI created:>${since}`
  )}&sort=stars&order=desc&per_page=50`;
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "contentta-research",
    };
    const tok = (process.env.GITHUB_TOKEN || "").trim();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const r = await fetch(u, { headers });
    if (!r.ok) return [];
    const j = (await r.json()) as {
      items?: {
        full_name: string;
        description?: string;
        stargazers_count?: number;
        html_url: string;
        language?: string;
        topics?: string[];
      }[];
    };
    return (j.items || [])
      .filter((it) => {
        const hay = `${it.full_name} ${it.description || ""} ${(it.topics || []).join(" ")}`;
        return AI_KW.test(hay);
      })
      .map((it) => ({
        fullName: it.full_name,
        desc: (it.description || "").trim(),
        stars: it.stargazers_count || 0,
        url: it.html_url,
        lang: it.language || "",
      }));
  } catch {
    return [];
  }
}

// ---- X + Reddit qua Apify (đã verify trên plan FREE, ~$0.37/tháng cho 1 run/ngày) ----
const DAY_MS = 86400000;

// Actor kaitoeasyapi: $0.00025/tweet, không có phí start.
// Lưu ý đã test: actor BỎ QUA maxItems (trả ~20) và BỎ QUA since_time → phải lọc 24h + cắt ở đây.
const X_ACTOR = "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest";
type Tweet = { id: string; url: string; text: string; likeCount: number; retweetCount: number; viewCount?: number; createdAt: string; author?: { userName?: string } };
export type XPost = { id: string; url: string; text: string; likes: number; retweets: number; author: string };

async function xHot(seen: Set<string>, take: number): Promise<XPost[]> {
  const raw = await runActor<Tweet>(X_ACTOR, {
    twitterContent: "AI agent OR AI automation OR LLM OR Claude OR OpenAI OR Gemini",
    queryType: "Top",
    lang: "en",
    min_faves: 200,
    "filter:replies": false,
    since_time: String(Math.floor((Date.now() - DAY_MS) / 1000)),
    maxItems: 10,
  });
  const cutoff = Date.now() - DAY_MS;
  return raw
    .filter((t) => t.id && !seen.has(t.id) && new Date(t.createdAt).getTime() >= cutoff)
    .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
    .slice(0, take)
    .map((t) => ({
      id: t.id,
      url: t.url,
      text: (t.text || "").replace(/\s+/g, " ").trim(),
      likes: t.likeCount || 0,
      retweets: t.retweetCount || 0,
      author: t.author?.userName || "?",
    }));
}

// Actor fatihtahta: $0.00149/post, không có phí start, tôn trọng maxPosts.
// subredditKeywords test ra 0 item → dùng toán tử subreddit: trong queries.
const REDDIT_ACTOR = "fatihtahta~reddit-scraper-search-fast";
type RedditRaw = { id: string; title: string; body?: string; score: number; num_comments: number; subreddit: string; url: string; age_hours?: number };
export type RedditItem = { id: string; title: string; url: string; ups: number; comments: number; sub: string; body: string };

async function redditHotApify(seen: Set<string>, take: number): Promise<RedditItem[]> {
  const raw = await runActor<RedditRaw>(REDDIT_ACTOR, {
    queries: [REDDIT_SUBS.map((s) => `subreddit:${s}`).join(" OR ")],
    sort: "top",
    timeframe: "day",
    maxPosts: 5,
    includeNsfw: false,
  });
  return raw
    .filter((p) => p.id && !seen.has(p.id))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, take)
    .map((p) => ({
      id: p.id,
      title: (p.title || "").trim(),
      url: p.url,
      ups: p.score || 0,
      comments: p.num_comments || 0,
      sub: p.subreddit || "",
      body: (p.body || "").replace(/\s+/g, " ").trim().slice(0, 300),
    }));
}

// @handle -> UC id (cache trong state). Resolve fail → null (bỏ qua channel).
async function resolveChannelId(handle: string, state: State): Promise<string | null> {
  state.channelIds ??= {};
  if (state.channelIds[handle]) return state.channelIds[handle];
  if (KNOWN_CHANNEL_IDS[handle]) return (state.channelIds[handle] = KNOWN_CHANNEL_IDS[handle]);
  try {
    const html = await (await fetch(`https://www.youtube.com/@${handle}`, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
    const id =
      (html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/) || [])[1] ||
      (html.match(/channel\/(UC[\w-]{22})/) || [])[1];
    if (id) return (state.channelIds[handle] = id);
  } catch {
    /* fall through */
  }
  return null;
}

async function channelLatest(
  channelId: string
): Promise<{ id: string; title: string; url: string; published: string } | null> {
  try {
    const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`)).text();
    const entry = (xml.match(/<entry>[\s\S]*?<\/entry>/) || [])[0];
    if (!entry) return null;
    const id = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = unent(((entry.match(/<title>([^<]+)<\/title>/) || [])[1] || "Video mới").trim());
    const published = ((entry.match(/<published>([^<]+)<\/published>/) || [])[1] || "").slice(0, 10);
    return id ? { id, title, url: `https://www.youtube.com/watch?v=${id}`, published } : null;
  } catch {
    return null;
  }
}

// Google news RSS → post kèm ngày đăng (để lọc tin trong ngày).
async function googleNews(): Promise<{ title: string; url: string; date: string }[]> {
  try {
    const xml = await (
      await fetch("https://blog.google/products-and-platforms/products/news/rss/")
    ).text();
    return [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)]
      .map((m) => {
        const block = m[0];
        const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
        const url = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
        const pub = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
        let dt = "";
        try {
          dt = new Date(pub).toISOString().slice(0, 10);
        } catch {
          /* keep "" */
        }
        return { title: unent(title.trim()), url: url.trim(), date: dt };
      })
      .filter((x) => x.url);
  } catch {
    return [];
  }
}

// Anthropic news (không RSS, không date trong list) → dùng claude-web lấy post ĐĂNG HÔM NAY.
async function anthropicTodayUrls(date: string): Promise<{ title: string; url: string }[]> {
  try {
    const out = await runClaude(
      `Vào https://www.anthropic.com/news bằng WebFetch. Liệt kê CHỈ các post được ĐĂNG vào ngày ${date} (hôm nay). Mỗi dòng đúng định dạng: URL | Tiêu đề. Nếu KHÔNG có post nào đăng hôm nay, trả về đúng một từ: NONE`,
      true
    );
    if (/^\s*NONE\s*$/i.test(out)) return [];
    return out
      .split("\n")
      .map((l) => l.trim().replace(/^[-*]\s*/, ""))
      .filter((l) => l.includes("|") && /https?:\/\/[^\s|]*anthropic\.com\/news\//i.test(l))
      .map((l) => {
        const i = l.indexOf("|");
        return { url: l.slice(0, i).trim(), title: l.slice(i + 1).trim() };
      })
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function runDaily(opts: { force?: boolean } = {}): Promise<{
  report: string;
  rel: string;
  skipped?: boolean;
  reason?: string;
  counts: { videos: number; news: number; repos: number; tweets: number; reddit: number };
}> {
  const state = await getState();
  const date = new Date().toISOString().slice(0, 10);
  const empty = { videos: 0, news: 0, repos: 0, tweets: 0, reddit: 0 };

  // Đã chạy hôm nay rồi → skip (trừ khi bấm tay force).
  if (!opts.force && state.lastDailyDate === date) {
    return { report: "", rel: `daily/${date}_daily-${date}.md`, skipped: true, reason: "already-ran", counts: empty };
  }

  state.channelIds ??= {};
  state.seenVideos ??= {};
  const seenNews = new Set(state.seenNews || []);
  const reportedRepos = new Set(state.reportedRepos || []);
  const seenTweets = new Set(state.seenTweets || []);
  const seenReddit = new Set(state.seenReddit || []);
  const parts: string[] = [];
  let nVideos = 0;
  let nNews = 0;
  let nRepos = 0;
  let nTweets = 0;
  let nReddit = 0;

  // Mốc "trong ngày" (today, có dung sai timezone ~36h → bỏ tin/video cũ).
  const recentCutoff = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);

  // 1) Tin tức: chỉ tin ĐĂNG HÔM NAY, tối đa 3 (Anthropic + Google)
  const gToday = (await googleNews()).filter((p) => p.date && p.date >= recentCutoff);
  const aToday = await anthropicTodayUrls(date);
  const newsCand = [
    ...aToday.map((p) => ({ ...p, source: "Anthropic" })),
    ...gToday.map((p) => ({ title: p.title, url: p.url, source: "Google" })),
  ].filter((p) => !seenNews.has(p.url));
  const freshNews = newsCand.slice(0, 3);
  if (freshNews.length) {
    const urls = freshNews.map((p) => `${p.url} (${p.source})`).join("\n");
    let sum: string;
    try {
      sum = await runClaude(
        `Đọc các URL tin dưới đây bằng WebFetch. Với MỖI tin: tiêu đề (in đậm) + nguồn + tóm tắt 2-3 câu tiếng Việt. Markdown TV casual câu ngắn, KHÔNG dùng heading (#).\n\nURLs:\n${urls}`,
        true
      );
    } catch {
      sum = freshNews.map((p) => `- [${p.title || p.url}](${p.url}) (${p.source})`).join("\n");
    }
    parts.push(`\n## 🗞️ Tin mới hôm nay\n${noHeadings(sum)}`);
    nNews = freshNews.length;
  }
  newsCand.forEach((p) => seenNews.add(p.url)); // seed hết tin hôm nay → không lặp

  // 1b) X: 3 tweet AI like cao nhất trong 24h
  const tweets = await xHot(seenTweets, 3);
  if (tweets.length) {
    const list = tweets
      .map((t) => `- [@${t.author}](${t.url}) · ❤️${t.likes} 🔁${t.retweets} — ${t.text.slice(0, 220)}`)
      .join("\n");
    let sum: string;
    try {
      sum = await runClaude(
        `Đây là các tweet AI được like nhiều nhất 24h qua:\n${list}\n\nViết lại tiếng Việt casual câu ngắn: mỗi tweet 1 dòng (GIỮ link + ❤️ số like) + 1 câu nội dung là gì & vì sao đáng chú ý với người làm AI automation. Chỉ markdown, KHÔNG heading #.`
      );
    } catch {
      sum = list;
    }
    parts.push(`\n## 𝕏 AI nóng trên X\n${noHeadings(sum)}`);
    tweets.forEach((t) => seenTweets.add(t.id));
    nTweets = tweets.length;
  }

  // 1c) Reddit: 3 bài top ngày ở các sub AI
  const reddit = await redditHotApify(seenReddit, 3);
  if (reddit.length) {
    const list = reddit
      .map((p) => `- [${p.title}](${p.url}) · r/${p.sub} · ⬆${p.ups} 💬${p.comments}${p.body ? " — " + p.body.slice(0, 180) : ""}`)
      .join("\n");
    let sum: string;
    try {
      sum = await runClaude(
        `Đây là các bài top hôm nay ở các sub AI trên Reddit:\n${list}\n\nViết lại tiếng Việt casual câu ngắn: mỗi bài 1 dòng (GIỮ link + r/sub + ⬆ups) + 1 câu bàn về gì & vì sao đáng chú ý với người làm AI automation. Chỉ markdown, KHÔNG heading #.`
      );
    } catch {
      sum = list;
    }
    parts.push(`\n## 👽 Reddit AI hôm nay\n${noHeadings(sum)}`);
    reddit.forEach((p) => seenReddit.add(p.id));
    nReddit = reddit.length;
  }

  // 2) YouTube: video ĐĂNG HÔM NAY, tối đa 3, CHỈ tóm tắt (không transcript)
  const vidCand = (
    await mapLimit([...CHANNELS], 3, async (handle) => {
      const cid = await resolveChannelId(handle, state);
      if (!cid) return null;
      const v = await channelLatest(cid);
      if (!v || v.published < recentCutoff || state.seenVideos![handle] === v.id) return null;
      return { handle, v };
    })
  ).filter(Boolean) as { handle: string; v: { id: string; title: string; url: string; published: string } }[];
  const videoSections = await mapLimit(vidCand.slice(0, 3), 3, async ({ handle, v }) => {
    const tr = await transcriptYouTube(v.url);
    let sum: string;
    if (tr) {
      try {
        sum = await runClaude(
          `Tóm tắt video YouTube "${v.title}" (kênh @${handle}) từ transcript. Markdown tiếng Việt casual: 5-7 ý chính. KHÔNG dùng heading (#).\n\nTRANSCRIPT:\n${tr.slice(0, 14000)}`
        );
      } catch {
        sum = "(tóm tắt lỗi)";
      }
    } else {
      sum = "Chưa có caption để tóm tắt.";
    }
    state.seenVideos![handle] = v.id;
    return `\n## 📺 @${handle} — ${v.title}\n[Xem video](${v.url})${
      v.published ? " · " + v.published : ""
    }\n### Tóm tắt\n${noHeadings(sum)}`;
  });
  nVideos = videoSections.length;
  parts.push(...videoSections);

  // 3) GitHub: top AI repo hôm nay, CHƯA báo (top 3, nhấn #1)
  const freshRepos = (await githubTrending(2)).filter((r) => !reportedRepos.has(r.fullName)).slice(0, 3);
  if (freshRepos.length) {
    const list = freshRepos
      .map((r) => `- [${r.fullName}](${r.url}) · ⭐${r.stars}${r.lang ? " · " + r.lang : ""} — ${r.desc || "(chưa có mô tả)"}`)
      .join("\n");
    let ghSum: string;
    try {
      ghSum = await runClaude(
        `Đây là repo GitHub AI nhiều sao nhất hôm nay (dòng đầu = top 1):\n${list}\n\nViết lại tiếng Việt casual câu ngắn: mỗi repo 1 dòng (GIỮ link + ⭐ + ngôn ngữ) + 1 câu repo làm gì & vì sao đáng chú ý. Chỉ markdown, KHÔNG H1.`
      );
    } catch {
      ghSum = list;
    }
    parts.push(`\n## 🐙 GitHub AI nổi bật hôm nay\n${noHeadings(ghSum)}`);
    freshRepos.forEach((r) => reportedRepos.add(r.fullName));
    nRepos = freshRepos.length;
  }

  // Lưu state
  state.seenNews = [...seenNews].slice(-500);
  state.reportedRepos = [...reportedRepos].slice(-300);
  state.seenTweets = [...seenTweets].slice(-500);
  state.seenReddit = [...seenReddit].slice(-500);
  state.lastDailyDate = date;

  const counts = { videos: nVideos, news: nNews, repos: nRepos, tweets: nTweets, reddit: nReddit };

  if (!parts.length && !opts.force) {
    await setState(state);
    return { report: "", rel: "", skipped: true, reason: "nothing-new", counts };
  }

  const report = parts.length ? parts.join("\n") : "Hôm nay chưa có gì mới.";
  const rel = await saveResearch(report, `daily-${date}`, {
    subdir: "daily",
    title: `Báo cáo research — ${date}`,
  });
  await setState(state);

  return { report, rel, counts };
}

// ---- scrape thủ công (nút bấm trong trang Research) ----
type Scraped = { title: string; markdown: string; source: string };

// GitHub top ngày/tháng — dedup qua reportedRepos (dùng chung pool với daily), top 3 MỚI.
async function scrapeGithubTrending(period: "day" | "month"): Promise<Scraped> {
  const date = new Date().toISOString().slice(0, 10);
  const label = period === "month" ? "tháng" : "ngày";
  const state = await getState();
  const reported = new Set(state.reportedRepos || []);
  const repos = (await githubTrending(period === "month" ? 31 : 2))
    .filter((r) => !reported.has(r.fullName))
    .slice(0, 3);

  if (!repos.length) {
    return {
      title: `GitHub top ${label} — ${date}`,
      markdown: "Không có repo AI MỚI nào (các repo top đều đã cào/báo trước đó).",
      source: "https://github.com/trending",
    };
  }

  const list = repos
    .map((r) => `- [${r.fullName}](${r.url}) · ⭐${r.stars}${r.lang ? " · " + r.lang : ""} — ${r.desc || "(chưa có mô tả)"}`)
    .join("\n");
  let md: string;
  try {
    md = await runClaude(
      `Đây là repo GitHub AI nhiều sao nhất trong ${label} (dòng đầu = top 1):\n${list}\n\nViết lại tiếng Việt casual câu ngắn: mỗi repo 1 dòng (GIỮ link + ⭐ + ngôn ngữ) + 1 câu repo làm gì & vì sao đáng chú ý. Chỉ markdown, KHÔNG heading #.`
    );
  } catch {
    md = list;
  }
  repos.forEach((r) => reported.add(r.fullName));
  state.reportedRepos = [...reported].slice(-300);
  await setState(state);

  return { title: `GitHub top ${label} — ${date}`, markdown: noHeadings(md), source: "https://github.com/trending" };
}

// WebSearch fallback khi Apify không chạy được (Reddit chặn cả API anonymous lẫn tạo app mới).
async function redditViaWebSearch(date: string, source: string): Promise<Scraped> {
  const subs = REDDIT_SUBS.map((s) => "r/" + s).join(", ");
  const md = await runClaude(
    `Dùng WebSearch tìm các bài/thảo luận NÓNG nhất ~2 ngày qua trên Reddit ở các sub: ${subs}. Liệt kê 5-8 chủ đề, mỗi cái: **tiêu đề** + [link reddit] + 1-2 câu bàn về gì + vì sao đáng chú ý với người làm AI automation/agent. Markdown tiếng Việt casual câu ngắn, KHÔNG heading #.`,
    true
  );
  return { title: `Reddit AI/Claude — ${date}`, markdown: noHeadings(md), source };
}

async function scrapeReddit(): Promise<Scraped> {
  const date = new Date().toISOString().slice(0, 10);
  const source = "https://www.reddit.com/r/ClaudeAI/";

  // Apify trước (có ups thật); không có token / actor lỗi → fallback WebSearch.
  const posts = await redditHotApify(new Set(), 5);
  if (posts.length) {
    const list = posts
      .map((p) => `- [${p.title}](${p.url}) · r/${p.sub} · ⬆${p.ups} 💬${p.comments}${p.body ? " — " + p.body.slice(0, 180) : ""}`)
      .join("\n");
    let md: string;
    try {
      md = await runClaude(
        `Đây là các bài NÓNG trên Reddit (sub AI/Claude) hôm nay:\n${list}\n\nViết lại tiếng Việt casual câu ngắn: mỗi bài 1 dòng (GIỮ link + r/sub + ⬆ups) + 1 câu vì sao đáng chú ý với người làm AI automation. Chỉ markdown, KHÔNG heading #.`
      );
    } catch {
      md = list;
    }
    return { title: `Reddit AI/Claude — ${date}`, markdown: noHeadings(md), source };
  }
  return redditViaWebSearch(date, source);
}

export async function scrapeSource(kind: "github-day" | "github-month" | "reddit"): Promise<Scraped> {
  if (kind === "github-day") return scrapeGithubTrending("day");
  if (kind === "github-month") return scrapeGithubTrending("month");
  return scrapeReddit();
}

// ---- list / read cho UI ----
async function walkMd(dir: string, base = ""): Promise<{ rel: string; name: string; mtime: number }[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { rel: string; name: string; mtime: number }[] = [];
  for (const e of entries) {
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkMd(full, rel)));
    else if (e.name.endsWith(".md")) {
      const st = await fs.stat(full);
      out.push({ rel, name: e.name, mtime: st.mtimeMs });
    }
  }
  return out;
}

export async function listResearch() {
  const items = await walkMd(RESEARCH_DIR);
  return items.sort((a, b) => b.mtime - a.mtime);
}

export async function readResearch(rel: string): Promise<string | null> {
  try {
    const safe = rel.split("/").filter((p) => p && p !== "..");
    return await fs.readFile(path.join(RESEARCH_DIR, ...safe), "utf8");
  } catch {
    return null;
  }
}
