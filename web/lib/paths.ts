import path from "node:path";

// web/ → Content Agent repo root
export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const CONTENT_DIR = path.join(REPO_ROOT, "content");
export const SYSTEM_DIR = path.join(REPO_ROOT, "_system");
export const MEDIA_DIR = path.join(CONTENT_DIR, "_media");
export const RESEARCH_DIR = path.join(REPO_ROOT, "research");

// Obsidian mirror — backend là source-of-truth, Obsidian là bản sao tức thì.
export const OBSIDIAN_CONTENT = path.join(
  "D:",
  "thanh",
  "Obsidian",
  "thanh",
  "Business",
  "Contentta",
  "Content"
);
export const OBSIDIAN_RESEARCH = path.join(
  "D:",
  "thanh",
  "Obsidian",
  "thanh",
  "Business",
  "Contentta",
  "Research"
);

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
