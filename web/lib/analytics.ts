import "./env";
import { listAccountsAll, zernioKeys, zfetchWith } from "./zernio";

type AnalyticsQuery = {
  platform?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  sortBy?: string;
  order?: string;
};

// Gộp follower accounts từ TẤT CẢ key Zernio.
async function mergedFollowerAccounts(q: { fromDate?: string; toDate?: string }): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  await Promise.all(
    zernioKeys().map(async (key) => {
      try {
        const fs = (await zfetchWith(key, "GET", "/accounts/follower-stats", { query: q })) as {
          accounts?: Record<string, unknown>[];
        };
        if (Array.isArray(fs.accounts)) out.push(...fs.accounts);
      } catch {
        /* key lỗi → bỏ */
      }
    })
  );
  return out;
}

// Gộp posting analytics từ TẤT CẢ key: concat posts + cộng totalPosts.
async function mergedAnalytics(q: AnalyticsQuery): Promise<{ posts: Record<string, unknown>[]; totalPosts: number }> {
  let totalPosts = 0;
  const posts: Record<string, unknown>[] = [];
  await Promise.all(
    zernioKeys().map(async (key) => {
      try {
        const r = (await zfetchWith(key, "GET", "/analytics", { query: q })) as {
          posts?: Record<string, unknown>[];
          overview?: { totalPosts?: number };
        };
        const list = Array.isArray(r.posts) ? r.posts : [];
        posts.push(...list);
        totalPosts += Number(r.overview?.totalPosts) || list.length;
      } catch {
        /* key lỗi → bỏ */
      }
    })
  );
  return { posts, totalPosts };
}

export type Metric = "posts" | "likes" | "comments" | "shares" | "saves" | "views" | "impressions" | "reach" | "clicks";

export type PlatStat = {
  platform: string;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  impressions: number;
  reach: number;
  clicks: number;
  engagementRate: number; // trung bình
};

type WeekMetrics = { posts: number; likes: number; comments: number; shares: number; saves: number; views: number; impressions: number; reach: number; clicks: number };
export type WeekStat = {
  week: string; // thứ 2 đầu tuần, YYYY-MM-DD
  byPlatform: Record<string, WeekMetrics>;
};

export type TopPost = {
  id: string;
  platform: string;
  title: string;
  date: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  impressions: number;
  reach: number;
  clicks: number;
  er: number;
  url: string | null;
  thumbnail: string | null;
};

export type Totals = {
  likes: number; comments: number; shares: number; saves: number;
  views: number; impressions: number; reach: number; clicks: number;
  engagementRate: number;
};

export type Dashboard = {
  engagementRate: number;
  totalReach: number;
  totalFollowers: number;
  postsThisPeriod: number;
  delta: {
    engagementRate: number | null; // % vs kỳ trước
    totalReach: number | null;
    postsThisPeriod: number | null;
    impressions: number | null;
    reach: number | null;
    clicks: number | null;
  };
  totals: Totals;
  bestPost: {
    id?: string;
    platform?: string;
    engagement?: number;
    thumbnail?: string | null;
    url?: string | null;
  } | null;
  topPosts: TopPost[];
  heatmap: number[][]; // [7 weekday Mon..Sun][24 hour] = tổng engagement
  bestTimes: { day: number; hour: number; value: number }[];
  followers: { platform: string; current: number }[];
  perPlatform: PlatStat[];
  weekly: WeekStat[];
  platforms: string[];
  periodDays: number;
  notes: string[];
};

type AnyRec = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

function weekStart(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// Tổng hợp nhanh cho 1 window (dùng tính delta vs kỳ trước).
function summarize(posts: AnyRec[]): { reach: number; impressions: number; clicks: number; posts: number; eng: number } {
  let reach = 0, impressions = 0, clicks = 0, eng = 0;
  for (const p of posts) {
    const a = (p.analytics as AnyRec) || {};
    reach += num(a.reach ?? a.impressions);
    impressions += num(a.impressions ?? a.reach);
    clicks += num(a.clicks ?? a.linkClicks);
    eng += num(a.engagementRate);
  }
  return { reach, impressions, clicks, posts: posts.length, eng: posts.length ? eng / posts.length : 0 };
}

function pctDelta(cur: number, prior: number): number | null {
  if (!prior) return null;
  return ((cur - prior) / prior) * 100;
}

function shiftDate(iso: string | undefined, deltaDays: number): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export async function getDashboard(opts: {
  fromDate?: string;
  toDate?: string;
  platform?: string;
}): Promise<Dashboard> {
  const notes: string[] = [];
  const out: Dashboard = {
    engagementRate: 0,
    totalReach: 0,
    totalFollowers: 0,
    postsThisPeriod: 0,
    delta: { engagementRate: null, totalReach: null, postsThisPeriod: null, impressions: null, reach: null, clicks: null },
    totals: { likes: 0, comments: 0, shares: 0, saves: 0, views: 0, impressions: 0, reach: 0, clicks: 0, engagementRate: 0 },
    bestPost: null,
    topPosts: [],
    heatmap: Array.from({ length: 7 }, () => new Array(24).fill(0)),
    bestTimes: [],
    followers: [],
    perPlatform: [],
    weekly: [],
    platforms: [],
    periodDays:
      opts.fromDate && opts.toDate
        ? Math.max(1, Math.round((new Date(opts.toDate).getTime() - new Date(opts.fromDate).getTime()) / 86400000))
        : 30,
    notes,
  };

  // Followers (tổng + theo platform) — gộp cả 2 key
  try {
    const accs = (await mergedFollowerAccounts({ fromDate: opts.fromDate, toDate: opts.toDate })) as AnyRec[];
    const byPlat = new Map<string, number>();
    for (const a of accs) {
      if (opts.platform && String(a.platform) !== opts.platform) continue;
      const f = num(a.currentFollowers ?? a.followers ?? a.followerCount);
      out.totalFollowers += f;
      const pk = String(a.platform || "unknown");
      byPlat.set(pk, (byPlat.get(pk) || 0) + f);
    }
    out.followers = [...byPlat.entries()].map(([platform, current]) => ({ platform, current })).sort((a, b) => b.current - a.current);
  } catch (e) {
    notes.push("Follower stats không lấy được: " + (e as Error).message.slice(0, 100));
  }

  // Posting analytics — gộp cả 2 key
  try {
    const merged = await mergedAnalytics({
      platform: opts.platform,
      fromDate: opts.fromDate,
      toDate: opts.toDate,
      limit: 100,
      sortBy: "engagement",
      order: "desc",
    });
    const list = merged.posts as AnyRec[];
    out.postsThisPeriod = merged.totalPosts || list.length;

    const perPlat = new Map<string, PlatStat>();
    const perPlatEngCount = new Map<string, { sum: number; n: number }>();
    const weeks = new Map<string, WeekStat>();
    let sumEng = 0;
    let best = -1;
    const T = out.totals;

    for (const p of list) {
      const top = (p.analytics as AnyRec) || {};
      sumEng += num(top.engagementRate);
      out.totalReach += num(top.reach ?? top.impressions);

      const engAbs = num(top.likes) + num(top.comments) + num(top.shares) + num(top.saves);

      // Totals (theo top-level analytics của post)
      T.likes += num(top.likes);
      T.comments += num(top.comments);
      T.shares += num(top.shares);
      T.saves += num(top.saves);
      T.views += num(top.views);
      T.impressions += num(top.impressions ?? top.reach);
      T.reach += num(top.reach ?? top.impressions);
      T.clicks += num(top.clicks ?? top.linkClicks);

      // Top posts
      const pubAt = String(p.publishedAt || p.date || "");
      const primaryPlatform = String((Array.isArray(p.platforms) && (p.platforms as AnyRec[])[0]?.platform) || p.platform || "unknown");
      out.topPosts.push({
        id: String(p._id || p.postId || ""),
        platform: primaryPlatform,
        title: String(p.caption || p.text || p.title || p.content || "(không tiêu đề)").replace(/\s+/g, " ").slice(0, 120),
        date: pubAt.slice(0, 10),
        likes: num(top.likes),
        comments: num(top.comments),
        shares: num(top.shares),
        saves: num(top.saves),
        views: num(top.views),
        impressions: num(top.impressions ?? top.reach),
        reach: num(top.reach ?? top.impressions),
        clicks: num(top.clicks ?? top.linkClicks),
        er: num(top.engagementRate),
        url: (p.platformPostUrl as string) || null,
        thumbnail: (p.thumbnailUrl as string) || null,
      });

      if (engAbs > best) {
        best = engAbs;
        out.bestPost = {
          id: String(p._id || p.postId || ""),
          platform: primaryPlatform,
          engagement: engAbs,
          thumbnail: (p.thumbnailUrl as string) || null,
          url: (p.platformPostUrl as string) || null,
        };
      }

      // Heatmap (Best Time to Post): bucket theo thứ x giờ, trọng số = engagement.
      const pd = new Date(pubAt);
      if (!isNaN(pd.getTime())) {
        const day = (pd.getDay() + 6) % 7; // Mon = 0
        const hour = pd.getHours();
        out.heatmap[day][hour] += Math.max(1, engAbs);
      }

      const wk = weekStart(pubAt);
      const plats =
        Array.isArray(p.platforms) && (p.platforms as AnyRec[]).length
          ? (p.platforms as AnyRec[])
          : [{ platform: p.platform, analytics: top }];

      for (const pl of plats) {
        const platform = String(pl.platform || p.platform || "unknown");
        const a = ((pl.analytics as AnyRec) || top) as AnyRec;
        const stat = perPlat.get(platform) || {
          platform, posts: 0, likes: 0, comments: 0, shares: 0, saves: 0, views: 0, impressions: 0, reach: 0, clicks: 0, engagementRate: 0,
        };
        stat.posts += 1;
        stat.likes += num(a.likes);
        stat.comments += num(a.comments);
        stat.shares += num(a.shares);
        stat.saves += num(a.saves);
        stat.views += num(a.views);
        stat.impressions += num(a.impressions ?? a.reach);
        stat.reach += num(a.reach ?? a.impressions);
        stat.clicks += num(a.clicks ?? a.linkClicks);
        perPlat.set(platform, stat);
        const ec = perPlatEngCount.get(platform) || { sum: 0, n: 0 };
        ec.sum += num(a.engagementRate);
        ec.n += 1;
        perPlatEngCount.set(platform, ec);

        if (wk) {
          const w = weeks.get(wk) || { week: wk, byPlatform: {} };
          const b = w.byPlatform[platform] || { posts: 0, likes: 0, comments: 0, shares: 0, saves: 0, views: 0, impressions: 0, reach: 0, clicks: 0 };
          b.posts += 1;
          b.likes += num(a.likes);
          b.comments += num(a.comments);
          b.shares += num(a.shares);
          b.saves += num(a.saves);
          b.views += num(a.views);
          b.impressions += num(a.impressions ?? a.reach);
          b.reach += num(a.reach ?? a.impressions);
          b.clicks += num(a.clicks ?? a.linkClicks);
          w.byPlatform[platform] = b;
          weeks.set(wk, w);
        }
      }
    }

    out.engagementRate = list.length ? sumEng / list.length : 0;
    T.engagementRate = out.engagementRate;
    for (const [platform, ec] of perPlatEngCount) {
      const stat = perPlat.get(platform);
      if (stat) stat.engagementRate = ec.n ? ec.sum / ec.n : 0;
    }
    out.perPlatform = [...perPlat.values()].sort((a, b) => b.posts - a.posts);
    out.weekly = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
    out.platforms = out.perPlatform.map((p) => p.platform);
    out.topPosts.sort((a, b) => (b.likes + b.comments + b.shares + b.saves) - (a.likes + a.comments + a.shares + a.saves));
    out.topPosts = out.topPosts.slice(0, 10);

    // Best times: top 3 ô heatmap.
    const flat: { day: number; hour: number; value: number }[] = [];
    out.heatmap.forEach((row, day) => row.forEach((value, hour) => { if (value > 0) flat.push({ day, hour, value }); }));
    out.bestTimes = flat.sort((a, b) => b.value - a.value).slice(0, 3);

    // Delta vs kỳ trước (cùng độ dài, ngay trước fromDate).
    if (opts.fromDate && opts.toDate) {
      const len =
        (new Date(opts.toDate).getTime() - new Date(opts.fromDate).getTime()) / 86400000;
      const priorFrom = shiftDate(opts.fromDate, -Math.round(len) - 1);
      const priorTo = shiftDate(opts.fromDate, -1);
      try {
        const pm = await mergedAnalytics({
          platform: opts.platform,
          fromDate: priorFrom,
          toDate: priorTo,
          limit: 100,
        });
        const prior = summarize(pm.posts as AnyRec[]);
        out.delta.totalReach = pctDelta(out.totalReach, prior.reach);
        out.delta.reach = pctDelta(out.totals.reach, prior.reach);
        out.delta.impressions = pctDelta(out.totals.impressions, prior.impressions);
        out.delta.clicks = pctDelta(out.totals.clicks, prior.clicks);
        out.delta.postsThisPeriod = pctDelta(out.postsThisPeriod, prior.posts);
        out.delta.engagementRate = pctDelta(out.engagementRate, prior.eng);
      } catch {
        /* kỳ trước lỗi → bỏ delta */
      }
    }
  } catch (e) {
    notes.push("Analytics posts lỗi: " + (e as Error).message.slice(0, 160));
  }

  // Cảnh báo khi Zernio trả rỗng nhưng không throw (thường do sai ZERNIO_API_KEY / chưa kết nối account).
  if (out.followers.length === 0 && out.postsThisPeriod === 0 && notes.length === 0) {
    notes.push("Zernio không trả dữ liệu — kiểm tra ZERNIO_API_KEY (Settings) và account đã kết nối.");
  }

  return out;
}

// Danh sách account (cho UI biết platform/username đã connect).
export async function accountsBrief() {
  try {
    const accs = await listAccountsAll();
    return accs.map((a) => ({
      id: a.accountId,
      platform: a.platform,
      name: a.displayName,
    }));
  } catch {
    return [];
  }
}
