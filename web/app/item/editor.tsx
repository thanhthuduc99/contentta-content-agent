"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "@/components/markdown";

type Item = {
  id: string;
  type: string;
  content_type?: string;
  platform?: string;
  topic?: string;
  date?: string;
  status?: string;
  publish_at?: string | null;
  publish_caption?: string;
  posted?: boolean;
  posted_at?: string | null;
  parent?: string | null;
  threads?: string;
  edit_state?: string;
  source_url?: string;
  cta_keyword?: string;
  body: string;
};

// Platform gửi được DM riêng (TikTok/YouTube/LinkedIn không có API này).
const DM_PLATFORMS = ["facebook", "instagram"];

const PLATFORMS: { key: string; label: string; kinds: ("text" | "video")[] }[] = [
  { key: "facebook", label: "Facebook", kinds: ["text", "video"] },
  { key: "linkedin", label: "LinkedIn", kinds: ["text", "video"] },
  { key: "instagram", label: "Instagram", kinds: ["video"] },
  { key: "tiktok", label: "TikTok", kinds: ["video"] },
  { key: "youtube", label: "YouTube", kinds: ["video"] },
];

const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];
const isVideo = (f: string) => VIDEO_EXT.some((e) => f.toLowerCase().endsWith(e));

const PLAT_KEYS = ["facebook", "linkedin", "instagram", "tiktok", "youtube"];

const EDIT_STATE_LABEL: Record<string, string> = { editing: "Đang edit", ready: "Chờ duyệt" };

const TYPE_LABEL: Record<string, string> = { youtube: "YouTube", short: "Video ngắn", post: "Post" };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "queued", label: "Queued" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
];
const statusChipCls = (s?: string) =>
  s === "published"
    ? "!bg-green-50 !text-green-700 !border-green-200"
    : s === "scheduled"
    ? "!bg-blue-50 !text-blue-700 !border-blue-200"
    : s === "queued"
    ? "!bg-amber-50 !text-amber-700 !border-amber-200"
    : s === "failed"
    ? "!bg-red-50 !text-red-700 !border-red-200"
    : "!bg-gray-50 !text-gray-600 !border-gray-200";

type PlatResult = { status?: string; reason?: string; platformPostId?: string; [k: string]: unknown };

function hasFailure(r: unknown): boolean {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, PlatResult | string>;
  if (o.error) return true;
  if (o.status === "failed") return true;
  return PLAT_KEYS.some((k) => (o[k] as PlatResult)?.status === "failed");
}

// Success → tag xanh per-platform (giống Blotato). JSON chỉ hiện khi có lỗi.
function ResultView({ r }: { r: unknown }) {
  if (r == null || typeof r !== "object") return null;
  const o = r as Record<string, PlatResult | string>;
  const entries = PLAT_KEYS.filter((k) => o[k]).map((k) => ({ k, ...(o[k] as PlatResult) }));
  const topError = o.error || (o.status === "failed" ? (o as PlatResult).reason || "lỗi" : null);
  const failed = hasFailure(r);
  return (
    <div className="mt-4 grid gap-2">
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entries.map((e) => {
            const ok = e.status === "ok";
            const skipped = e.status === "skipped";
            const cls = ok
              ? "!bg-green-50 !text-green-700 !border-green-200"
              : skipped
              ? "!bg-amber-50 !text-amber-700 !border-amber-200"
              : "!bg-red-50 !text-red-700 !border-red-200";
            return (
              <span key={e.k} className={`chip ${cls}`} title={e.reason || ""}>
                {e.k} · {ok ? "đã gửi" : skipped ? "bỏ qua" : "lỗi"}
              </span>
            );
          })}
        </div>
      )}
      {typeof topError === "string" && <p className="text-brand text-sm">{topError}</p>}
      {failed && (
        <pre className="text-xs bg-canvas border border-line rounded-lg p-3 overflow-auto max-h-60">
          {JSON.stringify(r, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ISO (giờ VN) → value cho input datetime-local ("YYYY-MM-DDTHH:mm").
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : "";
}
// value datetime-local → ISO giờ VN.
function localInputToIso(v: string): string | null {
  return v ? `${v}:00+07:00` : null;
}

export default function ItemEditor({ id }: { id: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [body, setBody] = useState("");
  const [threads, setThreads] = useState("");
  const [pubCaption, setPubCaption] = useState("");
  const [status, setStatus] = useState("draft");
  const [publishAt, setPublishAt] = useState(""); // datetime-local value
  const [files, setFiles] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewMode, setPreviewMode] = useState(true); // script youtube/short: mặc định Xem trước
  const [c2dOn, setC2dOn] = useState(false); // short: bật comment-to-DM khi đăng
  const [c2dKeyword, setC2dKeyword] = useState("");
  const [c2dMessage, setC2dMessage] = useState("");
  const [playlists, setPlaylists] = useState<{ id: string; title: string; privacy?: string }[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Quay lại trang Posts giữ nguyên view + filter (URL trước đó). Fallback "/" nếu mở trực tiếp.
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  const loadMedia = useCallback(() => {
    fetch(`/api/media?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => setFiles(d.files || []));
  }, [id]);

  // Upload dùng chung cho: nút Upload, kéo-thả, dán (Ctrl+V).
  const uploadFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      const arr = fileList ? Array.from(fileList) : [];
      if (!arr.length) return;
      setBusy("upload");
      setMsg("");
      const fd = new FormData();
      fd.append("id", id);
      arr.forEach((f) => fd.append("files", f));
      try {
        const r = await fetch("/api/media", { method: "POST", body: fd });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setMsg(d.error || `Upload lỗi (HTTP ${r.status}). File quá lớn nếu qua tunnel công khai (giới hạn 100MB) thì mở thẳng localhost:8502 để upload.`);
        }
      } catch (e) {
        setMsg(`Upload lỗi: ${(e as Error).message}. File quá lớn nếu qua tunnel công khai (giới hạn 100MB) thì mở thẳng localhost:8502 để upload.`);
      }
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
      loadMedia();
    },
    [id, loadMedia]
  );

  useEffect(() => {
    fetch(`/api/item?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.item) {
          const it = d.item as Item;
          setItem(it);
          setBody(it.body || "");
          setThreads(it.threads || "");
          setPubCaption(it.publish_caption || "");
          setC2dKeyword(it.cta_keyword || "");
          setStatus(it.status || "draft");
          setPublishAt(isoToLocalInput(it.publish_at));
          // Item import từ tab Đăng lại đã ghi sẵn đích dự kiến vào frontmatter platform.
          // Lọc theo platformOptions đúng loại item (không dùng PLAT_KEYS thô): item youtube
          // (Long) cũ có sẵn platform="youtube" từ trước (đánh dấu cũ, không phải đích đăng —
          // Long chưa từng đăng được platform nào qua app), giữ nguyên PLAT_KEYS sẽ preset nhầm
          // "youtube" làm platform publish trong khi platformOptions của Long không có chip đó.
          const allowedKeys = PLATFORMS.filter((p) =>
            p.kinds.includes(it.type === "short" ? "video" : "text")
          ).map((p) => p.key);
          const preset = (it.platform || "")
            .split(";")
            .map((s) => s.trim())
            .filter((p) => allowedKeys.includes(p));
          setPlatforms(
            preset.length
              ? preset
              : it.type === "short"
              ? ["facebook", "instagram", "tiktok", "youtube"]
              : it.type === "post" || it.type === "youtube"
              ? ["facebook", "linkedin"]
              : []
          );
        }
      });
    loadMedia();
    fetch("/api/youtube-playlists")
      .then((r) => r.json())
      .then((d) => setPlaylists(d.playlists || []))
      .catch(() => setPlaylists([]));
  }, [id, loadMedia]);

  // Dán ảnh (Ctrl+V) ở bất kỳ đâu trong trang → upload (chỉ xử lý khi clipboard có file).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        uploadFiles(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFiles]);

  if (!item) return <p className="text-muted">Đang tải…</p>;

  const isYoutube = item.type === "youtube";
  const isShort = item.type === "short";
  const isPost = item.type === "post";
  const mediaIsVideo = isShort || isYoutube;
  const platformOptions = PLATFORMS.filter((p) =>
    p.kinds.includes(isShort ? "video" : "text")
  );

  async function patch(partial: Record<string, unknown>) {
    await fetch("/api/item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...partial }),
    });
  }

  async function changeStatus(v: string) {
    setStatus(v);
    setItem((it) => (it ? { ...it, status: v } : it));
    await patch({ status: v });
  }

  async function changePublishAt(v: string) {
    setPublishAt(v);
    const iso = localInputToIso(v);
    setItem((it) => (it ? { ...it, publish_at: iso } : it));
    await patch({ publish_at: iso });
  }

  async function save() {
    setBusy("save");
    setMsg("");
    const r = await fetch("/api/item", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item,
        body,
        threads,
        publish_caption: pubCaption,
        status,
        publish_at: localInputToIso(publishAt),
      }),
    });
    setBusy("");
    setMsg(r.ok ? "Đã lưu vào content-agent." : "Lưu lỗi.");
  }

  async function genImage() {
    setBusy("genimg");
    setMsg("");
    const r = await fetch("/api/media/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await r.json();
    setBusy("");
    if (!r.ok) setMsg(d.error || "Tạo ảnh lỗi");
    else {
      setMsg(`Đã tạo ${(d.files || []).length} ảnh (${d.kind}).`);
      loadMedia();
    }
  }

  async function delMedia(f: string) {
    await fetch(`/api/media?id=${encodeURIComponent(id)}&file=${encodeURIComponent(f)}`, {
      method: "DELETE",
    });
    loadMedia();
  }

  // Tạo rule Comment-to-DM sau khi đăng THÀNH CÔNG. Trả về đoạn text ghép vào msg.
  // Rule chỉ áp đúng bài vừa đăng (platformPostId) — không bao giờ áp mọi post.
  async function createC2dRule(result: unknown, scheduledTime?: string): Promise<string> {
    if (!c2dOn || !c2dKeyword.trim() || !c2dMessage.trim()) return "";
    const dmPlats = platforms.filter((p) => DM_PLATFORMS.includes(p));
    if (!dmPlats.length) {
      return " Chưa tạo rule Comment to DM: cần tick Facebook hoặc Instagram.";
    }
    if (scheduledTime) {
      return " Chưa tạo rule Comment to DM: bài hẹn lịch chưa có post ID. Sau khi bài lên, vào tab Comment - DM tạo tay.";
    }
    const o = (result || {}) as Record<string, PlatResult>;
    const postIds: Record<string, string> = {};
    for (const p of dmPlats) {
      const id = o[p]?.platformPostId;
      if (id) postIds[p] = String(id);
    }
    if (!Object.keys(postIds).length) {
      return " Chưa tạo rule Comment to DM: Zernio không trả post ID. Vào tab Comment - DM tạo tay.";
    }
    try {
      const cr = await fetch("/api/auto-rules/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: c2dKeyword.trim(),
          message: c2dMessage,
          postIds,
          platforms: Object.keys(postIds),
        }),
      });
      const cd = await cr.json();
      if (!cr.ok) return ` Rule Comment to DM lỗi: ${cd.error || "không rõ"}.`;
      return ` + ${cd.created || 0} rule Comment to DM (chỉ bài này).`;
    } catch (e) {
      return ` Rule Comment to DM lỗi: ${(e as Error).message}.`;
    }
  }

  async function publish() {
    const caption = isShort || isYoutube ? pubCaption : body;
    if ((isShort || isYoutube) && !pubCaption.trim()) {
      setMsg("Cần điền Caption đăng trước khi đăng.");
      return;
    }
    setBusy("publish");
    setMsg("");
    setResult(null);
    const scheduledTime = localInputToIso(publishAt) || undefined;
    const r = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        files,
        platforms,
        scheduledTime,
        caption,
        playlistId: platforms.includes("youtube") ? playlistId : "",
      }),
    });
    const d = await r.json();
    setResult(d.result || d);
    if (r.ok && !hasFailure(d.result || d)) {
      await fetch("/api/mark-posted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, scheduledTime }),
      });
      // Ghi lại đúng platform đã đăng (có thể nhiều) để PostsTable/Card/Calendar + filter không hiển thị sai.
      const publishedPlatform = platforms.join(";");
      // Đăng ngay -> set publish_at = giờ đăng để LÊN CALENDAR (scheduled thì đã có giờ).
      const whenIso = scheduledTime || new Date().toISOString();
      await patch({ platform: publishedPlatform, publish_at: whenIso });
      const newStatus = scheduledTime ? "scheduled" : "published";
      setStatus(newStatus);
      setPublishAt(isoToLocalInput(whenIso));
      setItem((it) =>
        it ? { ...it, status: newStatus, posted: true, platform: publishedPlatform, publish_at: whenIso } : it
      );
      setMsg(
        (scheduledTime ? "Đã lên lịch + đánh dấu." : "Đã gửi đăng + đánh dấu.") +
          (await createC2dRule(d.result || d, scheduledTime))
      );
    } else if (r.ok) {
      setMsg("Đăng có lỗi — xem chi tiết bên dưới.");
    } else {
      setMsg(d.error || "Đăng lỗi.");
    }
    setBusy("");
  }

  async function markPostedYoutube() {
    setBusy("markyt");
    setMsg("");
    // YouTube đăng tay: đánh dấu đã đăng + set Ngày đăng (giữ giờ đã chọn, không thì lấy giờ hiện tại) để lên calendar.
    const whenIso = localInputToIso(publishAt) || new Date().toISOString();
    await patch({ status: "published", posted: true, publish_at: whenIso, posted_at: whenIso });
    setStatus("published");
    setPublishAt(isoToLocalInput(whenIso));
    setItem((it) => (it ? { ...it, status: "published", posted: true, publish_at: whenIso, posted_at: whenIso } : it));
    setBusy("");
    setMsg("Đã đánh dấu đã đăng.");
  }

  function togglePlatform(k: string) {
    setPlatforms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  return (
    <div className="grid gap-5">
      {/* Header */}
      <div>
        <button onClick={goBack} className="text-sm text-muted hover:text-ink">
          ← Quay lại
        </button>
        <h1 className="text-2xl font-bold text-ink mt-1">{item.topic || item.id}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="chip">{TYPE_LABEL[item.type] || item.type}</span>
          {item.content_type && <span className="chip">{item.content_type}</span>}
          <span className={`chip ${statusChipCls(status)}`}>
            {STATUS_OPTIONS.find((s) => s.value === status)?.label || "Draft"}
          </span>
          {item.edit_state && EDIT_STATE_LABEL[item.edit_state] && (
            <span
              className={`chip ${
                item.edit_state === "ready"
                  ? "!bg-blue-50 !text-blue-700 !border-blue-200"
                  : "!bg-amber-50 !text-amber-700 !border-amber-200"
              }`}
            >
              {EDIT_STATE_LABEL[item.edit_state]}
            </span>
          )}
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand hover:underline truncate max-w-60"
            >
              Nguồn ↗
            </a>
          )}
        </div>
      </div>

      {/* Trạng thái + ngày đăng */}
      <div className="card p-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Trạng thái</label>
          <select
            className={`select font-medium select-${status || "draft"}`}
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Ngày đăng</label>
          <input
            type="datetime-local"
            className="input"
            value={publishAt}
            onChange={(e) => changePublishAt(e.target.value)}
          />
          <p className="text-xs text-muted mt-1">
            {isYoutube
              ? "YouTube vẫn đăng tay (bấm Đánh dấu đã đăng). Facebook/LinkedIn ở dưới: có giờ thì tự đăng đúng giờ, bỏ trống thì đăng ngay."
              : "Có giờ thì tự đăng đúng giờ. Bỏ trống thì đăng ngay."}
          </p>
        </div>
      </div>

      {/* Nội dung */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">
            {isYoutube
              ? "Nội dung (script + title + description)"
              : isShort
              ? "Script video ngắn (tham chiếu để quay)"
              : "Nội dung post"}
          </label>
          {(isYoutube || isShort) && (
            <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
              {[
                { v: true, label: "Xem trước" },
                { v: false, label: "Chỉnh sửa" },
              ].map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setPreviewMode(m.v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    previewMode === m.v ? "bg-brand text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {(isYoutube || isShort) && previewMode ? (
          <div className="rounded-lg border border-line bg-canvas/50 p-4 max-h-[32rem] overflow-auto">
            {body.trim() ? (
              <Markdown>{body}</Markdown>
            ) : (
              <p className="text-sm text-muted">Chưa có nội dung — bấm Chỉnh sửa để viết.</p>
            )}
          </div>
        ) : (
          <textarea
            className="textarea"
            rows={isYoutube ? 18 : 10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        )}
        <p className="text-xs text-muted mt-1">{body.length} ký tự</p>

        {(isShort || isYoutube) && (
          <>
            <div className="flex items-center justify-between mt-4">
              <label className="label mb-0">Caption đăng (bắt buộc khi đăng)</label>
              <span className="text-xs text-muted">{pubCaption.length} ký tự</span>
            </div>
            <textarea
              className="textarea"
              rows={4}
              value={pubCaption}
              onChange={(e) => setPubCaption(e.target.value)}
              placeholder={
                isYoutube
                  ? "Caption ngắn cho Facebook/LinkedIn, khác nội dung script YouTube ở trên…"
                  : "Caption gắn kèm video ngắn khi đăng…"
              }
            />
          </>
        )}

        <div className="flex items-center gap-3 mt-4">
          <button className="btn btn-ghost" disabled={busy === "save"} onClick={save}>
            {busy === "save" ? "Đang lưu…" : "Lưu"}
          </button>
          {isYoutube && (
            <button className="btn btn-primary" disabled={busy === "markyt"} onClick={markPostedYoutube}>
              {busy === "markyt" ? "Đang lưu…" : "Đánh dấu đã đăng"}
            </button>
          )}
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      </div>

      {/* Media */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">
            {mediaIsVideo ? "Media (video đã quay)" : "Media (ảnh đơn/nhiều)"}
            {isYoutube && <span className="text-muted font-normal"> · tuỳ chọn</span>}
          </label>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => fileInput.current?.click()} disabled={busy === "upload"}>
              {busy === "upload" ? "Đang tải lên…" : "Upload"}
            </button>
            <button className="btn btn-ghost" onClick={genImage} disabled={busy === "genimg"}>
              {busy === "genimg"
                ? "Đang tạo… (~30-90s)"
                : isYoutube
                ? "Tạo thumbnail (Claude)"
                : isShort
                ? "Tạo ảnh (Claude)"
                : "Tạo ảnh / carousel (Claude)"}
            </button>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={mediaIsVideo ? "video/*" : "image/*"}
          hidden
          onChange={(e) => uploadFiles(e.target.files)}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => files.length === 0 && fileInput.current?.click()}
          className={`rounded-lg border-2 border-dashed p-4 transition ${
            dragOver ? "border-brand bg-canvas" : "border-line"
          } ${files.length === 0 ? "cursor-pointer" : ""}`}
        >
          {files.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              {busy === "upload" ? (
                "Đang tải lên…"
              ) : (
                <>
                  Kéo-thả {mediaIsVideo ? "video" : "ảnh"} vào đây, dán ảnh{" "}
                  <b>(Ctrl+V)</b>, hoặc bấm <b>Upload</b>.
                </>
              )}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {files.map((f) => (
                <div key={f} className="relative group">
                  {isVideo(f) ? (
                    <div className="aspect-square rounded-lg bg-canvas border border-line flex items-center justify-center text-xs text-muted p-2 text-center break-all">
                      🎬 {f}
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media?id=${encodeURIComponent(id)}&file=${encodeURIComponent(f)}`} alt={f} className="aspect-square object-cover rounded-lg border border-line w-full" />
                  )}
                  <button onClick={() => delMedia(f)} className="absolute top-1 right-1 bg-white/90 border border-line rounded px-1.5 text-xs opacity-0 group-hover:opacity-100">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {files.length > 0 && (
          <p className="text-xs text-muted mt-2">
            Kéo-thả thêm vào khung trên, hoặc dán ảnh (Ctrl+V) bất kỳ lúc nào.
          </p>
        )}
      </div>

      {/* Publish */}
      <div className="card p-5">
        <label className="label">
          {isYoutube
            ? "Đăng lên (Facebook/LinkedIn, YouTube vẫn đăng tay)"
            : `Đăng lên (${isShort ? "platform video" : "platform text"})`}
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {platformOptions.map((p) => (
            <button
              key={p.key}
              onClick={() => togglePlatform(p.key)}
              className={`chip cursor-pointer ${platforms.includes(p.key) ? "!bg-brand !text-white !border-brand" : ""}`}
            >
              {p.label}
              <span className="opacity-60 ml-1">{isShort || isYoutube ? "🎬" : "✎"}</span>
            </button>
          ))}
        </div>

        {isYoutube && (
          <p className="text-xs text-muted mb-4">
            Giới hạn thời lượng video: Facebook tới 240 phút (4 tiếng), thoải mái cho video dài.
            LinkedIn chỉ tới 10 phút qua API (web cho phép 15 phút), video dài hơn sẽ bị từ chối.
            Cắt bản ngắn riêng nếu muốn đăng LinkedIn.
          </p>
        )}

        {platforms.includes("youtube") && (
          <div className="mb-4">
            <label className="label">Playlist YouTube</label>
            <select
              className="select"
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
            >
              <option value="">(không thêm vào playlist)</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} {p.privacy === "private" ? "(private)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-xs text-muted mb-4">
          {publishAt
            ? "Tự đăng đúng Ngày đăng ở trên."
            : "Chưa đặt Ngày đăng thì đăng ngay."}
        </p>

        <div className="rounded-lg border border-line p-3 mb-4 grid gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={c2dOn} onChange={(e) => setC2dOn(e.target.checked)} />
            Bật Comment to DM khi đăng
          </label>
          {c2dOn && (
            <>
              <div>
                <label className="label">Keyword comment</label>
                <input
                  className="input"
                  placeholder='VD: "AGENT"'
                  value={c2dKeyword}
                  onChange={(e) => setC2dKeyword(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Tài liệu (dán câu DM kèm link)</label>
                <textarea
                  className="textarea"
                  rows={4}
                  placeholder={"Mình gửi bạn tài liệu nha:\nhttps://…\n\nCó gì cần thêm cứ nhắn mình."}
                  value={c2dMessage}
                  onChange={(e) => setC2dMessage(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted">
                Ai comment đúng keyword sẽ được reply công khai + like + nhận DM này. Rule tạo sau
                khi đăng thành công và <b>chỉ áp đúng bài này</b>. Cần tick Facebook hoặc Instagram
                (TikTok/YouTube/LinkedIn không gửi DM riêng được).
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            className="btn btn-primary"
            disabled={busy === "publish" || platforms.length === 0}
            onClick={publish}
          >
            {busy === "publish" ? "Đang đăng…" : publishAt ? "Lên lịch đăng" : "Đăng ngay"}
          </button>
          {result != null && !hasFailure(result) && msg && (
            <span className="chip !bg-green-50 !text-green-700 !border-green-200">✓ {msg}</span>
          )}
        </div>

        <ResultView r={result} />
      </div>
    </div>
  );
}
