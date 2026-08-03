"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  type: string;
  content_type?: string;
  topic?: string;
  date?: string;
  status?: string;
  publish_at?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  youtube: "YouTube",
  short: "Video ngắn",
  post: "Post",
};

const COLUMNS: { key: string; label: string }[] = [
  { key: "draft", label: "Nháp" },
  { key: "doing", label: "Đang làm" },
  { key: "done", label: "Xong" },
];

const COL_BADGE: Record<string, string> = {
  draft: "!bg-gray-50 !text-gray-700 !border-gray-200",
  doing: "!bg-blue-50 !text-blue-700 !border-blue-200",
  done: "!bg-green-50 !text-green-700 !border-green-200",
};

const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "youtube", label: "YouTube" },
  { key: "short", label: "Video ngắn" },
  { key: "post", label: "Post" },
];

function publishLabel(it: Item): string {
  if (!it.publish_at) return "";
  const d = new Date(it.publish_at);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function colOf(it: Item): string {
  const s = it.status || "draft";
  return s === "doing" || s === "done" ? s : "draft";
}

export default function KanbanPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/queue")
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setItems(d.items || [])))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (typeFilter === "all" ? items : items.filter((it) => it.type === typeFilter)),
    [items, typeFilter]
  );

  const byCol = useMemo(() => {
    const map: Record<string, Item[]> = { draft: [], doing: [], done: [] };
    for (const it of filtered) map[colOf(it)].push(it);
    return map;
  }, [filtered]);

  async function moveTo(id: string, status: string) {
    const cur = items.find((it) => it.id === id);
    if (!cur || colOf(cur) === status) return;
    // optimistic
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    try {
      const res = await fetch("/api/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      if (d.item) setItems((prev) => prev.map((it) => (it.id === id ? d.item : it)));
    } catch (e) {
      // rollback
      setItems((prev) => prev.map((it) => (it.id === id ? cur : it)));
      setErr(String(e));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-ink">Kanban</h1>
        <div className="flex items-center gap-2">
          <span className="label">Loại</span>
          <select
            className="select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {TYPE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-muted">Đang tải…</p>}
      {err && <p className="text-brand">{err}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colItems = byCol[col.key];
          const isOver = overCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== col.key) setOverCol(col.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOverCol((c) => (c === col.key ? null : c));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                if (dragId) moveTo(dragId, col.key);
                setDragId(null);
              }}
              className={`card p-3 grid content-start gap-2.5 min-h-40 transition ${
                isOver ? "border-brand bg-canvas" : ""
              }`}
            >
              <div className="flex items-center justify-between px-1">
                <span className="font-semibold text-ink">{col.label}</span>
                <span className={`chip ${COL_BADGE[col.key]}`}>{colItems.length}</span>
              </div>

              {colItems.length === 0 && (
                <div className="text-xs text-muted text-center py-6">Trống</div>
              )}

              {colItems.map((it) => {
                const t = publishLabel(it);
                return (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={() => setDragId(it.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    onClick={() => router.push(`/item?id=${encodeURIComponent(it.id)}`)}
                    className="card p-3 cursor-pointer border-line hover:border-brand transition active:opacity-60"
                  >
                    <div className="font-medium text-ink text-sm truncate">
                      {it.topic || it.id}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="chip">{TYPE_LABEL[it.type] || it.type}</span>
                      {t && <span className="text-xs text-muted">{t}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
