import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import { CONTENT_DIR } from "./paths";
import { likeComment, privateReply, replyComment, listAccountsAll } from "./zernio";

// Rule keyword-gated do user định nghĩa: comment trúng keyword → reply công khai + like + DM soạn sẵn.
// Bổ sung cho Zernio comment-automation native (chỉ gửi DM, không react).
export type AutoRule = {
  id: string;
  accountId: string;
  platform?: string;
  keywords: string[]; // lower-case
  message: string; // DM soạn sẵn
  commentReply?: string; // reply công khai (vd "check inbox nha"); để trống = không reply
  postIds?: string[]; // platformPostId được áp; trống/undefined = áp mọi post
  react: boolean; // like comment
  enabled: boolean;
};

const FILE = path.join(CONTENT_DIR, "_zernio", "auto-rules.json");

export async function loadRules(): Promise<AutoRule[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as AutoRule[];
  } catch {
    return [];
  }
}

export async function saveRules(rules: AutoRule[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rules, null, 2), "utf8");
}

// Zernio chỉ gửi DM riêng được trên FB/IG. TikTok/YouTube/LinkedIn không có API này
// nên rule cho các platform đó là rule chết → chặn ở đây, không tin caller.
const DM_CAPABLE = ["facebook", "instagram"];

// Tạo rule comment-to-DM cho account FB/IG, gọi ngay sau khi đăng thành công.
// postIds map platform -> platformPostId của bài vừa đăng → rule chỉ áp đúng bài đó.
// Platform nào không có postId thì BỎ QUA (không tạo rule áp mọi post). Nuốt lỗi mềm.
export async function createCommentToDmRules(
  opts: {
    keyword: string;
    message: string;
    commentReply?: string;
    react?: boolean;
    postIds?: Record<string, string>;
  },
  platforms: string[] = DM_CAPABLE
): Promise<number> {
  const keyword = opts.keyword.trim().toLowerCase();
  if (!keyword || !opts.message.trim()) return 0;
  const wanted = platforms.map((p) => p.toLowerCase()).filter((p) => DM_CAPABLE.includes(p));
  if (!wanted.length) return 0;
  let accounts: { accountId: string; platform: string }[] = [];
  try {
    accounts = await listAccountsAll();
  } catch {
    return 0;
  }
  const targets = accounts.filter((a) => wanted.includes((a.platform || "").toLowerCase()));
  if (!targets.length) return 0;
  const rules = await loadRules();
  let made = 0;
  for (const a of targets) {
    const postId = opts.postIds?.[(a.platform || "").toLowerCase()];
    if (opts.postIds && !postId) continue; // có map mà platform này thiếu id → không tạo
    rules.push({
      id: crypto.randomUUID(),
      accountId: a.accountId,
      platform: a.platform,
      keywords: [keyword],
      message: opts.message,
      commentReply: opts.commentReply?.trim() || "Check inbox nha",
      postIds: postId ? [postId] : undefined,
      react: opts.react !== false,
      enabled: true,
    });
    made++;
  }
  if (!made) return 0;
  await saveRules(rules);
  return made;
}

function matches(rule: AutoRule, text: string): boolean {
  if (!rule.enabled || !rule.keywords.length) return false;
  const t = text.toLowerCase();
  return rule.keywords.some((k) => k && t.includes(k));
}

// Gọi từ webhook khi có comment mới.
export async function handleComment(c: {
  postId: string;
  commentId: string;
  accountId: string;
  text: string;
  platform?: string;
}): Promise<{ matched: boolean; actions: string[] }> {
  const rules = await loadRules();
  const actions: string[] = [];
  for (const rule of rules) {
    if (rule.accountId && rule.accountId !== c.accountId) continue;
    if (rule.postIds && rule.postIds.length && !rule.postIds.includes(c.postId)) continue;
    if (!matches(rule, c.text)) continue;
    if (rule.commentReply) {
      try {
        await replyComment(c.postId, {
          accountId: c.accountId,
          message: rule.commentReply,
          commentId: c.commentId,
        });
        actions.push("reply");
      } catch (e) {
        actions.push("reply-failed:" + (e as Error).message.slice(0, 80));
      }
    }
    if (rule.react) {
      try {
        await likeComment(c.postId, c.commentId, c.accountId);
        actions.push("like");
      } catch (e) {
        actions.push("like-failed:" + (e as Error).message.slice(0, 80));
      }
    }
    if (rule.message) {
      try {
        await privateReply(c.postId, c.commentId, { accountId: c.accountId, message: rule.message });
        actions.push("dm");
      } catch (e) {
        actions.push("dm-failed:" + (e as Error).message.slice(0, 80));
      }
    }
    return { matched: true, actions };
  }
  return { matched: false, actions };
}
