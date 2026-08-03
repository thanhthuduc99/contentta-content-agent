import "./env";
import { listComments, listCommentsOnPost, isConfigured } from "./zernio";
import { handleComment } from "./auto-react";
import { getState, saveState } from "./comment-state";

// Poll catch-up: quét comment mới (lúc mở máy / định kỳ) cho mấy comment mà
// webhook bỏ lỡ khi máy tắt. State dùng chung với webhook để không xử lý trùng.

type PostRow = { id: string; accountId: string; platform?: string; commentCount?: number };
type CommentRow = Record<string, unknown>;

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

export type PollResult = {
  scanned: number;
  fresh: number;
  acted: number;
  actions: string[];
  seeded?: number;
  error?: string;
};

export async function pollOnce(): Promise<PollResult> {
  const state = await getState();
  const seen = new Set(state.processed);
  let scanned = 0;
  let fresh = 0;
  let acted = 0;
  const actions: string[] = [];

  let posts: PostRow[] = [];
  try {
    const d = (await listComments({ limit: 50 })) as { data?: PostRow[] };
    posts = (d.data || []).filter((p) => (p.commentCount ?? 0) > 0);
  } catch (e) {
    return { scanned: 0, fresh: 0, acted: 0, actions: [], error: (e as Error).message };
  }

  const firstRun = !state.initialized;
  let seeded = 0;

  for (const post of posts) {
    let comments: CommentRow[] = [];
    try {
      const d = (await listCommentsOnPost(post.id, post.accountId)) as {
        comments?: CommentRow[];
      };
      comments = d.comments || [];
    } catch {
      continue;
    }
    for (const c of comments) {
      const commentId = pickStr(c, ["id", "commentId", "_id"]);
      if (!commentId || seen.has(commentId)) continue;
      seen.add(commentId);
      state.processed.push(commentId);
      scanned++;
      fresh++;
      // Lần chạy đầu tiên: chỉ seed baseline, KHÔNG hành động (tránh DM lại comment cũ).
      if (firstRun) {
        seeded++;
        continue;
      }
      const text = pickStr(c, ["content", "text", "message"]);
      const accountId = pickStr(c, ["accountId"]) || post.accountId;
      const platform = pickStr(c, ["platform"]) || post.platform;
      if (!text) continue;
      try {
        const res = await handleComment({ postId: post.id, commentId, accountId, text, platform });
        if (res.matched) {
          acted++;
          actions.push(...res.actions);
        }
      } catch (e) {
        actions.push("error:" + (e as Error).message.slice(0, 80));
      }
    }
  }

  state.initialized = true;
  state.lastRunAt = new Date().toISOString();
  await saveState(state);
  return { scanned, fresh, acted, actions, seeded: firstRun ? seeded : undefined };
}

// Vòng lặp poll: chạy 1 lần sau khi server lên (catch-up khi mở máy) + định kỳ.
let started = false;
export function startPollLoop(): void {
  if (started) return;
  started = true;
  if (!isConfigured()) return;
  const min = Number(process.env.ZERNIO_POLL_MINUTES || "5");
  if (!min || min <= 0) return;
  const run = () =>
    pollOnce()
      .then((r) =>
        r.error ? console.error("[poll] error:", r.error) : console.log("[poll]", JSON.stringify(r))
      )
      .catch((e) => console.error("[poll]", e));
  setTimeout(run, 10_000);
  setInterval(run, min * 60_000);
}
