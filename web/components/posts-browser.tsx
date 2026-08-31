"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import PostCard from "@/components/post-card";
import PostsTable from "@/components/posts-table";
import PostsCalendar from "@/components/posts-calendar";
import PostsKanban from "@/components/posts-kanban";
import {
  type Item,
  STATUS_ORDER,
  STATUS_LABEL,
  statusKey,
} from "@/components/posts-status";

type View = "grid" | "table" | "calendar" | "kanban";

const TYPE_OPTIONS = [
  { value: "all", label: "Tất cả loại" },
  { value: "youtube", label: "YouTube" },
  { value: "short", label: "Video ngắn" },
  { value: "post", label: "Post" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

const DEFAULT_PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "threads", label: "Threads" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
];

const SORT_OPTIONS = [
  { value: "new", label: "Mới nhất" },
  { value: "old", label: "Cũ nhất" },
];

const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: "grid", label: "Lưới", icon: "▦" },
  { key: "table", label: "Bảng", icon: "≣" },
  { key: "calendar", label: "Lịch", icon: "▢" },
  { key: "kanban", label: "Kanban", icon: "▥" },
];

// Pill select kiểu Zernio: bo tròn, viền mảnh, chevron.
function PillSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full border border-line bg-surface pl-4 pr-8 py-1.5 text-sm font-medium text-ink hover:border-[#cfcfd4] cursor-pointer focus:outline-none focus:border-brand"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 text-muted text-xs">▾</span>
    </div>
  );
}

function sortDate(it: Item): number {
  const v = it.publish_at || it.posted_at || it.date;
  if (!v) return 0;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export default function PostsBrowser({
  fixedType,
  title,
  subtitle,
  platformOptions,
  hidePlatformFilter,
  actions,
  reloadKey = 0,
}: {
  fixedType?: "youtube" | "short" | "post";
  title: string;
  subtitle?: string;
  platformOptions?: { value: string; label: string }[];
  hidePlatformFilter?: boolean;
  actions?: ReactNode;
  reloadKey?: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sort, setSort] = useState("new");
  const [view, setView] = useState<View>("grid");

  const platOpts = useMemo(
    () => [{ value: "all", label: "Tất cả nền tảng" }, ...(platformOptions || DEFAULT_PLATFORM_OPTIONS)],
    [platformOptions]
  );

  function syncUrl(updates: Record<string, string>) {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === "all" || (k === "sort" && v === "new") || (k === "view" && v === "grid")) {
        url.searchParams.delete(k);
      } else {
        url.searchParams.set(k, v);
      }
    }
    window.history.replaceState(null, "", url.toString());
  }

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/queue")
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setItems(d.items || [])))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // init filters + view từ URL params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("view") as View | null;
    if (v && VIEWS.some((vv) => vv.key === v)) setView(v);
    if (!fixedType) {
      const type = p.get("type");
      if (type) setTypeFilter(type);
    }
    const status = p.get("status"); if (status) setStatusFilter(status);
    const platform = p.get("platform"); if (platform) setPlatformFilter(platform);
    const sort = p.get("sort"); if (sort) setSort(sort);
  }, [fixedType]);

  function changeView(v: View) {
    setView(v);
    syncUrl({ view: v });
  }

  const updateItem = useCallback((id: string, partial: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...partial } : it)));
  }, []);

  const scoped = useMemo(
    () => (fixedType ? items.filter((it) => it.type === fixedType) : items),
    [items, fixedType]
  );

  const filtered = useMemo(() => {
    const out = scoped.filter((it) => {
      if (!fixedType && typeFilter !== "all" && it.type !== typeFilter) return false;
      if (statusFilter !== "all" && statusKey(it) !== statusFilter) return false;
      if (platformFilter !== "all") {
        const ps = (it.platform || "").split(/[;,| ]+/).filter(Boolean);
        if (!ps.includes(platformFilter)) return false;
      }
      return true;
    });
    out.sort((a, b) =>
      sort === "new" ? sortDate(b) - sortDate(a) : sortDate(a) - sortDate(b)
    );
    return out;
  }, [scoped, fixedType, typeFilter, statusFilter, platformFilter, sort]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center flex-wrap gap-2">
          {!fixedType && (
            <PillSelect value={typeFilter} onChange={(v) => { setTypeFilter(v); syncUrl({ type: v }); }} options={TYPE_OPTIONS} />
          )}
          <PillSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); syncUrl({ status: v }); }} options={STATUS_OPTIONS} />
          {!hidePlatformFilter && (
            <PillSelect value={platformFilter} onChange={(v) => { setPlatformFilter(v); syncUrl({ platform: v }); }} options={platOpts} />
          )}
          <PillSelect value={sort} onChange={(v) => { setSort(v); syncUrl({ sort: v }); }} options={SORT_OPTIONS} />
        </div>

        {/* View toggle */}
        <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => changeView(v.key)}
              title={v.label}
              className={`w-8 h-8 rounded-full text-sm transition ${
                view === v.key ? "bg-brand text-white" : "text-muted hover:text-ink"
              }`}
            >
              {v.icon}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-muted">Đang tải…</p>}
      {err && <p className="text-brand">{err}</p>}

      {!loading && !err && scoped.length === 0 && (
        <div className="card p-10 text-center text-muted">
          Chưa có nội dung nào. Bấm <b>Tạo bài</b> để bắt đầu.
        </div>
      )}
      {!loading && !err && scoped.length > 0 && filtered.length === 0 && view !== "calendar" && (
        <div className="card p-10 text-center text-muted">Không có bài nào khớp bộ lọc.</div>
      )}

      {!loading && !err && (filtered.length > 0 || view === "calendar") && (
        <>
          {view === "grid" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((it) => (
                <PostCard key={it.id} item={it} />
              ))}
            </div>
          )}
          {view === "table" && <PostsTable items={filtered} />}
          {view === "calendar" && (
            <PostsCalendar items={filtered} onUpdate={updateItem} onError={setErr} />
          )}
          {view === "kanban" && (
            <PostsKanban items={filtered} onUpdate={updateItem} onError={setErr} />
          )}
        </>
      )}
    </div>
  );
}
