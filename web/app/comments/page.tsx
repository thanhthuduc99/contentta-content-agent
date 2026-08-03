"use client";
import { useState } from "react";

type Reply = { id: string; message: string; author: string; createdAt: string; isOwner: boolean };
type Comment = {
  id: string;
  message: string;
  createdAt: string;
  author: string;
  avatar: string | null;
  isOwner: boolean;
  likes: number;
  url: string | null;
  canReply: boolean;
  replies: Reply[];
  platform: string;
  postId: string;
  accountId: string;
  postContent: string;
  postPicture: string | null;
  postUrl: string | null;
};
type TtComment = {
  id: string;
  text: string;
  author: string;
  avatar: string;
  likes: number;
  createdAt: string;
  videoUrl: string;
  videoCaption: string;
};
type TtCache = { lastScanAt: string | null; videoCount: number; comments: TtComment[] };

const TABS = [
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "tiktok", label: "TikTok" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type TabState = {
  loading: boolean;
  loaded: boolean;
  comments: Comment[];
  tiktok: TtCache | null;
  errors: string[];
};

const EMPTY_TAB: TabState = { loading: false, loaded: false, comments: [], tiktok: null, errors: [] };

function ago(iso: string): string {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 2592000) return `${Math.floor(s / 86400)} ngày trước`;
  return iso.slice(0, 10);
}

export default function CommentsPage() {
  const [tab, setTab] = useState<TabKey | null>(null);
  const [tabs, setTabs] = useState<Record<string, TabState>>({});
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const cur = (tab && tabs[tab]) || EMPTY_TAB;

  function setTabState(key: TabKey, patch: Partial<TabState>) {
    setTabs((t) => ({ ...t, [key]: { ...(t[key] || EMPTY_TAB), ...patch } }));
  }

  async function load(key: TabKey, rescan = false) {
    setTabState(key, { loading: true, errors: [] });
    try {
      const url = `/api/comments?platform=${key}${rescan ? "&rescan=1" : ""}`;
      const d = await fetch(url).then((r) => r.json());
      setTabState(key, {
        loading: false,
        loaded: true,
        comments: d.comments || [],
        tiktok: d.tiktok || null,
        errors: d.error ? [d.error] : d.errors || [],
      });
    } catch (e) {
      setTabState(key, { loading: false, loaded: true, errors: [(e as Error).message] });
    }
  }

  // Lazy: chỉ gọi API khi bấm vào tab lần đầu.
  function openTab(key: TabKey) {
    setTab(key);
    setReplyTo(null);
    if (!tabs[key]?.loaded) load(key);
  }

  async function sendReply(c: Comment) {
    if (!draft.trim() || !tab) return;
    setSending(true);
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: c.postId,
          accountId: c.accountId,
          commentId: c.id,
          message: draft,
          platform: c.platform,
          postContent: c.postContent,
          postPicture: c.postPicture,
          postUrl: c.postUrl,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setTabState(tab, { errors: [d.error || "Reply lỗi"] });
        return;
      }
      // Thay các comment của post đó bằng thread mới, giữ nguyên thứ tự feed.
      const fresh: Comment[] = d.comments || [];
      const byId = new Map(fresh.map((x) => [x.id, x]));
      setTabState(tab, {
        comments: cur.comments.map((x) => (x.postId === c.postId ? byId.get(x.id) || x : x)),
        errors: [],
      });
      setReplyTo(null);
      setDraft("");
    } catch (e) {
      setTabState(tab, { errors: [(e as Error).message] });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Comment</h1>
        <p className="text-muted text-sm mt-1">
          Comment mới nhất theo từng nền tảng, trả lời ngay tại đây. Bấm vào tab nào mới tải tab đó.
          TikTok chỉ đọc được, muốn trả lời phải mở app TikTok.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => openTab(t.key)}
            className={`btn ${tab === t.key ? "btn-primary" : "btn-ghost"}`}
          >
            {t.label}
            {tabs[t.key]?.loaded && t.key !== "tiktok" && (
              <span className="text-xs opacity-70">{tabs[t.key].comments.length}</span>
            )}
          </button>
        ))}
      </div>

      {!tab && <p className="text-sm text-muted">Chọn 1 nền tảng để tải comment.</p>}

      {tab && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-ghost" disabled={cur.loading} onClick={() => load(tab, tab === "tiktok")}>
              {cur.loading
                ? "Đang tải…"
                : tab === "tiktok"
                  ? "Quét comment TikTok (tốn ~$0.50)"
                  : "Tải lại"}
            </button>
            {tab === "tiktok" && (
              <span className="text-xs text-muted">
                {cur.tiktok?.lastScanAt
                  ? `Quét gần nhất: ${new Date(cur.tiktok.lastScanAt).toLocaleString("vi-VN")} · ${cur.tiktok.videoCount} video`
                  : "Chưa quét lần nào"}
              </span>
            )}
          </div>

          {cur.errors.map((e, i) => (
            <p key={i} className="text-sm text-brand">{e}</p>
          ))}

          {/* TikTok: chỉ đọc */}
          {tab === "tiktok" &&
            (cur.tiktok?.comments.length ? (
              <div className="grid gap-2">
                {cur.tiktok.comments.map((c) => (
                  <div key={c.id} className="card p-4 flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.avatar}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full bg-canvas shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-ink">@{c.author}</span>
                        <span className="text-xs text-muted">{ago(c.createdAt)}</span>
                        {c.likes > 0 && <span className="text-xs text-muted">{c.likes} thích</span>}
                      </div>
                      <p className="text-sm text-ink mt-1 whitespace-pre-wrap">{c.text}</p>
                      <p className="text-xs text-muted mt-1 truncate">{c.videoCaption}</p>
                      <a
                        href={c.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand"
                      >
                        Mở trên TikTok để trả lời
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !cur.loading && <p className="text-sm text-muted">Chưa có comment nào trong cache.</p>
            ))}

          {/* 4 nền tảng qua Zernio: reply được */}
          {tab !== "tiktok" &&
            (cur.comments.length ? (
              <div className="grid gap-2">
                {cur.comments.map((c) => (
                  <div key={`${c.postId}-${c.id}`} className="card p-4 flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.avatar || ""}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full bg-canvas shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-ink">{c.author}</span>
                        {c.isOwner && <span className="chip">bạn</span>}
                        <span className="text-xs text-muted">{ago(c.createdAt)}</span>
                        {c.likes > 0 && <span className="text-xs text-muted">{c.likes} thích</span>}
                      </div>
                      <p className="text-sm text-ink mt-1 whitespace-pre-wrap">{c.message}</p>

                      <div className="flex items-center gap-2 mt-1.5 text-xs">
                        {c.canReply && (
                          <button
                            type="button"
                            className="text-brand font-semibold"
                            onClick={() => {
                              setReplyTo(replyTo === c.id ? null : c.id);
                              setDraft("");
                            }}
                          >
                            Trả lời
                          </button>
                        )}
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-muted">
                            Mở bài
                          </a>
                        )}
                        <span className="text-muted truncate">{c.postContent}</span>
                      </div>

                      {c.replies.length > 0 && (
                        <div className="mt-2 pl-3 border-l border-line grid gap-1.5">
                          {c.replies.map((r) => (
                            <div key={r.id} className="text-sm">
                              <span className="font-semibold text-ink">{r.author}</span>
                              {r.isOwner && <span className="chip ml-1">bạn</span>}
                              <span className="text-xs text-muted ml-2">{ago(r.createdAt)}</span>
                              <p className="text-ink whitespace-pre-wrap">{r.message}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {replyTo === c.id && (
                        <div className="mt-2 grid gap-2">
                          <textarea
                            className="textarea"
                            rows={3}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Viết trả lời…"
                          />
                          <div className="flex gap-2">
                            <button
                              className="btn btn-primary"
                              disabled={sending || !draft.trim()}
                              onClick={() => sendReply(c)}
                            >
                              {sending ? "Đang gửi…" : "Gửi"}
                            </button>
                            <button className="btn btn-ghost" onClick={() => setReplyTo(null)}>
                              Hủy
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !cur.loading && <p className="text-sm text-muted">Chưa có comment nào.</p>
            ))}
        </div>
      )}
    </div>
  );
}
