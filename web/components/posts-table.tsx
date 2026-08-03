"use client";
import { useRouter } from "next/navigation";
import {
  type Item,
  STATUS_LABEL,
  TYPE_LABEL,
  statusKey,
  statusChipClass,
  fmtDate,
  itemTitle,
  itemPreview,
} from "./posts-status";

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  zalo: "Zalo",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export default function PostsTable({ items }: { items: Item[] }) {
  const router = useRouter();
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold text-muted">
            <th className="px-4 py-3 font-semibold">Nội dung</th>
            <th className="px-4 py-3 font-semibold">Nền tảng</th>
            <th className="px-4 py-3 font-semibold">Ngày</th>
            <th className="px-4 py-3 font-semibold">Trạng thái</th>
            <th className="px-4 py-3 font-semibold">Loại</th>
            <th className="px-4 py-3 font-semibold w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const sk = statusKey(it);
            const platforms = it.platform ? it.platform.split(/[;,| ]+/).filter(Boolean) : [];
            const open = () => router.push(`/item?id=${encodeURIComponent(it.id)}`);
            return (
              <tr
                key={it.id}
                onClick={open}
                className="border-b border-line last:border-0 cursor-pointer hover:bg-canvas transition"
              >
                <td className="px-4 py-3 max-w-md">
                  <div className="font-semibold text-ink truncate" title={itemTitle(it)}>
                    {itemTitle(it)}
                  </div>
                  {itemPreview(it, 90) && (
                    <div className="text-xs text-muted truncate">{itemPreview(it, 90)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {platforms.length > 0
                    ? platforms.map((p) => PLATFORM_LABEL[p] || p).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">
                  {fmtDate(it.publish_at)}
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${statusChipClass(sk)}`}>{STATUS_LABEL[sk]}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="chip">{TYPE_LABEL[it.type] || it.type}</span>
                </td>
                <td className="px-4 py-3 text-right">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
