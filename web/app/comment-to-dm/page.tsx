"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COMMENT_DM_PLATFORMS,
  DEFAULT_COMMENT_REPLY,
  DEFAULT_DM_MESSAGE,
} from "@/lib/comment-automation-defaults";

type Account = { id: string; platform: string; name: string };

type NativeAutomation = {
  id: string;
  accountId: string;
  platform?: string;
  name?: string;
  keywords: string[];
  dmMessage: string;
  commentReply?: string;
  platformPostId?: string;
  postId?: string;
  postTitle?: string;
  isActive: boolean;
};

type PickerPost = {
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

type LegacyRule = { id: string };

const SUPPORTED = [...COMMENT_DM_PLATFORMS];

export default function CommentToDmPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<PickerPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [err, setErr] = useState("");

  const [keywords, setKeywords] = useState("");
  const [commentReply, setCommentReply] = useState(DEFAULT_COMMENT_REPLY);
  const [dmMessage, setDmMessage] = useState(DEFAULT_DM_MESSAGE);
  const [allPosts, setAllPosts] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const [rules, setRules] = useState<NativeAutomation[]>([]);
  const [legacyRules, setLegacyRules] = useState<LegacyRule[]>([]);
  const [polling, setPolling] = useState(false);
  const [pollMsg, setPollMsg] = useState("");

  async function pollNow() {
    setPolling(true);
    setPollMsg("");
    try {
      const r = await fetch("/api/poll", { method: "POST" });
      const d = await r.json();
      if (d.error) setPollMsg("Lỗi: " + d.error);
      else if (d.seeded != null) setPollMsg(`Legacy: đã ghi mốc ${d.seeded} comment hiện có.`);
      else setPollMsg(`Legacy: quét ${d.scanned}, mới ${d.fresh}, xử lý ${d.acted}.`);
    } catch (e) {
      setPollMsg(String(e));
    } finally {
      setPolling(false);
    }
  }

  function loadAccounts() {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else setAccounts(d.accounts || []);
      })
      .catch((e) => setErr(String(e)));
  }

  function loadPosts() {
    setPostsLoading(true);
    fetch("/api/posts")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else setPosts(d.posts || []);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setPostsLoading(false));
  }

  function loadRules() {
    fetch("/api/comment-automations")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else setRules(d.automations || []);
      })
      .catch((e) => setErr(String(e)));
  }

  function loadLegacyRules() {
    fetch("/api/auto-rules")
      .then((r) => r.json())
      .then((d) => setLegacyRules(Array.isArray(d.rules) ? d.rules : []))
      .catch(() => setLegacyRules([]));
  }

  useEffect(() => {
    loadAccounts();
    loadPosts();
    loadRules();
    loadLegacyRules();
  }, []);

  const supportedAccounts = useMemo(
    () => accounts.filter((a) => SUPPORTED.includes(a.platform?.toLowerCase() as (typeof SUPPORTED)[number])),
    [accounts]
  );
  const hasUnsupported = accounts.length > supportedAccounts.length;

  const visiblePosts = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = posts.filter((p) => SUPPORTED.includes(p.platform?.toLowerCase() as (typeof SUPPORTED)[number]));
    if (!f) return list;
    return list.filter((p) => p.caption.toLowerCase().includes(f));
  }, [posts, filter]);

  function toggleSelect(platformPostId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platformPostId)) next.delete(platformPostId);
      else next.add(platformPostId);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visiblePosts.map((p) => p.platformPostId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function create() {
    setCreateMsg("");
    setErr("");
    const kw = keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (kw.length === 0) {
      setCreateMsg("Bắt buộc có ít nhất 1 keyword.");
      return;
    }
    if (!dmMessage.trim()) {
      setCreateMsg("Bắt buộc có tin nhắn DM soạn sẵn.");
      return;
    }

    const jobs: Array<Record<string, unknown>> = [];
    if (allPosts) {
      for (const account of supportedAccounts) {
        jobs.push({ accountId: account.id, platform: account.platform, keywords: kw });
      }
    } else {
      for (const post of posts) {
        if (!selected.has(post.platformPostId)) continue;
        jobs.push({
          accountId: post.accountId,
          platform: post.platform,
          postId: post.zid,
          platformPostId: post.platformPostId,
          postTitle: post.caption,
          keywords: kw,
        });
      }
    }

    if (!jobs.length) {
      setCreateMsg(allPosts ? "Chưa có tài khoản Facebook/Instagram để áp." : "Chọn ít nhất 1 post, hoặc bật 'Áp mọi post'.");
      return;
    }

    setCreating(true);
    let created = 0;
    const errors: string[] = [];
    try {
      for (const job of jobs) {
        const r = await fetch("/api/comment-automations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...job,
            dmMessage,
            commentReply: commentReply.trim() || undefined,
          }),
        });
        const d = await r.json();
        if (r.ok) created++;
        else errors.push(d.error || "Lỗi tạo automation");
      }
      if (created) {
        setCreateMsg(`Đã tạo ${created} automation native (${allPosts ? "mọi post" : `${selected.size} post`}).${errors.length ? ` ${errors.join(" ")}` : ""}`);
        setKeywords("");
        clearSelection();
        loadRules();
      } else {
        setCreateMsg(errors.join(" ") || "Không tạo được automation.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggleRule(rule: NativeAutomation) {
    const r = await fetch("/api/comment-automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, accountId: rule.accountId, isActive: !rule.isActive }),
    });
    if (r.ok) loadRules();
    else setErr((await r.json()).error || "Lỗi cập nhật automation");
  }

  async function removeRule(rule: NativeAutomation) {
    const r = await fetch(`/api/comment-automations?id=${encodeURIComponent(rule.id)}&accountId=${encodeURIComponent(rule.accountId)}`, {
      method: "DELETE",
    });
    if (r.ok) loadRules();
    else setErr((await r.json()).error || "Lỗi xóa automation");
  }

  const accName = (id: string) => accounts.find((a) => a.id === id)?.name || id.slice(0, 8);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Comment - DM</h1>
        <p className="text-muted text-sm mt-1">
          Automation native của Zernio: comment đúng <b>KEYWORD</b> sẽ reply công khai và gửi <b>DM</b>.
          Chỉ hỗ trợ Facebook và Instagram.
        </p>
      </div>

      <div className="card p-4 text-sm border-brand bg-canvas grid gap-2">
        <p className="text-ink">
          Rule mới chạy trực tiếp trên Zernio, không cần webhook, tunnel hoặc máy luôn mở. Rule legacy cũ vẫn còn chạy qua webhook/poll riêng.
        </p>
        {legacyRules.length > 0 && (
          <p className="text-muted">Đang có {legacyRules.length} rule legacy nội bộ; không tự migrate để tránh gửi DM trùng.</p>
        )}
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost" disabled={polling} onClick={pollNow}>
            {polling ? "Đang quét legacy…" : "Poll legacy ngay"}
          </button>
          {pollMsg && <span className="text-sm text-muted">{pollMsg}</span>}
        </div>
      </div>

      {hasUnsupported && (
        <div className="card p-4 text-sm">
          <p className="text-muted">Chỉ chạy native trên <b>Instagram / Facebook</b>. Các nền tảng khác không có Comment-to-DM native.</p>
        </div>
      )}

      {err && <p className="text-brand text-sm">{err}</p>}

      <div className="card p-5 grid gap-4">
        <label className="label mb-0">Tạo automation native mới</label>

        <div className="grid gap-1">
          <label className="label mb-0" htmlFor="c2d-keywords">Keywords (cách nhau bằng dấu phẩy)</label>
          <input id="c2d-keywords" className="input" placeholder="vd: tài liệu, link, gửi" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </div>

        <div className="grid gap-1">
          <label className="label mb-0" htmlFor="c2d-reply">Reply công khai (để trống = không reply)</label>
          <input id="c2d-reply" className="input" value={commentReply} onChange={(e) => setCommentReply(e.target.value)} />
        </div>

        <div className="grid gap-1">
          <label className="label mb-0" htmlFor="c2d-message">Tin nhắn DM soạn sẵn</label>
          <textarea id="c2d-message" className="textarea" rows={3} value={dmMessage} onChange={(e) => setDmMessage(e.target.value)} />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="label mb-0">Áp dụng cho post nào</span>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={allPosts} onChange={(e) => setAllPosts(e.target.checked)} />
              Áp mọi post trên mọi account IG/FB
            </label>
          </div>

          {!allPosts && (
            <div className="border border-line rounded-lg p-3 grid gap-3">
              <div className="flex items-center gap-2">
                <input className="input flex-1" placeholder="Lọc theo tên/caption…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <button className="btn btn-ghost" type="button" onClick={selectAllVisible}>Chọn tất cả</button>
                <button className="btn btn-ghost" type="button" onClick={clearSelection}>Bỏ chọn</button>
                <button className="btn btn-ghost" type="button" onClick={loadPosts}>Tải lại</button>
              </div>

              {postsLoading ? (
                <p className="text-muted text-sm">Đang tải post…</p>
              ) : visiblePosts.length === 0 ? (
                <p className="text-muted text-sm">Không có post nào từ analytics của Zernio.</p>
              ) : (
                <div className="grid gap-2 max-h-96 overflow-auto">
                  {visiblePosts.map((post) => {
                    const on = selected.has(post.platformPostId);
                    return (
                      <label key={post.platformPostId} className={`flex items-center gap-3 rounded-lg border p-2 cursor-pointer ${on ? "border-brand bg-canvas" : "border-line"}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleSelect(post.platformPostId)} />
                        {post.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.thumbnail} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                        ) : <div className="w-12 h-12 rounded bg-line shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-ink truncate">{post.caption || "(không có caption)"}</p>
                          <p className="text-xs text-muted">{post.platform} · {post.mediaType || "post"}{post.publishedAt ? " · " + new Date(post.publishedAt).toLocaleDateString("vi-VN") : ""}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted">Đã chọn <b>{selected.size}</b> post. Mỗi post sẽ tạo một automation native riêng.</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={creating} onClick={create}>{creating ? "Đang tạo…" : "Tạo automation"}</button>
          {createMsg && <span className="text-sm text-muted">{createMsg}</span>}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Automation native hiện có</label>
          <button className="btn btn-ghost" onClick={loadRules}>Tải lại</button>
        </div>
        {rules.length === 0 ? (
          <p className="text-muted text-sm">Chưa có automation native</p>
        ) : (
          <div className="grid gap-3">
            {rules.map((rule) => (
              <div key={rule.id} className="border border-line rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink text-sm">{rule.keywords.join(", ") || "(mọi comment)"}</p>
                  <p className="text-muted text-xs">
                    {rule.commentReply ? "reply + " : ""}DM · {rule.platformPostId ? "1 post" : "mọi post"} · {rule.platform || "—"} · {accName(rule.accountId)} · {rule.isActive ? "đang bật" : "đang tắt"}
                  </p>
                  {rule.postTitle && <p className="text-muted text-xs truncate">{rule.postTitle}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="btn btn-ghost" onClick={() => toggleRule(rule)}>{rule.isActive ? "Tắt" : "Bật"}</button>
                  <button className="btn btn-ghost text-brand" onClick={() => removeRule(rule)}>Xóa</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
