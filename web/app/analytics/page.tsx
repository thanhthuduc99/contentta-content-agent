"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

// ===== Types (khớp backend lib/analytics) =====
type WeekMetrics = { posts: number; likes: number; comments: number; shares: number; saves: number; views: number; impressions: number; reach: number; clicks: number };
type WeekStat = { week: string; byPlatform: Record<string, WeekMetrics> };
type PlatStat = WeekMetrics & { platform: string; engagementRate: number };
type TopPost = {
  id: string; platform: string; title: string; date: string;
  likes: number; comments: number; shares: number; saves: number;
  views: number; impressions: number; reach: number; clicks: number;
  er: number; url: string | null; thumbnail: string | null;
};
type Dashboard = {
  engagementRate: number;
  totalReach: number;
  totalFollowers: number;
  postsThisPeriod: number;
  delta: { engagementRate: number | null; totalReach: number | null; postsThisPeriod: number | null; impressions: number | null; reach: number | null; clicks: number | null };
  totals: { likes: number; comments: number; shares: number; saves: number; views: number; impressions: number; reach: number; clicks: number; engagementRate: number };
  bestPost: { id?: string; platform?: string; engagement?: number; thumbnail?: string | null; url?: string | null } | null;
  topPosts: TopPost[];
  heatmap: number[][];
  bestTimes: { day: number; hour: number; value: number }[];
  followers: { platform: string; current: number }[];
  perPlatform: PlatStat[];
  weekly: WeekStat[];
  platforms: string[];
  periodDays: number;
  notes: string[];
};

type Metric = "posts" | "likes" | "comments" | "shares" | "views"; // cho chart cũ
const METRICS: { value: Metric; label: string }[] = [
  { value: "likes", label: "Likes" },
  { value: "comments", label: "Comments" },
  { value: "shares", label: "Shares" },
  { value: "views", label: "Views" },
];

type PanelMetric = "likes" | "comments" | "shares" | "saves" | "views" | "impressions" | "reach" | "clicks";
const PANEL: { key: PanelMetric; label: string; color: string; group: "small" | "large" }[] = [
  { key: "likes", label: "Likes", color: "#ef4444", group: "small" },
  { key: "comments", label: "Comments", color: "#3b82f6", group: "small" },
  { key: "shares", label: "Shares", color: "#22c55e", group: "small" },
  { key: "saves", label: "Saves", color: "#ec4899", group: "small" },
  { key: "views", label: "Views", color: "#8b5cf6", group: "large" },
  { key: "impressions", label: "Impress.", color: "#06b6d4", group: "large" },
  { key: "reach", label: "Reach", color: "#f59e0b", group: "large" },
  { key: "clicks", label: "Clicks", color: "#6366f1", group: "small" },
];

const PLATFORMS = ["all", "facebook", "tiktok", "youtube"];
const RANGES = [{ label: "7 ngày", days: 7 }, { label: "30 ngày", days: 30 }, { label: "90 ngày", days: 90 }];
const PLAT_COLOR: Record<string, string> = {
  facebook: "#1877F2", instagram: "#E1306C", youtube: "#FF0000", tiktok: "#111111",
  linkedin: "#0A66C2", threads: "#111111", zalo: "#0068FF", twitter: "#1DA1F2", unknown: "#9ca3af",
};
const platColor = (p: string) => PLAT_COLOR[p.toLowerCase()] || "#9ca3af";
const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const isoDaysAgo = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const fmtWeek = (w: string) => { const d = new Date(w); return isNaN(d.getTime()) ? w : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }); };
const weekTotal = (w: WeekStat, key: PanelMetric) => Object.values(w.byPlatform).reduce((s, b) => s + (b[key] || 0), 0);

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-muted">—</span>;
  const up = pct >= 0;
  return <span className={`text-xs font-medium ${up ? "text-green-600" : "text-red-500"}`}>{up ? "↗" : "↘"} {Math.abs(Math.round(pct))}% vs kỳ trước</span>;
}
function DeltaMini({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return <span className={`text-[11px] font-medium ${up ? "text-green-600" : "text-red-500"}`}>{up ? "↗" : "↘"} {Math.abs(Math.round(pct))}%</span>;
}

// ===== Chart cũ: bars =====
function PerPlatformBars({ data, metric }: { data: PlatStat[]; metric: Metric }) {
  const rows = data.map((p) => ({ platform: p.platform, value: p[metric] })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted py-8 text-center">Chưa có dữ liệu</p>;
  return (
    <div className="flex items-end justify-around gap-4 h-52 pt-6">
      {rows.map((r) => (
        <div key={r.platform} className="flex flex-col items-center gap-2 flex-1 max-w-24 h-full justify-end">
          <span className="text-sm font-bold text-ink">{compact(r.value)}</span>
          <div className="w-full max-w-16 rounded-t-md" style={{ height: `${(r.value / max) * 100}%`, minHeight: 4, background: platColor(r.platform) }} />
          <span className="text-xs text-muted capitalize">{r.platform}</span>
        </div>
      ))}
    </div>
  );
}
function WeeklyBars({ weekly, metric, platforms }: { weekly: WeekStat[]; metric: Metric; platforms: string[] }) {
  const cols = weekly.map((w) => {
    const segs = platforms.map((p) => ({ platform: p, value: w.byPlatform[p]?.[metric] || 0 })).filter((s) => s.value > 0);
    return { week: w.week, segs, total: segs.reduce((s, x) => s + x.value, 0) };
  });
  const max = Math.max(1, ...cols.map((c) => c.total));
  if (cols.every((c) => c.total === 0)) return <p className="text-sm text-muted py-8 text-center">Chưa có dữ liệu</p>;
  return (
    <div className="flex items-end justify-around gap-2 h-52 pt-6">
      {cols.map((c) => (
        <div key={c.week} className="flex flex-col items-center gap-2 flex-1 h-full justify-end">
          {c.total > 0 && <span className="text-xs font-semibold text-ink">{compact(c.total)}</span>}
          <div className="w-full max-w-10 rounded-t-md overflow-hidden flex flex-col-reverse" style={{ height: `${(c.total / max) * 100}%`, minHeight: c.total ? 4 : 0 }}>
            {c.segs.map((s) => (<div key={s.platform} style={{ height: `${(s.value / c.total) * 100}%`, background: platColor(s.platform) }} title={`${s.platform}: ${s.value}`} />))}
          </div>
          <span className="text-[10px] text-muted">{fmtWeek(c.week)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, sub, total, totalLabel, right, children }: { title: string; sub?: string; total?: string; totalLabel?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-1 gap-3">
        <div><h3 className="font-semibold text-ink">{title}</h3>{sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}</div>
        <div className="text-right shrink-0">{right}{total != null && (<><div className="text-lg font-bold text-ink leading-none">{total}</div>{totalLabel && <div className="text-xs text-muted">{totalLabel}</div>}</>)}</div>
      </div>
      {children}
    </div>
  );
}

// ===== Khối mới Zernio =====
function EngagementChart({ weekly, enabled }: { weekly: WeekStat[]; enabled: Set<PanelMetric> }) {
  const W = 720, H = 240, padL = 4, padR = 4, padT = 14, padB = 22;
  const series = PANEL.filter((m) => enabled.has(m.key));
  if (weekly.length === 0 || series.length === 0) return <p className="text-sm text-muted py-12 text-center">Chưa có dữ liệu</p>;
  const xs = weekly.map((_, i) => padL + (i * (W - padL - padR)) / Math.max(1, weekly.length - 1));
  const smallMax = Math.max(1, ...series.filter((m) => m.group === "small").flatMap((m) => weekly.map((w) => weekTotal(w, m.key))));
  const largeMax = Math.max(1, ...series.filter((m) => m.group === "large").flatMap((m) => weekly.map((w) => weekTotal(w, m.key))));
  const yOf = (v: number, group: "small" | "large") => padT + (1 - v / (group === "small" ? smallMax : largeMax)) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 260 }}>
      {[0, 0.5, 1].map((f) => (<line key={f} x1={padL} x2={W - padR} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke="rgba(23,19,13,0.08)" />))}
      {series.map((m) => (<polyline key={m.key} points={weekly.map((w, i) => `${xs[i]},${yOf(weekTotal(w, m.key), m.group)}`).join(" ")} fill="none" stroke={m.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />))}
      {weekly.map((w, i) => (<text key={w.week} x={xs[i]} y={H - 6} fontSize={11} fill="#8A8073" textAnchor="middle">{fmtWeek(w.week)}</text>))}
    </svg>
  );
}

const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
function Heatmap({ heatmap, bestTimes }: { heatmap: number[][]; bestTimes: { day: number; hour: number; value: number }[] }) {
  const max = Math.max(1, ...heatmap.flat());
  const shade = (v: number) => (v <= 0 ? "rgba(23,19,13,0.04)" : `rgba(34,197,94,${0.15 + Math.min(1, v / max) * 0.75})`);
  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21];
  return (
    <div className="grid gap-2">
      {heatmap.map((row, d) => (
        <div key={d} className="flex items-center gap-1">
          <div className="w-7 text-[10px] text-muted">{DAYS[d]}</div>
          <div className="grid flex-1 gap-[2px]" style={{ gridTemplateColumns: "repeat(24, minmax(0,1fr))" }}>
            {row.map((v, h) => (<div key={h} className="h-4 rounded-[3px]" style={{ background: shade(v) }} title={`${DAYS[d]} ${h}:00 · ${Math.round(v)}`} />))}
          </div>
        </div>
      ))}
      <div className="flex gap-1"><div className="w-7" /><div className="grid flex-1" style={{ gridTemplateColumns: "repeat(24, minmax(0,1fr))" }}>{Array.from({ length: 24 }).map((_, h) => (<div key={h} className="text-[9px] text-muted text-center">{hourLabels.includes(h) ? `${h}h` : ""}</div>))}</div></div>
      {bestTimes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-1"><span className="text-xs text-muted">Giờ tốt nhất:</span>{bestTimes.map((b, i) => (<span key={i} className="chip !bg-green-50 !text-green-700 !border-green-200">{DAYS[b.day]} {b.hour}:00 · {Math.round(b.value)}</span>))}</div>
      )}
    </div>
  );
}

function FrequencyScatter({ perPlatform, periodDays }: { perPlatform: PlatStat[]; periodDays: number }) {
  const W = 460, H = 230, padL = 40, padR = 16, padT = 16, padB = 30;
  const weeks = Math.max(1, periodDays / 7);
  const pts = perPlatform.map((p) => ({ platform: p.platform, freq: p.posts / weeks, eng: p.engagementRate }));
  if (pts.length === 0) return <p className="text-sm text-muted py-10 text-center">Chưa có dữ liệu</p>;
  const fMax = Math.max(1, ...pts.map((p) => p.freq)), eMax = Math.max(1, ...pts.map((p) => p.eng));
  const xOf = (f: number) => padL + (f / fMax) * (W - padL - padR), yOf = (e: number) => padT + (1 - e / eMax) * (H - padT - padB);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 240 }}>
        {[0, 0.5, 1].map((f) => (<line key={f} x1={padL} x2={W - padR} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} stroke="rgba(23,19,13,0.08)" />))}
        {[0, 0.5, 1].map((f) => (<text key={f} x={padL - 6} y={padT + f * (H - padT - padB) + 4} fontSize={10} fill="#8A8073" textAnchor="end">{(eMax * (1 - f)).toFixed(1)}%</text>))}
        {pts.map((p) => (<circle key={p.platform} cx={xOf(p.freq)} cy={yOf(p.eng)} r={7} fill={platColor(p.platform)} opacity={0.85}><title>{`${p.platform}: ${p.freq.toFixed(1)} bài/tuần · ${p.eng.toFixed(2)}% ER`}</title></circle>))}
        <text x={W / 2} y={H - 6} fontSize={10} fill="#8A8073" textAnchor="middle">bài / tuần →</text>
      </svg>
      <div className="flex gap-3 flex-wrap mt-1">{pts.map((p) => (<span key={p.platform} className="flex items-center gap-1.5 text-xs text-muted"><span className="w-2.5 h-2.5 rounded-full" style={{ background: platColor(p.platform) }} /><span className="capitalize">{p.platform}</span> {p.freq.toFixed(1)}/tuần · {p.eng.toFixed(1)}%</span>))}</div>
    </div>
  );
}

// ===== YouTube tab =====
type YtVideo = { id: string; title: string; publishedAt: string; views: number; likes: number; comments: number; url: string; thumb: string };
type YtStats = { title: string; handle: string; subscribers: number; totalViews: number; videoCount: number; videos: YtVideo[] };
function YouTubeTab() {
  const [d, setD] = useState<YtStats | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => { setLoading(true); setErr(""); fetch("/api/analytics/youtube").then((r) => r.json()).then((res) => (res.error ? setErr(res.error) : setD(res as YtStats))).catch((e) => setErr(String(e))).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);
  if (loading) return <p className="text-muted text-sm">Đang tải…</p>;
  if (err) return <div className="card p-6 grid gap-2"><p className="text-red-500 text-sm">{err}</p><button className="btn btn-ghost w-fit !py-1.5 !text-xs" onClick={load}>Thử lại</button></div>;
  if (!d) return null;
  const totalLikes = d.videos.reduce((s, v) => s + v.likes, 0), totalComments = d.videos.reduce((s, v) => s + v.comments, 0);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="card p-4 grid gap-1 col-span-2 md:col-span-1"><div className="label mb-0">Kênh</div><div className="text-base font-bold text-ink truncate">{d.title}</div><span className="text-xs text-muted">{d.handle}</span></div>
        <div className="card p-4 grid gap-1"><div className="label mb-0">Subscribers</div><div className="text-2xl font-bold text-ink">{compact(d.subscribers)}</div></div>
        <div className="card p-4 grid gap-1"><div className="label mb-0">Tổng views</div><div className="text-2xl font-bold text-ink">{compact(d.totalViews)}</div></div>
        <div className="card p-4 grid gap-1"><div className="label mb-0">Số video</div><div className="text-2xl font-bold text-ink">{compact(d.videoCount)}</div></div>
        <div className="card p-4 grid gap-1"><div className="label mb-0">Likes (10 video)</div><div className="text-2xl font-bold text-ink">{compact(totalLikes)}</div></div>
        <div className="card p-4 grid gap-1"><div className="label mb-0">Comments (10 video)</div><div className="text-2xl font-bold text-ink">{compact(totalComments)}</div></div>
      </div>
      <ChartCard title="Video gần nhất" sub="Tiêu đề + ngày đăng thật lấy từ YouTube">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted border-b border-line"><th className="py-2 pr-3 font-medium">Video</th><th className="py-2 pr-3 font-medium">Ngày đăng</th><th className="py-2 pr-3 font-medium text-right">Views</th><th className="py-2 pr-3 font-medium text-right">Likes</th><th className="py-2 font-medium text-right">Comments</th></tr></thead>
            <tbody>{d.videos.map((v) => (<tr key={v.id} className="border-b border-line last:border-0"><td className="py-2.5 pr-3"><a href={v.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:text-brand">{v.thumb && (/* eslint-disable-next-line @next/next/no-img-element */<img src={v.thumb} alt="" className="w-16 h-9 rounded object-cover border border-line shrink-0" />)}<span className="line-clamp-2 text-ink">{v.title}</span></a></td><td className="py-2.5 pr-3 text-muted whitespace-nowrap">{v.publishedAt}</td><td className="py-2.5 pr-3 text-right font-medium text-ink">{compact(v.views)}</td><td className="py-2.5 pr-3 text-right text-muted">{compact(v.likes)}</td><td className="py-2.5 text-right text-muted">{compact(v.comments)}</td></tr>))}</tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

// ===== Page =====
export default function AnalyticsPage() {
  const [tab, setTab] = useState<"posting" | "inbox" | "youtube">("posting");
  const [platform, setPlatform] = useState("all");
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<Metric>("likes");
  const [d, setD] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [enabled, setEnabled] = useState<Set<PanelMetric>>(new Set(["likes", "comments", "views", "impressions"]));

  const load = useCallback(() => {
    setLoading(true); setErr("");
    const platQuery = platform === "all" ? "" : `&platform=${platform}`;
    fetch(`/api/analytics?from=${isoDaysAgo(days)}&to=${today()}${platQuery}`).then((r) => r.json()).then((res) => (res.error ? setErr(res.error) : setD(res as Dashboard))).catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }, [platform, days]);
  useEffect(load, [load]);

  function toggle(k: PanelMetric) { setEnabled((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }

  const metricLabel = METRICS.find((m) => m.value === metric)?.label || "Likes";
  const metricTotalPlat = useMemo(() => (d?.perPlatform || []).reduce((s, p) => s + (p[metric] || 0), 0), [d, metric]);
  const postsTotal = useMemo(() => (d?.perPlatform || []).reduce((s, p) => s + p.posts, 0), [d]);
  const totalsOf = (k: PanelMetric) => (d ? d.totals[k] : 0);
  const deltaOf = (k: PanelMetric) => (d ? (k === "impressions" ? d.delta.impressions : k === "reach" ? d.delta.reach : k === "clicks" ? d.delta.clicks : null) : null);

  return (
    <div className="grid gap-5">
      <div><h1 className="text-2xl font-bold text-ink">Analytics</h1><p className="text-sm text-muted mt-0.5">Hiệu suất bài đăng theo nền tảng</p></div>

      <div className="flex gap-5 border-b border-line">
        {[{ k: "posting", label: "Posting analytics" }, { k: "inbox", label: "Inbox analytics" }, { k: "youtube", label: "YouTube" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as "posting" | "inbox" | "youtube")} className={`pb-2 text-sm font-medium -mb-px border-b-2 transition ${tab === t.k ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "youtube" ? <YouTubeTab /> : tab === "inbox" ? (
        <div className="card p-8 text-center text-muted">Zernio public API chưa cung cấp <b>inbox analytics</b> (chỉ có posting analytics). Theo dõi hội thoại/comment trực tiếp ở mục <b>Inbox</b>.</div>
      ) : (
        <>
          {/* Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="chip flex items-center gap-1.5 !py-1.5 !px-3"><span className="text-muted">Nền tảng:</span><select className="bg-transparent border-0 p-0 text-ink font-semibold outline-none cursor-pointer text-xs" value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map((p) => (<option key={p} value={p}>{p === "all" ? "Tất cả" : p}</option>))}</select></div>
            <div className="chip flex items-center gap-1.5 !py-1.5 !px-3"><span className="text-muted">Khoảng:</span><select className="bg-transparent border-0 p-0 text-ink font-semibold outline-none cursor-pointer text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>{RANGES.map((r) => (<option key={r.days} value={r.days}>{r.label}</option>))}</select></div>
            <button className="btn btn-ghost !py-1.5 !text-xs" onClick={load} disabled={loading}>{loading ? "Đang tải…" : "Tải lại"}</button>
          </div>

          {err && <p className="text-red-500 text-sm">{err}</p>}
          {d?.notes?.map((n, i) => (<p key={i} className="text-xs text-muted">⚠ {n}</p>))}

          {/* ===== Dashboard CŨ: 5 cards ===== */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="card p-4 grid gap-1"><div className="label mb-0">Engagement rate</div><div className="text-2xl font-bold text-ink">{(d?.engagementRate || 0).toFixed(1)}%</div><Delta pct={d?.delta.engagementRate ?? null} /></div>
            <div className="card p-4 grid gap-1"><div className="label mb-0">Total reach</div><div className="text-2xl font-bold text-ink">{compact(d?.totalReach || 0)}</div><Delta pct={d?.delta.totalReach ?? null} /></div>
            <div className="card p-4 grid gap-1"><div className="label mb-0">Total followers</div><div className="text-2xl font-bold text-ink">{compact(d?.totalFollowers || 0)}</div><span className="text-xs text-muted">trên các kênh đã nối</span></div>
            <div className="card p-4 grid gap-1"><div className="label mb-0">Posts this period</div><div className="text-2xl font-bold text-ink">{compact(d?.postsThisPeriod || 0)}</div><Delta pct={d?.delta.postsThisPeriod ?? null} /></div>
            <div className="card p-4 grid gap-1"><div className="label mb-0">Best post</div><div className="flex items-center gap-2">{d?.bestPost?.thumbnail ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={d.bestPost.thumbnail} alt="" className="w-9 h-9 rounded object-cover border border-line" />) : (<div className="w-9 h-9 rounded bg-canvas border border-line" />)}<div className="text-2xl font-bold text-ink">{compact(d?.bestPost?.engagement || 0)}</div></div>{d?.bestPost?.url ? (<a href={d.bestPost.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand">Xem ↗</a>) : (<span className="text-xs text-muted">—</span>)}</div>
          </div>

          {/* ===== Dashboard CŨ: 4 charts ===== */}
          {!loading && (
            <div className="grid lg:grid-cols-2 gap-5">
              <ChartCard title="Posts theo nền tảng" sub="Số bài mỗi nền tảng trong khoảng" total={String(postsTotal)} totalLabel="posts"><PerPlatformBars data={d?.perPlatform || []} metric="posts" /></ChartCard>
              <ChartCard title="Posts theo thời gian" sub="Theo tuần" total={String(postsTotal)} totalLabel="posts"><WeeklyBars weekly={d?.weekly || []} metric="posts" platforms={d?.platforms || []} /></ChartCard>
              <ChartCard title={`${metricLabel} theo nền tảng`} total={compact(metricTotalPlat)} totalLabel={metricLabel.toLowerCase()} right={<select className="chip !py-1 !px-2 text-xs mb-1 cursor-pointer" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>{METRICS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}</select>}><PerPlatformBars data={d?.perPlatform || []} metric={metric} /></ChartCard>
              <ChartCard title={`${metricLabel} theo thời gian`} sub="Theo tuần" total={compact(metricTotalPlat)} totalLabel={metricLabel.toLowerCase()}><WeeklyBars weekly={d?.weekly || []} metric={metric} platforms={d?.platforms || []} /></ChartCard>
            </div>
          )}

          {/* ===== KHỐI MỚI (Zernio) ===== */}
          <div className="pt-1"><h2 className="text-lg font-bold text-ink">Chi tiết engagement</h2></div>

          <ChartCard title="Engagement over time" sub={`Theo tuần · ${days} ngày`}>
            <div className="grid lg:grid-cols-[1fr_300px] gap-5">
              <EngagementChart weekly={d?.weekly || []} enabled={enabled} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 content-start">
                {PANEL.map((m) => (
                  <button key={m.key} onClick={() => toggle(m.key)} className="flex items-start gap-2 text-left">
                    <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5" style={{ borderColor: m.color, background: enabled.has(m.key) ? m.color : "transparent" }}>{enabled.has(m.key) && <span className="text-white text-[10px] leading-none">✓</span>}</span>
                    <span className="min-w-0"><span className="block text-xs text-muted">{m.label}</span><span className="block text-lg font-bold text-ink leading-tight">{compact(totalsOf(m.key))}</span><DeltaMini pct={deltaOf(m.key)} /></span>
                  </button>
                ))}
                <div className="col-span-2 pt-1 border-t border-line"><span className="block text-xs text-muted">Eng. Rate</span><span className="text-lg font-bold text-ink">{(d?.engagementRate || 0).toFixed(2)}%</span></div>
              </div>
            </div>
          </ChartCard>

          <div className="grid lg:grid-cols-2 gap-5">
            <ChartCard title="Best Time to Post" sub="Theo thứ × giờ, đậm = engagement cao"><Heatmap heatmap={d?.heatmap || []} bestTimes={d?.bestTimes || []} /></ChartCard>
            <ChartCard title="Follower per platform" sub={`Tổng ${compact(d?.totalFollowers || 0)} follower`}>
              {(d?.followers || []).length === 0 ? <p className="text-sm text-muted py-8 text-center">Chưa có dữ liệu</p> : (
                <div className="grid gap-2.5 pt-1">{(d?.followers || []).map((f) => { const max = Math.max(1, ...(d?.followers || []).map((x) => x.current)); return (<div key={f.platform} className="grid gap-1"><div className="flex items-center justify-between text-xs"><span className="capitalize text-ink font-medium">{f.platform}</span><span className="text-muted">{compact(f.current)}</span></div><div className="h-2 rounded-full bg-canvas overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(f.current / max) * 100}%`, background: platColor(f.platform) }} /></div></div>); })}</div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Top Performing Posts" sub="Sắp theo tổng engagement">
            {(d?.topPosts || []).length === 0 ? <p className="text-sm text-muted py-8 text-center">Chưa có dữ liệu</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted border-b border-line"><th className="py-2 pr-3 font-medium">Post</th><th className="py-2 px-2 font-medium text-right">Likes</th><th className="py-2 px-2 font-medium text-right">Comm.</th><th className="py-2 px-2 font-medium text-right">Shares</th><th className="py-2 px-2 font-medium text-right">Saves</th><th className="py-2 px-2 font-medium text-right">Views</th><th className="py-2 px-2 font-medium text-right">Reach</th><th className="py-2 px-2 font-medium text-right">Clicks</th><th className="py-2 pl-2 font-medium text-right">ER</th></tr></thead>
                  <tbody>{(d?.topPosts || []).map((p) => (<tr key={p.id} className="border-b border-line last:border-0"><td className="py-2.5 pr-3 max-w-xs"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: platColor(p.platform) }} />{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-brand truncate">{p.title}</a> : <span className="text-ink truncate">{p.title}</span>}</div><div className="text-[11px] text-muted mt-0.5">{p.platform} · {p.date}</div></td><td className="py-2.5 px-2 text-right text-ink">{compact(p.likes)}</td><td className="py-2.5 px-2 text-right text-muted">{compact(p.comments)}</td><td className="py-2.5 px-2 text-right text-muted">{compact(p.shares)}</td><td className="py-2.5 px-2 text-right text-muted">{compact(p.saves)}</td><td className="py-2.5 px-2 text-right text-muted">{compact(p.views)}</td><td className="py-2.5 px-2 text-right text-muted">{compact(p.reach)}</td><td className="py-2.5 px-2 text-right text-muted">{compact(p.clicks)}</td><td className="py-2.5 pl-2 text-right font-medium text-ink">{p.er.toFixed(1)}%</td></tr>))}</tbody>
                </table>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Posting Frequency vs Engagement" sub="Bài/tuần so với engagement rate, theo nền tảng"><FrequencyScatter perPlatform={d?.perPlatform || []} periodDays={d?.periodDays || 30} /></ChartCard>
        </>
      )}
    </div>
  );
}
