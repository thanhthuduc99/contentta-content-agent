// Status contract Zernio dùng chung cho mọi view Posts.
export type Item = {
  id: string;
  type: string;
  content_type?: string;
  platform?: string;
  date?: string;
  topic?: string;
  status?: string;
  publish_at?: string | null;
  posted?: boolean;
  posted_at?: string | null;
  parent?: string | null;
  threads?: string;
  edit_state?: string;
  source_url?: string;
  body?: string;
};

export const STATUS_ORDER = ["draft", "scheduled", "queued", "published", "failed"] as const;
export type StatusKey = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  queued: "Queued",
  published: "Published",
  failed: "Failed",
};

export const TYPE_LABEL: Record<string, string> = {
  youtube: "YouTube",
  short: "Video ngắn",
  post: "Post",
};

export function statusKey(it: Item): StatusKey {
  const s = (it.status || "draft") as StatusKey;
  return STATUS_ORDER.includes(s) ? s : "draft";
}

export function statusChipClass(s?: string): string {
  switch (s) {
    case "published":
      return "!bg-green-50 !text-green-700 !border-green-200";
    case "scheduled":
      return "!bg-blue-50 !text-blue-700 !border-blue-200";
    case "queued":
      return "!bg-amber-50 !text-amber-700 !border-amber-200";
    case "failed":
      return "!bg-red-50 !text-red-700 !border-red-200";
    default:
      return "!bg-gray-50 !text-gray-600 !border-gray-200";
  }
}

// Chip phụ cho trạng thái edit-agent (status chính vẫn là draft).
export const EDIT_STATE_LABEL: Record<string, string> = {
  editing: "Đang edit",
  ready: "Chờ duyệt",
};
export function editStateChipClass(s?: string): string {
  if (s === "ready") return "!bg-blue-50 !text-blue-700 !border-blue-200";
  return "!bg-amber-50 !text-amber-700 !border-amber-200";
}

// Tiêu đề sạch để hiển thị (in đậm, không markdown): ưu tiên topic, fallback heading đầu body.
export function itemTitle(it: Item): string {
  if (it.topic && it.topic.trim()) return it.topic.trim();
  const body = (it.body || "").replace(/^---[\s\S]*?---/, "").trim();
  const first = body.split("\n").map((l) => l.trim()).find(Boolean) || "";
  const clean = first
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^\*+|\*+$/g, "")
    .trim();
  return clean || it.id;
}

// Preview body đã bỏ ký hiệu markdown + bỏ dòng tiêu đề trùng.
export function itemPreview(it: Item, max = 160): string {
  const body = (it.body || "")
    .replace(/^---[\s\S]*?---/, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const title = itemTitle(it);
  const s = body.startsWith(title) ? body.slice(title.length).trim() : body;
  return s.slice(0, max);
}

export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
