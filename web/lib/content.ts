import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  CONTENT_DIR,
  OBSIDIAN_CONTENT,
  OBSIDIAN_DIRS,
  TYPE_DIRS,
} from "./paths";

export type ContentItem = {
  id: string; // relative path từ content/, vd "posts/2026-06-06_foo.md"
  type: string; // youtube | short | post
  content_type?: string; // nhan-tai-lieu | chia-se-kien-thuc
  platform?: string;
  accounts?: string; // accountId Zernio đã chọn đăng, nối bằng ';'
  date?: string; // ngày tạo
  topic?: string;
  status?: string; // draft | doing | done (kanban)
  publish_at?: string | null; // ISO datetime (giờ VN) — Calendar dùng field này. YouTube = ngày nhắc
  publish_caption?: string; // caption đăng riêng (Short bắt buộc; Post trống → dùng body)
  posted?: boolean;
  posted_at?: string | null;
  parent?: string | null;
  threads?: string; // biến thể caption riêng cho Threads
  edit_state?: string; // "editing" (đã gửi edit-agent) | "ready" (final.mp4 về, chờ duyệt)
  source_url?: string; // link YouTube/GitHub gốc của post sinh tự động
  cta_keyword?: string; // keyword CTA đã viết vào bài → prefill box Comment to DM lúc đăng
  first_comment?: string; // tự comment vào bài ngay sau khi đăng (chỗ để link)
  body: string;
};

const SUBDIRS = ["scripts", "posts", "shorts"];

// Folder → loại mặc định khi frontmatter thiếu type.
function folderType(file: string): string {
  const sep = path.sep;
  if (file.includes(`${sep}scripts${sep}`)) return "youtube";
  if (file.includes(`${sep}shorts${sep}`)) return "short";
  return "post";
}

// Normalize type cũ → youtube | short | post.
const TYPE_MAP: Record<string, string> = {
  "long-video": "youtube",
  youtube: "youtube",
  "short-video": "short",
  short: "short",
  post: "post",
};
function normType(raw: unknown, file: string): string {
  const r = typeof raw === "string" ? raw : "";
  return TYPE_MAP[r] || folderType(file);
}

// Normalize status → kiểu Zernio: draft | scheduled | queued | published | failed.
const STATUS_MAP: Record<string, string> = {
  draft: "draft",
  drafted: "draft",
  doing: "scheduled",
  scheduled: "scheduled",
  queued: "queued",
  done: "published",
  posted: "published",
  published: "published",
  failed: "failed",
};
function normStatus(raw: unknown, posted: boolean): string {
  const r = typeof raw === "string" ? raw : "";
  return STATUS_MAP[r] || (posted ? "published" : "draft");
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function fmtDate(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function parse(file: string, raw: string): ContentItem {
  const { data, content } = matter(raw);
  const id = path.relative(CONTENT_DIR, file).split(path.sep).join("/");
  const posted = Boolean(data.posted);
  return {
    id,
    type: normType(data.type, file),
    content_type: data.content_type as string | undefined,
    platform: data.platform as string | undefined,
    accounts: data.accounts as string | undefined,
    date: fmtDate(data.date),
    topic: data.topic as string | undefined,
    status: normStatus(data.status, posted),
    publish_at: (data.publish_at as string) ?? null,
    publish_caption: data.publish_caption as string | undefined,
    posted,
    posted_at: (data.posted_at as string) ?? null,
    parent: (data.parent as string) ?? null,
    threads: data.threads as string | undefined,
    edit_state: data.edit_state as string | undefined,
    source_url: data.source_url as string | undefined,
    cta_keyword: data.cta_keyword as string | undefined,
    first_comment: data.first_comment as string | undefined,
    body: content.trim(),
  };
}

export async function listItems(): Promise<ContentItem[]> {
  const files: string[] = [];
  for (const sub of SUBDIRS) files.push(...(await walk(path.join(CONTENT_DIR, sub))));
  const items = await Promise.all(
    files.map(async (f) => parse(f, await fs.readFile(f, "utf8")))
  );
  // mới nhất lên đầu
  return items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export async function getItem(id: string): Promise<ContentItem | null> {
  const file = path.join(CONTENT_DIR, ...id.split("/"));
  try {
    return parse(file, await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function toFrontmatter(item: ContentItem): string {
  // KHÔNG ghi field undefined — js-yaml dump sẽ crash ("unacceptable kind of object").
  const fm: Record<string, unknown> = { type: item.type };
  if (item.content_type) fm.content_type = item.content_type;
  if (item.platform) fm.platform = item.platform;
  if (item.accounts) fm.accounts = item.accounts;
  if (item.date) fm.date = item.date;
  if (item.topic) fm.topic = item.topic;
  fm.status = item.status || "draft";
  fm.publish_at = item.publish_at ?? null;
  fm.posted = item.posted ?? false;
  fm.posted_at = item.posted_at ?? null;
  fm.parent = item.parent ?? null;
  if (item.publish_caption) fm.publish_caption = item.publish_caption;
  if (item.threads) fm.threads = item.threads;
  if (item.edit_state) fm.edit_state = item.edit_state;
  if (item.source_url) fm.source_url = item.source_url;
  if (item.cta_keyword) fm.cta_keyword = item.cta_keyword;
  if (item.first_comment) fm.first_comment = item.first_comment;
  return matter.stringify(`\n${item.body}\n`, fm);
}

// Ghi vào content/ (source-of-truth) + mirror NGAY sang Obsidian.
export async function saveItem(item: ContentItem): Promise<ContentItem> {
  const out = toFrontmatter(item);
  const file = path.join(CONTENT_DIR, ...item.id.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, out, "utf8");
  await mirrorToObsidian(item, out);
  return item;
}

async function mirrorToObsidian(item: ContentItem, contents: string) {
  if (!OBSIDIAN_CONTENT) return;
  try {
    const obsSub = OBSIDIAN_DIRS[item.type] || "posts";
    const base = path.basename(item.id);
    const dest = path.join(OBSIDIAN_CONTENT, obsSub, base);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, contents, "utf8");
  } catch (e) {
    // Mirror lỗi (vault offline...) không được chặn việc lưu source.
    console.error("[obsidian mirror] failed:", e);
  }
}

export function newId(type: string, slug: string, date: string): string {
  const dir = TYPE_DIRS[type] || "posts";
  const clean = slug
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${dir}/${date}_${clean || "untitled"}.md`;
}
