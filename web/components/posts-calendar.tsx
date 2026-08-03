"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type Item,
  TYPE_LABEL,
  statusKey,
  statusChipClass,
} from "./posts-status";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MONTHS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function itemKey(it: Item): string | null {
  if (!it.publish_at) return null;
  const d = new Date(it.publish_at);
  if (isNaN(d.getTime())) return null;
  return ymd(d);
}

function itemTime(it: Item): string {
  if (!it.publish_at) return "";
  const d = new Date(it.publish_at);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export default function PostsCalendar({
  items,
  onUpdate,
  onError,
}: {
  items: Item[];
  onUpdate: (id: string, partial: Partial<Item>) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const k = itemKey(it);
      if (!k) continue;
      const arr = map.get(k);
      if (arr) arr.push(it);
      else map.set(k, [it]);
    }
    return map;
  }, [items]);

  const unscheduled = useMemo(() => items.filter((it) => !it.publish_at), [items]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startDay = (first.getDay() + 6) % 7; // Monday = 0
    return Array.from({ length: 42 }, (_, i) => new Date(cursor.y, cursor.m, 1 - startDay + i));
  }, [cursor]);

  const todayKey = ymd(new Date());

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  async function dropOnDay(dateKey: string) {
    const id = dragId;
    setDragId(null);
    setDragOverKey(null);
    if (!id) return;
    const publish_at = `${dateKey}T09:00:00+07:00`;
    onUpdate(id, { publish_at });
    try {
      const res = await fetch("/api/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, publish_at }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      if (d.item) onUpdate(id, d.item);
    } catch (e) {
      onError(String(e));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={() => shift(-1)}>
            ←
          </button>
          <span className="font-semibold text-ink w-32 text-center">
            {MONTHS[cursor.m]} {cursor.y}
          </span>
          <button className="btn btn-ghost" onClick={() => shift(1)}>
            →
          </button>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const n = new Date();
            setCursor({ y: n.getFullYear(), m: n.getMonth() });
          }}
        >
          Hôm nay
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-2 text-xs font-semibold text-muted text-center">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const k = ymd(d);
              const inMonth = d.getMonth() === cursor.m;
              const dayItems = byDate.get(k) || [];
              const isOver = dragOverKey === k;
              return (
                <div
                  key={i}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverKey !== k) setDragOverKey(k);
                  }}
                  onDragLeave={() => setDragOverKey((cur) => (cur === k ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOnDay(k);
                  }}
                  className={`min-h-28 border-b border-r border-line p-1.5 ${
                    inMonth ? "" : "bg-canvas"
                  } ${i % 7 === 0 ? "border-l" : ""} ${
                    isOver ? "!bg-blue-50 ring-1 ring-blue-200" : ""
                  }`}
                >
                  <div
                    className={`text-xs mb-1 ${
                      k === todayKey
                        ? "font-bold text-brand"
                        : inMonth
                        ? "text-ink"
                        : "text-muted"
                    }`}
                  >
                    {d.getDate()}
                  </div>
                  <div className="grid gap-1">
                    {dayItems.map((it) => {
                      const t = itemTime(it);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          draggable
                          onDragStart={() => setDragId(it.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setDragOverKey(null);
                          }}
                          onClick={() => router.push(`/item?id=${encodeURIComponent(it.id)}`)}
                          className={`chip w-full !justify-start text-left truncate cursor-grab active:cursor-grabbing ${statusChipClass(
                            statusKey(it)
                          )}`}
                          title={it.topic || it.id}
                        >
                          {t && <span className="opacity-70 mr-1">{t}</span>}
                          {it.topic || it.id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-3 grid gap-2 content-start">
          <div className="font-semibold text-ink text-sm">Chưa lên lịch</div>
          <p className="text-xs text-muted">Kéo thả vào ô ngày để lên lịch (09:00).</p>
          {unscheduled.length === 0 ? (
            <p className="text-xs text-muted">Không còn item nào.</p>
          ) : (
            <div className="grid gap-1.5">
              {unscheduled.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  draggable
                  onDragStart={() => setDragId(it.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverKey(null);
                  }}
                  onClick={() => router.push(`/item?id=${encodeURIComponent(it.id)}`)}
                  className={`chip w-full !justify-start text-left truncate cursor-grab active:cursor-grabbing ${statusChipClass(
                    statusKey(it)
                  )}`}
                  title={it.topic || it.id}
                >
                  <span className="opacity-70 mr-1">{TYPE_LABEL[it.type] || it.type}</span>
                  {it.topic || it.id}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
