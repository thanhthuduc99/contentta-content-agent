import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import { CONTENT_DIR } from "./paths";

// State chung cho webhook + poll: commentId nào đã xử lý → không làm lại.
const FILE = path.join(CONTENT_DIR, "_zernio", "comment-state.json");
const CAP = 3000;

export type CommentState = {
  initialized: boolean; // đã seed baseline lần đầu chưa
  processed: string[];
  lastRunAt: string | null;
};

export async function getState(): Promise<CommentState> {
  try {
    const s = JSON.parse(await fs.readFile(FILE, "utf8")) as CommentState;
    return {
      initialized: !!s.initialized,
      processed: Array.isArray(s.processed) ? s.processed : [],
      lastRunAt: s.lastRunAt || null,
    };
  } catch {
    return { initialized: false, processed: [], lastRunAt: null };
  }
}

export async function saveState(s: CommentState): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const processed = s.processed.length > CAP ? s.processed.slice(-CAP) : s.processed;
  await fs.writeFile(FILE, JSON.stringify({ ...s, processed }, null, 2), "utf8");
}

export async function wasProcessed(id: string): Promise<boolean> {
  const s = await getState();
  return s.processed.includes(id);
}

export async function markProcessed(id: string): Promise<void> {
  const s = await getState();
  if (!s.processed.includes(id)) {
    s.processed.push(id);
    if (!s.initialized) s.initialized = true;
    await saveState(s);
  }
}
