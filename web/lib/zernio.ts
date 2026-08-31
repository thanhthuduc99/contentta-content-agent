import "./env";
import { getKey } from "./keys";

// Zernio public API client. Base + auth verified LIVE.
// Spec: https://docs.zernio.com/api/openapi  (base https://zernio.com/api, paths /v1/...)
const DEFAULT_BASE = "https://zernio.com/api/v1";

function baseUrl() {
  return (process.env.ZERNIO_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

// Nhiều key Zernio phân cách dấu phẩy (mỗi key = 1 workspace).
export function zernioKeys(): string[] {
  return getKey("ZERNIO_API_KEY")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function cfg() {
  return { key: zernioKeys()[0] || "", base: baseUrl() };
}

export function isConfigured(): boolean {
  return zernioKeys().length > 0;
}

type Query = Record<string, string | number | boolean | undefined | null>;

// Gọi Zernio với 1 key cụ thể (cho multi-key: analytics/accounts/publish loop từng key).
export async function zfetchWith<T = unknown>(
  key: string,
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const base = baseUrl();
  if (!key) throw new Error("ZERNIO_API_KEY chưa cấu hình (đặt ở root .env)");
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  // Không có timeout thì Zernio treo là request Next treo theo, UI kẹt nút vô hạn.
  const timeoutMs = opts.timeoutMs ?? 120_000;
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") {
      throw new Error(`Zernio ${method} ${path} quá ${Math.round(timeoutMs / 1000)}s không trả lời`);
    }
    throw new Error(`Zernio ${method} ${path} lỗi kết nối: ${(e as Error).message}`);
  }
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!r.ok) {
    const msg =
      (json as { error?: string; message?: string })?.error ||
      (json as { message?: string })?.message ||
      text.slice(0, 300);
    const e = new Error(`Zernio ${method} ${path} → ${r.status}: ${msg}`);
    (e as Error & { status?: number }).status = r.status;
    throw e;
  }
  return json as T;
}

// Wrapper back-compat: dùng key đầu tiên (inbox, comment-to-DM, post picker…).
export function zfetch<T = unknown>(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown } = {}
): Promise<T> {
  return zfetchWith<T>(cfg().key, method, path, opts);
}

// ---------- Accounts ----------
export type ZAccount = {
  _id: string;
  platform: string;
  displayName?: string;
  profileId?: { _id: string; name?: string } | string;
  metadata?: Record<string, unknown>;
};

export async function listAccounts(query?: { platform?: string; profileId?: string }) {
  const data = await zfetch<{ accounts: ZAccount[] }>("GET", "/accounts", { query });
  return data.accounts || [];
}

// ---------- Multi-key: gộp account + map platform→account ----------
export type MappedAccount = { key: string; accountId: string; profileId?: string; platform: string; displayName: string };

function profId(a: ZAccount): string | undefined {
  return typeof a.profileId === "string" ? a.profileId : a.profileId?._id;
}

// Gộp account từ TẤT CẢ key (mỗi account biết thuộc key nào).
export async function listAccountsAll(): Promise<MappedAccount[]> {
  const out: MappedAccount[] = [];
  await Promise.all(
    zernioKeys().map(async (key) => {
      try {
        const data = await zfetchWith<{ accounts: ZAccount[] }>(key, "GET", "/accounts");
        for (const a of data.accounts || []) {
          out.push({
            key,
            accountId: a._id,
            profileId: profId(a),
            platform: a.platform,
            displayName: a.displayName || "",
          });
        }
      } catch {
        /* key lỗi → bỏ qua */
      }
    })
  );
  return out;
}

// Cache map platform → account (dùng cho publish). Platform trùng (TikTok ở 2 key) → lấy key đầu.
let _accMapCache: { at: number; map: Record<string, MappedAccount> } | null = null;
export async function getAccountMap(): Promise<Record<string, MappedAccount>> {
  if (_accMapCache && Date.now() - _accMapCache.at < 5 * 60_000) return _accMapCache.map;
  const accs = await listAccountsAll();
  const map: Record<string, MappedAccount> = {};
  for (const a of accs) if (!map[a.platform]) map[a.platform] = a;
  _accMapCache = { at: Date.now(), map };
  return map;
}

// Cache map accountId → key. Inbox cần key ĐÚNG của từng account (YouTube ở key2,
// LinkedIn ở key3) nên không dùng được getAccountMap (gộp theo platform).
let _accKeyCache: { at: number; accs: MappedAccount[] } | null = null;
async function allAccounts(): Promise<MappedAccount[]> {
  if (_accKeyCache && Date.now() - _accKeyCache.at < 5 * 60_000) return _accKeyCache.accs;
  const accs = await listAccountsAll();
  _accKeyCache = { at: Date.now(), accs };
  return accs;
}

export async function keyForAccount(accountId: string): Promise<string | undefined> {
  return (await allAccounts()).find((a) => a.accountId === accountId)?.key;
}

export async function accountsOfPlatform(platform: string): Promise<MappedAccount[]> {
  return (await allAccounts()).filter((a) => a.platform === platform);
}

// Resolve accountId → account (publish chọn theo account, không gộp theo platform nữa).
export async function accountsById(ids: string[]): Promise<MappedAccount[]> {
  const want = new Set(ids);
  let all = await allAccounts();
  // Account vừa kết nối chưa vào cache 5 phút → refetch trước khi báo không tìm thấy.
  if (ids.some((id) => !all.some((a) => a.accountId === id))) {
    all = await listAccountsAll();
    _accKeyCache = { at: Date.now(), accs: all };
  }
  return all.filter((a) => want.has(a.accountId));
}

// ---------- Lấy playlist YouTube (cho tab Đăng lại + Daily news) ----------
export type YtPlaylist = {
  id: string;
  title: string;
  description?: string;
  privacy?: string;
  itemCount?: number;
  thumbnailUrl?: string;
};

export async function listYoutubePlaylists(): Promise<YtPlaylist[]> {
  const map = await getAccountMap();
  const yt = map["youtube"];
  if (!yt) throw new Error("Chưa kết nối YouTube trong Zernio");
  const data = await zfetchWith<{ playlists?: YtPlaylist[] }>(
    yt.key,
    "GET",
    `/accounts/${encodeURIComponent(yt.accountId)}/youtube-playlists`
  );
  return data.playlists || [];
}

// Lấy profileId mặc định (nhiều create cần profileId).
export async function defaultProfileId(): Promise<string | undefined> {
  const accs = await listAccounts();
  for (const a of accs) {
    const p = typeof a.profileId === "string" ? a.profileId : a.profileId?._id;
    if (p) return p;
  }
  return undefined;
}

export function followerStats(query?: {
  accountIds?: string;
  profileId?: string;
  fromDate?: string;
  toDate?: string;
  granularity?: string;
}) {
  return zfetch("GET", "/accounts/follower-stats", { query });
}

export function accountsHealth() {
  return zfetch("GET", "/accounts/health");
}

// ---------- Analytics ----------
export function getAnalytics(query?: {
  postId?: string;
  platform?: string;
  profileId?: string;
  accountId?: string;
  source?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  page?: number;
  sortBy?: string;
  order?: string;
}) {
  return zfetch("GET", "/analytics", { query });
}

// ---------- Published posts (cho post picker) ----------
// Nguồn: /analytics trả posts[] đã publish, mỗi post có content (caption),
// mediaType, thumbnailUrl, và platforms[].platformPostId (ID native để scope rule).
export type PickerPost = {
  platformPostId: string;
  zid: string;
  accountId: string;
  platform: string;
  caption: string;
  mediaType: string;
  thumbnail: string | null;
  url: string | null;
  publishedAt: string | null;
};

type AnalyticsPost = {
  _id?: string;
  content?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  platformPostUrl?: string;
  publishedAt?: string;
  platform?: string;
  accountId?: string;
  platformPostId?: string;
  platforms?: Array<{
    platformPostId?: string;
    accountId?: string;
    platform?: string;
    platformPostUrl?: string;
  }>;
};

export async function listPublishedPosts(query?: {
  accountId?: string;
  limit?: number;
}): Promise<PickerPost[]> {
  const data = (await getAnalytics({
    accountId: query?.accountId,
    limit: query?.limit ?? 50,
  })) as { posts?: AnalyticsPost[] };
  const out: PickerPost[] = [];
  for (const p of data.posts || []) {
    const platforms =
      Array.isArray(p.platforms) && p.platforms.length
        ? p.platforms
        : [{ platformPostId: p.platformPostId, accountId: p.accountId, platform: p.platform }];
    for (const pl of platforms) {
      if (!pl.platformPostId) continue;
      if (query?.accountId && pl.accountId && pl.accountId !== query.accountId) continue;
      out.push({
        platformPostId: String(pl.platformPostId),
        zid: String(p._id || ""),
        accountId: String(pl.accountId || p.accountId || ""),
        platform: String(pl.platform || p.platform || ""),
        caption: String(p.content || "").trim(),
        mediaType: String(p.mediaType || ""),
        thumbnail: p.thumbnailUrl || null,
        url: pl.platformPostUrl || p.platformPostUrl || null,
        publishedAt: p.publishedAt || null,
      });
    }
  }
  return out;
}

// ---------- Inbox: comments ----------
export function listComments(query?: {
  platform?: string;
  accountId?: string;
  profileId?: string;
  since?: string;
  minComments?: number;
  limit?: number;
  cursor?: string;
}) {
  return zfetch("GET", "/inbox/comments", { query });
}

export function listCommentsOnPost(postId: string, accountId?: string) {
  return zfetch("GET", `/inbox/comments/${encodeURIComponent(postId)}`, {
    query: { accountId },
  });
}

// Reply công khai vào 1 comment (commentId) hoặc post.
export function replyComment(
  postId: string,
  body: { accountId: string; message: string; commentId?: string }
) {
  return zfetch("POST", `/inbox/comments/${encodeURIComponent(postId)}`, { body });
}

// Gửi DM riêng cho người comment (IG/FB, trong 7 ngày).
export function privateReply(
  postId: string,
  commentId: string,
  body: { accountId: string; message: string }
) {
  return zfetch(
    "POST",
    `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/private-reply`,
    { body }
  );
}

export function likeComment(postId: string, commentId: string, accountId: string) {
  return zfetch(
    "POST",
    `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/like`,
    { body: { accountId } }
  );
}

export function hideComment(postId: string, commentId: string, accountId: string) {
  return zfetch(
    "POST",
    `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/hide`,
    { body: { accountId } }
  );
}

// ---------- Inbox: feed comment gộp nhiều key (tab Comment) ----------
// TikTok KHÔNG có trong đây: Zernio trả 400 PLATFORM_NOT_SUPPORTED. Xem lib/tiktok-comments.ts.
export const COMMENT_PLATFORMS = ["youtube", "facebook", "instagram", "linkedin"] as const;
export type CommentPlatform = (typeof COMMENT_PLATFORMS)[number];

export type FeedComment = {
  id: string;
  message: string;
  createdAt: string;
  author: string;
  avatar: string | null;
  isOwner: boolean;
  likes: number;
  url: string | null;
  canReply: boolean;
  replies: { id: string; message: string; author: string; createdAt: string; isOwner: boolean }[];
  platform: string;
  postId: string;
  accountId: string;
  postContent: string;
  postPicture: string | null;
  postUrl: string | null;
};

type ZPostRow = {
  id: string;
  platform: string;
  accountId: string;
  content?: string;
  picture?: string | null;
  permalink?: string | null;
  commentCount?: number;
  isAd?: boolean;
};

type ZComment = {
  id?: string;
  message?: string;
  createdTime?: string;
  from?: { name?: string; username?: string; picture?: string | null; isOwner?: boolean };
  likeCount?: number;
  url?: string | null;
  canReply?: boolean;
  replies?: ZComment[];
};

function authorOf(c: ZComment): string {
  return c.from?.name || c.from?.username || "(ẩn danh)";
}

function mapComment(c: ZComment, row: ZPostRow): FeedComment {
  return {
    id: String(c.id || ""),
    message: String(c.message || ""),
    createdAt: c.createdTime || "",
    author: authorOf(c),
    avatar: c.from?.picture || null,
    isOwner: !!c.from?.isOwner,
    likes: Number(c.likeCount || 0),
    url: c.url || null,
    canReply: c.canReply !== false,
    replies: (c.replies || []).map((r) => ({
      id: String(r.id || ""),
      message: String(r.message || ""),
      author: authorOf(r),
      createdAt: r.createdTime || "",
      isOwner: !!r.from?.isOwner,
    })),
    platform: row.platform,
    postId: row.id,
    accountId: row.accountId,
    postContent: (row.content || "").replace(/\s+/g, " ").trim().slice(0, 120),
    postPicture: row.picture || null,
    postUrl: row.permalink || null,
  };
}

// Lấy thread của 1 post để refresh tại chỗ sau khi reply. Ngữ cảnh post (caption, ảnh,
// link) client đã có từ feed nên truyền vào, khỏi gọi lại listing cho tốn request.
export async function getPostComments(
  postId: string,
  accountId: string,
  ctx: { platform: string; postContent?: string; postPicture?: string | null; postUrl?: string | null },
  perPost = 25
): Promise<FeedComment[]> {
  const key = await keyForAccount(accountId);
  if (!key) throw new Error("Không tìm thấy account trong Zernio");
  const data = await zfetchWith<{ comments?: ZComment[] }>(
    key,
    "GET",
    `/inbox/comments/${encodeURIComponent(postId)}`,
    { query: { accountId, limit: perPost } }
  );
  const row: ZPostRow = {
    id: postId,
    accountId,
    platform: ctx.platform,
    content: ctx.postContent,
    picture: ctx.postPicture,
    permalink: ctx.postUrl,
  };
  return (data.comments || []).map((c) => mapComment(c, row));
}

// Feed comment mới nhất của 1 nền tảng: list post có comment ở MỌI key có account
// nền tảng đó, rồi tải thread từng post song song và trộn theo thời gian.
export async function listPlatformComments(
  platform: CommentPlatform,
  opts: { posts?: number; perPost?: number } = {}
): Promise<{ comments: FeedComment[]; errors: string[] }> {
  const maxPosts = opts.posts ?? 15;
  const perPost = opts.perPost ?? 25;
  const accs = await accountsOfPlatform(platform);
  if (!accs.length) return { comments: [], errors: [`chưa kết nối ${platform} trong Zernio`] };

  const errors: string[] = [];
  const rows: { row: ZPostRow; key: string }[] = [];
  await Promise.all(
    [...new Set(accs.map((a) => a.key))].map(async (key) => {
      try {
        const data = await zfetchWith<{ data?: ZPostRow[] }>(key, "GET", "/inbox/comments", {
          query: { platform, minComments: 1, limit: 20, sortBy: "date", sortOrder: "desc" },
        });
        for (const row of data.data || []) {
          if (row.isAd) continue; // bỏ dark post quảng cáo
          rows.push({ row, key });
        }
      } catch (e) {
        errors.push((e as Error).message);
      }
    })
  );

  const comments: FeedComment[] = [];
  await Promise.all(
    rows.slice(0, maxPosts).map(async ({ row, key }) => {
      try {
        const data = await zfetchWith<{ comments?: ZComment[] }>(
          key,
          "GET",
          `/inbox/comments/${encodeURIComponent(row.id)}`,
          { query: { accountId: row.accountId, limit: perPost } }
        );
        for (const c of data.comments || []) comments.push(mapComment(c, row));
      } catch (e) {
        errors.push(`${row.id}: ${(e as Error).message}`);
      }
    })
  );

  comments.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return { comments, errors };
}

// Reply bằng key đúng của account (không dùng replyComment cũ vì nó chỉ dùng key đầu).
export async function replyToComment(input: {
  postId: string;
  accountId: string;
  commentId?: string;
  message: string;
}): Promise<unknown> {
  const key = await keyForAccount(input.accountId);
  if (!key) throw new Error("Không tìm thấy account trong Zernio");
  return zfetchWith(key, "POST", `/inbox/comments/${encodeURIComponent(input.postId)}`, {
    body: { accountId: input.accountId, message: input.message, commentId: input.commentId },
  });
}

// ---------- Inbox: conversations (DM) ----------
export function listConversations(query?: { platform?: string; accountId?: string }) {
  return zfetch("GET", "/inbox/conversations", { query });
}

export function listMessages(conversationId: string, accountId?: string) {
  return zfetch(
    "GET",
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    { query: { accountId } }
  );
}

export function sendMessage(
  conversationId: string,
  body: { accountId: string; message: string }
) {
  return zfetch(
    "POST",
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    { body }
  );
}

// ---------- Inbox: reviews ----------
export function listReviews(query?: { platform?: string; accountId?: string }) {
  return zfetch("GET", "/inbox/reviews", { query });
}

export function replyReview(reviewId: string, body: { accountId: string; message: string }) {
  return zfetch("POST", `/inbox/reviews/${encodeURIComponent(reviewId)}/reply`, { body });
}

// ---------- Contacts ----------
export function listContacts(query?: {
  profileId?: string;
  search?: string;
  tag?: string;
  platform?: string;
  limit?: number;
  skip?: number;
}) {
  return zfetch("GET", "/contacts", { query });
}

export function createContact(body: {
  profileId: string;
  name: string;
  email?: string;
  tags?: string[];
  notes?: string;
}) {
  return zfetch("POST", "/contacts", { body });
}

// ---------- Campaigns: broadcasts ----------
export function listBroadcasts(query?: { profileId?: string; limit?: number; page?: number }) {
  return zfetch("GET", "/broadcasts", { query });
}
export function createBroadcast(body: {
  profileId: string;
  accountId: string;
  platform: string;
  name: string;
  description?: string;
  message?: unknown;
}) {
  return zfetch("POST", "/broadcasts", { body });
}
export function addBroadcastRecipients(
  broadcastId: string,
  body: { contactIds?: string[]; phones?: string[]; useSegment?: boolean }
) {
  return zfetch("POST", `/broadcasts/${encodeURIComponent(broadcastId)}/recipients`, { body });
}
export function sendBroadcast(broadcastId: string) {
  return zfetch("POST", `/broadcasts/${encodeURIComponent(broadcastId)}/send`, { body: {} });
}
export function scheduleBroadcast(broadcastId: string, scheduledAt: string) {
  return zfetch("POST", `/broadcasts/${encodeURIComponent(broadcastId)}/schedule`, {
    body: { scheduledAt },
  });
}

// ---------- Campaigns: sequences ----------
export function listSequences(query?: { profileId?: string; limit?: number; page?: number }) {
  return zfetch("GET", "/sequences", { query });
}
export function createSequence(body: {
  profileId: string;
  accountId: string;
  platform: string;
  name: string;
  steps: unknown[];
}) {
  return zfetch("POST", "/sequences", { body });
}
export function activateSequence(id: string) {
  return zfetch("POST", `/sequences/${encodeURIComponent(id)}/activate`, { body: {} });
}
export function pauseSequence(id: string) {
  return zfetch("POST", `/sequences/${encodeURIComponent(id)}/pause`, { body: {} });
}
export function enrollSequence(id: string, contactIds: string[]) {
  return zfetch("POST", `/sequences/${encodeURIComponent(id)}/enroll`, { body: { contactIds } });
}

// ---------- Comment-to-DM automations (keyword-gated) ----------
export function listAutomations(query?: { profileId?: string; accountId?: string }) {
  return zfetch("GET", "/comment-automations", { query });
}
export function createAutomation(body: {
  profileId: string;
  accountId: string;
  name: string;
  dmMessage: string;
  keywords?: string[];
  matchMode?: "exact" | "contains";
  platformPostId?: string;
  postId?: string;
  commentReply?: string;
}) {
  return zfetch("POST", "/comment-automations", { body });
}
export function updateAutomation(
  id: string,
  body: Partial<{
    name: string;
    keywords: string[];
    matchMode: string;
    dmMessage: string;
    commentReply: string;
    isActive: boolean;
  }>
) {
  return zfetch("PATCH", `/comment-automations/${encodeURIComponent(id)}`, { body });
}
export function deleteAutomation(id: string) {
  return zfetch("DELETE", `/comment-automations/${encodeURIComponent(id)}`);
}
export function automationLogs(id: string) {
  return zfetch("GET", `/comment-automations/${encodeURIComponent(id)}/logs`);
}
