"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type Item,
  STATUS_LABEL,
  TYPE_LABEL,
  EDIT_STATE_LABEL,
  statusKey,
  statusChipClass,
  editStateChipClass,
  itemTitle,
  itemPreview,
} from "./posts-status";

const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];
const isVideo = (f: string) => VIDEO_EXT.some((e) => f.toLowerCase().endsWith(e));

// Inline SVG icon nhỏ cho platform (16px, currentColor).
export function PlatformIcon({ p }: { p: string }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "currentColor" };
  switch (p) {
    case "facebook":
      return (
        <svg {...common} aria-label="Facebook">
          <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" aria-label="Instagram">
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "threads":
      return (
        <svg {...common} aria-label="Threads">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.6 11.5c-.3 1.7-1.7 2.8-3.6 2.8-2 0-3.4-1.2-3.4-2.9 0-1.6 1.3-2.7 3.4-2.7.6 0 1.1.1 1.6.2 0-.9-.5-1.5-1.5-1.5-.7 0-1.2.2-1.6.7l-1.1-.8c.6-.8 1.5-1.2 2.7-1.2 1.9 0 3 1.1 3 3.2v2.9zm-3.5-1.4c-1 0-1.6.4-1.6 1.1 0 .6.5 1 1.3 1 1 0 1.7-.6 1.8-1.7-.5-.3-1-.4-1.5-.4z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common} aria-label="LinkedIn">
          <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.3 18.3H5.7V9.8h2.6v8.5zM7 8.6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11.3 9.7h-2.6V14c0-1-.4-1.7-1.3-1.7-.7 0-1.1.5-1.3 1-.1.2-.1.4-.1.7v4.3h-2.6V9.8h2.6v1.1c.3-.5 1-1.3 2.4-1.3 1.7 0 3 1.1 3 3.5v5.2z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} aria-label="TikTok">
          <path d="M16 3c.3 1.9 1.4 3.4 3.3 3.6v2.6c-1.2.1-2.3-.2-3.3-.8v5.9c0 3-2.1 5.2-5 5.2a4.9 4.9 0 0 1-5-5c0-2.9 2.3-5 5.3-4.9v2.7c-.3-.1-.6-.1-.9-.1-1.3 0-2.3 1-2.3 2.3 0 1.4 1 2.4 2.3 2.4 1.4 0 2.4-1 2.4-2.6V3H16z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} aria-label="YouTube">
          <path d="M23 12s0-3.2-.4-4.7c-.2-.8-.9-1.5-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4c-.8.2-1.5.9-1.7 1.7C1 8.8 1 12 1 12s0 3.2.4 4.7c.2.8.9 1.5 1.7 1.7 1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4c.8-.2 1.5-.9 1.7-1.7.4-1.5.4-4.7.4-4.7zM9.8 15.3V8.7l5.7 3.3-5.7 3.3z" />
        </svg>
      );
    case "zalo":
      return (
        <span className="text-[10px] font-bold leading-none" aria-label="Zalo">
          Zalo
        </span>
      );
    default:
      return <span className="text-[10px] font-semibold leading-none">{p}</span>;
  }
}

export default function PostCard({ item }: { item: Item }) {
  const router = useRouter();
  const sk = statusKey(item);
  const platforms = item.platform ? item.platform.split(/[;,| ]+/).filter(Boolean) : [];
  const wantVideo = item.type === "short" || item.type === "youtube";

  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbIsVideo, setThumbIsVideo] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/media?id=${encodeURIComponent(item.id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const f: string = (d.files || [])[0];
        if (f) {
          setThumb(f);
          setThumbIsVideo(isVideo(f));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id]);

  const open = () => router.push(`/item?id=${encodeURIComponent(item.id)}`);

  return (
    <div
      onClick={open}
      className="card overflow-hidden cursor-pointer hover:border-brand transition flex flex-col"
    >
      <div className="flex gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink leading-snug line-clamp-2 break-words">
            {itemTitle(item)}
          </p>
          {itemPreview(item) && (
            <p className="text-xs text-muted leading-snug line-clamp-2 break-words mt-1">
              {itemPreview(item)}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-3 text-muted">
            {platforms.length > 0 ? (
              platforms.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-canvas border border-line text-ink"
                >
                  <PlatformIcon p={p} />
                </span>
              ))
            ) : (
              <span className="text-xs">—</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className={`chip ${statusChipClass(sk)}`}>{STATUS_LABEL[sk]}</span>
            {item.edit_state && EDIT_STATE_LABEL[item.edit_state] && (
              <span className={`chip ${editStateChipClass(item.edit_state)}`}>
                {EDIT_STATE_LABEL[item.edit_state]}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 w-24 h-24 rounded-lg bg-canvas border border-line overflow-hidden flex items-center justify-center">
          {thumb && !thumbIsVideo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media?id=${encodeURIComponent(item.id)}&file=${encodeURIComponent(thumb)}`}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : thumb && thumbIsVideo ? (
            <span className="text-2xl text-muted">▶</span>
          ) : wantVideo ? (
            <span className="text-2xl text-muted">▶</span>
          ) : (
            <span className="text-xs text-muted px-1 text-center">
              {TYPE_LABEL[item.type] || item.type}
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between px-4 py-2.5 border-t border-line bg-surface">
        <span className="chip">{STATUS_LABEL[sk]}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          className="text-muted hover:text-ink px-2 leading-none text-lg"
          aria-label="Mở"
        >
          ⋮
        </button>
      </div>
    </div>
  );
}
