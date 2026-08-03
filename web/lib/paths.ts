import "./env";
import path from "node:path";

// web/ → Content Agent repo root
export const REPO_ROOT = process.env.CONTENT_AGENT_ROOT
  ? path.resolve(process.env.CONTENT_AGENT_ROOT)
  : path.resolve(process.cwd(), "..");

function configuredPath(name: string, fallback: string): string {
  const value = (process.env[name] || "").trim();
  return value ? path.resolve(value) : fallback;
}

export const CONTENT_DIR = configuredPath("CONTENT_DIR", path.join(REPO_ROOT, "content"));
export const SYSTEM_DIR = configuredPath("SYSTEM_DIR", path.join(REPO_ROOT, "_system"));
export const MEDIA_DIR = path.join(CONTENT_DIR, "_media");
export const RESEARCH_DIR = configuredPath("RESEARCH_DIR", path.join(REPO_ROOT, "research"));

// Obsidian mirror là tuỳ chọn. Để trống hai biến môi trường thì app không mirror.
export const OBSIDIAN_CONTENT = (process.env.OBSIDIAN_CONTENT_DIR || "").trim()
  ? path.resolve(process.env.OBSIDIAN_CONTENT_DIR!)
  : null;
export const OBSIDIAN_RESEARCH = (process.env.OBSIDIAN_RESEARCH_DIR || "").trim()
  ? path.resolve(process.env.OBSIDIAN_RESEARCH_DIR!)
  : null;

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
