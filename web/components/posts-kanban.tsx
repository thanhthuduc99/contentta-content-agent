"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type Item,
  type StatusKey,
  STATUS_ORDER,
  STATUS_LABEL,
  TYPE_LABEL,
  statusKey,
  statusChipClass,
  fmtDate,
} from "./posts-status";
import { PlatformIcon } from "./post-card";

export default function PostsKanban({
  items,
  onUpdate,
  onError,
}: {
  items: Item[];
  onUpdate: (id: string, partial: Partial<Item>) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const byCol = useMemo(() => {
    const map: Record<string, Item[]> = {
      draft: [],
      scheduled: [],
      queued: [],
      published: [],
      failed: [],
    };
    for (const it of items) map[statusKey(it)].push(it);
    return map;
  }, [items]);

  async function moveTo(id: string, status: StatusKey) {
    const cur = items.find((it) => it.id === id);
    if (!cur || statusKey(cur) === status) return;
    const prevStatus = cur.status;
    onUpdate(id, { status });
    try {
      const res = await fetch("/api/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      if (d.item) onUpdate(id, d.item);
    } catch (e) {
      onUpdate(id, { status: prevStatus });
      onError(String(e));
    }
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-max">
        {STATUS_ORDER.map((colKey) => {
          const colItems = byCol[colKey];
          const isOver = overCol === colKey;
          return (
            <div
              key={colKey}
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== colKey) setOverCol(colKey);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOverCol((c) => (c === colKey ? null : c));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                if (dragId) moveTo(dragId, colKey);
                setDragId(null);
              }}
              className={`shrink-0 min-w-[280px] max-w-[300px] grid content-start gap-3 rounded-xl bg-[#F1EADD]/90 backdrop-blur-sm border border-line p-3 transition ${
                isOver ? "ring-2 ring-brand" : ""
              }`}
            >
              <div className="flex items-center gap-2 px-0.5">
                <span
                  className={`chip ${statusChipClass(colKey)} font-semibold`}
                >
                  {STATUS_LABEL[colKey]}
                </span>
                <span className="chip !bg-white !text-muted !border-line ml-auto">
                  {colItems.length}
                </span>
              </div>

              {colItems.length === 0 && (
                <div className="text-xs text-muted text-center py-8">Trống</div>
              )}

              {colItems.map((it) => {
                const t = fmtDate(it.publish_at);
                const platforms = it.platform
                  ? it.platform.split(/[;,| ]+/).filter(Boolean)
                  : [];
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
                    className="bg-white rounded-lg border border-line shadow-sm p-3.5 cursor-pointer hover:border-brand hover:shadow transition active:opacity-60"
                  >
                    <div className="font-semibold text-ink text-sm leading-snug line-clamp-2">
                      {it.topic || it.id}
                    </div>
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap text-muted">
                      {platforms.map((p) => (
                        <PlatformIcon key={p} p={p} />
                      ))}
                      <span className="chip !bg-canvas">{TYPE_LABEL[it.type] || it.type}</span>
                      {it.publish_at && (
                        <span className="text-xs text-muted ml-auto">{t}</span>
                      )}
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
