"use client";
import { useEffect, useMemo, useState } from "react";

type Account = { id: string; platform: string; name: string };

type AutoRule = {
  id: string;
  accountId: string;
  platform?: string;
  keywords: string[];
  message: string;
  commentReply?: string;
  postIds?: string[];
  react: boolean;
  enabled: boolean;
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

const SUPPORTED = ["instagram", "facebook"];

export default function CommentToDmPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<PickerPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [err, setErr] = useState("");

  // form
  const [keywords, setKeywords] = useState("");
  const [commentReply, setCommentReply] = useState("Check inbox nha 🥰");
  const [dmMessage, setDmMessage] = useState("");
  const [react, setReact] = useState(true);
  const [allPosts, setAllPosts] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  // existing rules
  const [rules, setRules] = useState<AutoRule[]>([]);

  // poll catch-up
  const [polling, setPolling] = useState(false);
  const [pollMsg, setPollMsg] = useState("");

  async function pollNow() {
    setPolling(true);
    setPollMsg("");
    try {
      const r = await fetch("/api/poll", { method: "POST" });
      const d = await r.json();
      if (d.error) setPollMsg("Lỗi: " + d.error);
      else if (d.seeded != null)
        setPollMsg(`Lần đầu — đã ghi mốc ${d.seeded} comment hiện có (không gửi lại).`);
      else setPollMsg(`Quét ${d.scanned}, mới ${d.fresh}, xử lý ${d.acted}.`);
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
    fetch("/api/auto-rules")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else setRules(d.rules || []);
      })
      .catch((e) => setErr(String(e)));
  }

  useEffect(() => {
    loadAccounts();
    loadPosts();
    loadRules();
  }, []);

  const supportedAccounts = useMemo(
    () => accounts.filter((a) => SUPPORTED.includes(a.platform?.toLowerCase())),
    [accounts]
  );
  const hasUnsupported = accounts.length > supportedAccounts.length;

  const visiblePosts = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = posts.filter((p) => SUPPORTED.includes(p.platform?.toLowerCase()));
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
    const kw = keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    if (kw.length === 0) {
      setCreateMsg("Bắt buộc có ít nhất 1 keyword.");
      return;
    }
    if (!dmMessage.trim()) {
      setCreateMsg("Bắt buộc có tin nhắn DM soạn sẵn.");
      return;
    }

    // Gom thành các nhóm theo tài khoản → mỗi tài khoản 1 rule.
    // allPosts: tạo cho mọi tài khoản IG/FB, không scope post.
    // ngược lại: gom platformPostId đã chọn theo accountId.
    type Group = { accountId: string; platform?: string; postIds?: string[] };
    let groups: Group[] = [];
    if (allPosts) {
      if (supportedAccounts.length === 0) {
        setCreateMsg("Chưa có tài khoản IG/FB để áp.");
        return;
      }
      groups = supportedAccounts.map((a) => ({ accountId: a.id, platform: a.platform }));
    } else {
      if (selected.size === 0) {
        setCreateMsg("Chọn ít nhất 1 post, hoặc bật 'Áp mọi post'.");
        return;
      }
      const byAcc = new Map<string, Group>();
      for (const p of posts) {
        if (!selected.has(p.platformPostId)) continue;
        const g = byAcc.get(p.accountId) || {
          accountId: p.accountId,
          platform: p.platform,
          postIds: [],
        };
        g.postIds!.push(p.platformPostId);
        byAcc.set(p.accountId, g);
      }
      groups = [...byAcc.values()];
    }

    setCreating(true);
    try {
      let ok = 0;
      for (const g of groups) {
        const r = await fetch("/api/auto-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: g.accountId,
            platform: g.platform,
            keywords: kw,
            message: dmMessage,
            commentReply: commentReply.trim() || undefined,
            postIds: g.postIds,
            react,
            enabled: true,
          }),
        });
        if (r.ok) ok++;
        else {
          const d = await r.json();
          setErr(d.error || "Lỗi tạo rule");
        }
      }
      if (ok > 0) {
        setCreateMsg(
          `Đã tạo ${ok} rule (${
            allPosts ? "áp mọi post" : `${selected.size} post`
          }, ${groups.length} nền tảng).`
        );
        setKeywords("");
        setDmMessage("");
        clearSelection();
        loadRules();
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggleRule(rule: AutoRule) {
    const r = await fetch("/api/auto-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    if (r.ok) loadRules();
    else setErr((await r.json()).error || "Lỗi cập nhật");
  }

  async function removeRule(id: string) {
    const r = await fetch(`/api/auto-rules?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (r.ok) loadRules();
    else setErr((await r.json()).error || "Lỗi xóa");
  }

  const accName = (id: string) =>
    accounts.find((a) => a.id === id)?.name || id.slice(0, 8);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Comment - DM</h1>
        <p className="text-muted text-sm mt-1">
          Ai comment đúng <b>KEYWORD</b> trên post đã chọn sẽ tự <b>reply công khai</b> + <b>like</b>{" "}
          comment + gửi <b>DM</b> tài liệu soạn sẵn. Keyword-gated,{" "}
          <b>không reply mọi comment</b>.
        </p>
      </div>

      <div className="card p-4 grid gap-2">
        <p className="text-sm font-semibold text-ink">Hướng dẫn cài webhook</p>
        <ol className="text-sm text-muted grid gap-1 list-decimal pl-5">
          <li>Vào zernio.com, mở mục Webhooks rồi bấm tạo webhook mới.</li>
          <li>
            URL điền:{" "}
            <code className="text-ink">https://domain-cua-ban/api/inbox/webhook</code>{" "}
            (app phải đang chạy và tunnel bật qua start-public.bat).
          </li>
          <li>
            Chọn event <code className="text-ink">comment.received</code>.
          </li>
          <li>Lưu webhook.</li>
        </ol>
        <p className="text-sm text-muted">
          Lưu ý: DM riêng chỉ hỗ trợ Instagram và Facebook, trong vòng 7 ngày kể từ comment. TikTok
          không hỗ trợ gửi DM riêng.
        </p>
      </div>

      <div className="card p-4 text-sm border-brand bg-canvas grid gap-3">
        <p className="text-ink">
          Rule chạy qua <b>webhook Zernio</b> trỏ tới <code>/api/inbox/webhook</code> (event{" "}
          <code>comment.received</code>). Vì chạy trên máy bạn nên cần máy mở + tunnel bật. Máy tắt →
          comment lúc đó webhook bỏ lỡ. <b>Poll catch-up</b> tự chạy khi mở máy + mỗi 5 phút để bắt
          lại comment đã sót.
        </p>
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost" disabled={polling} onClick={pollNow}>
            {polling ? "Đang quét…" : "Poll ngay"}
          </button>
          {pollMsg && <span className="text-sm text-muted">{pollMsg}</span>}
        </div>
      </div>

      {hasUnsupported && (
        <div className="card p-4 text-sm">
          <p className="text-muted">
            Chỉ chạy trên <b>Instagram / Facebook</b>. TikTok không có API comment. Hiện thường chỉ
            có 1 tài khoản Facebook kết nối — connect thêm IG trong Zernio để có lựa chọn.
          </p>
        </div>
      )}

      {err && <p className="text-brand text-sm">{err}</p>}

      {/* Create form */}
      <div className="card p-5 grid gap-4">
        <label className="label mb-0">Tạo rule mới</label>

        <div className="grid gap-1">
          <span className="label mb-0">Keywords (bắt buộc, cách nhau bằng dấu phẩy)</span>
          <input
            className="input"
            placeholder="vd: tài liệu, link, gửi"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </div>

        <div className="grid gap-1">
          <span className="label mb-0">Reply công khai (để trống = không reply)</span>
          <input
            className="input"
            placeholder="vd: Check inbox nha 🥰"
            value={commentReply}
            onChange={(e) => setCommentReply(e.target.value)}
          />
        </div>

        <div className="grid gap-1">
          <span className="label mb-0">Tin nhắn DM soạn sẵn (bắt buộc)</span>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Nội dung DM tự gửi — kèm link tài liệu"
            value={dmMessage}
            onChange={(e) => setDmMessage(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={react} onChange={(e) => setReact(e.target.checked)} />
          Like comment khi trúng keyword
        </label>

        {/* Post picker */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="label mb-0">Áp dụng cho post nào</span>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={allPosts}
                onChange={(e) => setAllPosts(e.target.checked)}
              />
              Áp MỌI post (mọi tài khoản IG/FB)
            </label>
          </div>

          {!allPosts && (
            <div className="border border-line rounded-lg p-3 grid gap-3">
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder="Lọc theo tên/caption…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <button className="btn btn-ghost" type="button" onClick={selectAllVisible}>
                  Chọn tất cả
                </button>
                <button className="btn btn-ghost" type="button" onClick={clearSelection}>
                  Bỏ chọn
                </button>
                <button className="btn btn-ghost" type="button" onClick={loadPosts}>
                  Tải lại
                </button>
              </div>

              {postsLoading ? (
                <p className="text-muted text-sm">Đang tải post…</p>
              ) : visiblePosts.length === 0 ? (
                <p className="text-muted text-sm">
                  Không có post nào (Zernio cần sync xong analytics của tài khoản).
                </p>
              ) : (
                <div className="grid gap-2 max-h-96 overflow-auto">
                  {visiblePosts.map((p) => {
                    const on = selected.has(p.platformPostId);
                    return (
                      <label
                        key={p.platformPostId}
                        className={`flex items-center gap-3 rounded-lg border p-2 cursor-pointer ${
                          on ? "border-brand bg-canvas" : "border-line"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleSelect(p.platformPostId)}
                        />
                        {p.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.thumbnail}
                            alt=""
                            className="w-12 h-12 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-line shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-ink truncate">
                            {p.caption || "(không có caption)"}
                          </p>
                          <p className="text-xs text-muted">
                            {p.platform} · {p.mediaType || "post"}
                            {p.publishedAt
                              ? " · " + new Date(p.publishedAt).toLocaleDateString("vi-VN")
                              : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted">
                Đã chọn <b>{selected.size}</b> post. Chọn post của cả FB lẫn IG cũng được — app tự
                tạo rule riêng cho từng nền tảng.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={creating} onClick={create}>
            {creating ? "Đang tạo…" : "Tạo rule"}
          </button>
          {createMsg && <span className="text-sm text-muted">{createMsg}</span>}
        </div>
      </div>

      {/* Existing rules */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Rule hiện có</label>
          <button className="btn btn-ghost" onClick={loadRules}>
            Tải lại
          </button>
        </div>
        {rules.length === 0 ? (
          <p className="text-muted text-sm">Chưa có rule</p>
        ) : (
          <div className="grid gap-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="border border-line rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink text-sm">
                    {rule.keywords.join(", ") || "(không keyword)"}
                  </p>
                  <p className="text-muted text-xs">
                    {rule.commentReply ? "reply + " : ""}
                    {rule.react ? "like + " : ""}DM ·{" "}
                    {rule.postIds?.length ? `${rule.postIds.length} post` : "mọi post"} ·{" "}
                    {rule.platform || "—"} · {accName(rule.accountId)} ·{" "}
                    {rule.enabled ? "đang bật" : "đang tắt"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="btn btn-ghost" onClick={() => toggleRule(rule)}>
                    {rule.enabled ? "Tắt" : "Bật"}
                  </button>
                  <button className="btn btn-ghost text-brand" onClick={() => removeRule(rule.id)}>
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
