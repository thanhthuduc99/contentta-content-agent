import path from "node:path";
import "./env";

// web/ → Content Agent repo root. Đặt CONTENT_AGENT_ROOT nếu content/ _system/
// research/ nằm ngoài repo. Import "./env" phải đứng trước mọi lần đọc process.env
// vì dotenv nạp .env trong đó.
export const REPO_ROOT = process.env.CONTENT_AGENT_ROOT?.trim() || path.resolve(process.cwd(), "..");
export const CONTENT_DIR = process.env.CONTENT_DIR?.trim() || path.join(REPO_ROOT, "content");
export const SYSTEM_DIR = process.env.SYSTEM_DIR?.trim() || path.join(REPO_ROOT, "_system");
export const MEDIA_DIR = path.join(CONTENT_DIR, "_media");
export const RESEARCH_DIR = process.env.RESEARCH_DIR?.trim() || path.join(REPO_ROOT, "research");

// Obsidian mirror — backend là source-of-truth, Obsidian là bản sao tức thì.
// Để trống trong .env là tắt mirror.
export const OBSIDIAN_CONTENT = process.env.OBSIDIAN_CONTENT_DIR?.trim() || "";
export const OBSIDIAN_RESEARCH = process.env.OBSIDIAN_RESEARCH_DIR?.trim() || "";

// type (frontmatter) → folder name trong content/ và Obsidian
// Loại: youtube | short | post (folder vẫn scripts/shorts/posts).
export const TYPE_DIRS: Record<string, string> = {
  youtube: "scripts",
  short: "shorts",
  post: "posts",
};

export const OBSIDIAN_DIRS: Record<string, string> = {
  youtube: "youtube",
  short: "shorts",
  post: "posts",
};

// Folder media của 1 item — PHẢI trùng transform safe() trong app/api/media/route.ts.
export function mediaDirFor(id: string): string {
  const safe = id.replace(/\//g, "__").replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(MEDIA_DIR, safe);
}
