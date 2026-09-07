"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "@/components/markdown";
import { splitThreads } from "@/lib/threads-chain";
import { postJson } from "@/lib/post-json";
import { DEFAULT_COMMENT_REPLY, DEFAULT_DM_MESSAGE } from "@/lib/comment-automation-defaults";
import { PUB_PLATFORMS, accountLabel, slotById, useAccounts } from "@/lib/use-accounts";
import type { Group } from "@/lib/group-post";

type Item = {
  id: string;
  type: string;
  content_type?: string;
  platform?: string;
  accounts?: string;
  topic?: string;
  date?: string;
  status?: string;
  publish_at?: string | null;
  publish_caption?: string;
  posted?: boolean;
  posted_at?: string | null;
  parent?: string | null;
  edit_state?: string;
  source_url?: string;
  cta_keyword?: string;
  first_comment?: string;
  group_posted_at?: string | null;
  groups?: string;
  body: string;
};

// Platform gửi được DM riêng (TikTok/YouTube/LinkedIn không có API này).
const DM_PLATFORMS = ["facebook", "instagram"];

const PLATFORMS = PUB_PLATFORMS;

// Trả về của GET /api/group-post: phiên FB + relay Zalo có sẵn sàng để đăng group không.
type GroupHealth = {
  fb: { ok: boolean; reason?: string };
  zalo: { ok: boolean; reason?: string };
  busy: string | null;
};

const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];
const isVideo = (f: string) => VIDEO_EXT.some((e) => f.toLowerCase().endsWith(e));

// Key trong result do server đặt: "instagram" cho account đầu, "instagram2" cho account
// thứ hai. Danh sách cứng không còn đủ, phải đọc thẳng key của object.
function slotsOf(r: unknown): string[] {
  if (!r || typeof r !== "object") return [];
  const o = r as Record<string, unknown>;
  return Object.keys(o).filter((k) => {
    const v = o[k];
    return k !== "status" && !!v && typeof v === "object" && typeof (v as PlatResult).status === "string";
  });
}

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

// Platform comment tự động được (Threads thì câu comment thành mắt xích cuối chuỗi).
const COMMENTABLE = ["facebook", "instagram", "linkedin", "youtube", "threads"];

type PlatResult = {
  status?: string;
  account?: string; // tên account Zernio đã đăng (2 Instagram thì phải có tên mới phân biệt được)
  reason?: string;
  platformPostId?: string;
  zernioPostId?: string;
  comment?: { status?: string; reason?: string };
  inbox?: boolean; // TikTok: Zernio hết chỗ đăng thẳng, video đã vào Creator Inbox, đăng nốt trong app
  [k: string]: unknown;
};

function hasFailure(r: unknown): boolean {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, PlatResult | string>;
  if (o.error) return true;
  if (o.status === "failed") return true;
  return slotsOf(r).some((k) => (o[k] as PlatResult)?.status === "failed");
}

function hasPendingPublication(r: unknown): boolean {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, PlatResult | string>;
  // Inbox TikTok là trạng thái cuối (việc còn lại làm trong app), không chặn đánh dấu đã đăng.
  return slotsOf(r).some((k) => (o[k] as PlatResult)?.status === "pending" && !(o[k] as PlatResult)?.inbox);
}

function successfulPlatforms(r: unknown): string[] {
  if (!r || typeof r !== "object") return [];
  const o = r as Record<string, PlatResult | string>;
  return slotsOf(r).filter((k) => (o[k] as PlatResult)?.status === "ok");
}

function platformIssues(r: unknown): { platform: string; status: string; reason: string }[] {
  if (!r || typeof r !== "object") return [];
  const o = r as Record<string, PlatResult | string>;
  return slotsOf(r).flatMap((platform) => {
    const entry = o[platform] as PlatResult | undefined;
    if (!entry || entry.status === "ok") return [];
    return [{
      platform,
      status: entry.status || "failed",
      reason:
        entry.reason ||
        (entry.status === "pending" ? "Zernio đang xử lý" : "Zernio không xác nhận đã đăng"),
    }];
  });
}

// Tóm tắt comment tự động để ghép vào msg. Zernio comment giúp nên chỉ biết là đã gửi kèm,
// muốn chắc thì mở bài ra xem.
function commentSummary(r: unknown): string {
  const o = (r || {}) as Record<string, PlatResult | undefined>;
  const sent = slotsOf(r).filter((k) => o[k]?.comment?.status === "sent");
  const skipped = slotsOf(r).filter((k) => o[k]?.comment && o[k]?.comment?.status !== "sent");
  const parts: string[] = [];
  if (sent.length) parts.push(`Đã gửi kèm comment cho ${sent.join(", ")}`);
  if (skipped.length) parts.push(`Không comment ${skipped.join(", ")}`);
  return parts.length ? ` ${parts.join(". ")}.` : "";
}

// Success → tag xanh theo từng account. JSON chỉ hiện khi có lỗi.
function ResultView({ r }: { r: unknown }) {
  if (r == null || typeof r !== "object") return null;
  const o = r as Record<string, PlatResult | string>;
  const entries = slotsOf(r).map((k) => ({ k, ...(o[k] as PlatResult) }));
  const topError = o.error || (o.status === "failed" ? (o as PlatResult).reason || "lỗi" : null);
  const failed = hasFailure(r);
  const issues = platformIssues(r);
  return (
    <div className="mt-4 grid gap-2">
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entries.map((e) => {
            const ok = e.status === "ok";
            const pending = e.status === "pending";
            const skipped = e.status === "skipped";
            const cls = ok
              ? "!bg-green-50 !text-green-700 !border-green-200"
              : pending || skipped
              ? "!bg-amber-50 !text-amber-700 !border-amber-200"
              : "!bg-red-50 !text-red-700 !border-red-200";
            return (
              <span key={e.k} className={`chip ${cls}`} title={e.reason || ""}>
                {e.account ? `${e.k} · ${e.account}` : e.k} ·{" "}
                {ok
                  ? "đã đăng"
                  : e.inbox
                  ? "đã vào Hộp thư TikTok"
                  : pending
                  ? "đang xử lý"
                  : skipped
                  ? "bỏ qua"
                  : "lỗi"}
                {e.comment && (
                  <span className="opacity-70 ml-1" title={e.comment.reason || ""}>
                    · {e.comment.status === "sent" ? "kèm comment" : "không comment"}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
      {typeof topError === "string" && <p className="text-brand text-sm">{topError}</p>}
      {issues.length > 0 && (
        <div className="grid gap-1 text-sm">
          {issues.map((issue) => (
            <p
              key={issue.platform}
              className={issue.status === "pending" ? "text-amber-700" : "text-brand"}
            >
              {issue.platform}: {issue.reason}
            </p>
          ))}
        </div>
      )}
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
  const [pubCaption, setPubCaption] = useState("");
  const [status, setStatus] = useState("draft");
  const [publishAt, setPublishAt] = useState(""); // datetime-local value
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]); // accountId đã tick
  const { accounts, loading: accLoading, err: accErr } = useAccounts();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewMode, setPreviewMode] = useState(true); // script youtube/short: mặc định Xem trước
  const [firstComment, setFirstComment] = useState(""); // tự comment vào bài sau khi đăng
  const [c2dOn, setC2dOn] = useState(false); // short: bật comment-to-DM khi đăng
  const [c2dKeyword, setC2dKeyword] = useState("");
  const [c2dMessage, setC2dMessage] = useState("");
  const [playlists, setPlaylists] = useState<{ id: string; title: string; privacy?: string }[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [groups, setGroups] = useState<Group[]>([]); // group FB/Zalo cấu hình ở Settings
  const [groupSel, setGroupSel] = useState<string[]>([]);
  const [gHealth, setGHealth] = useState<GroupHealth | null>(null);
  const [groupResult, setGroupResult] = useState<unknown>(null);
  const [groupMsg, setGroupMsg] = useState("");
  // Bản đang nằm trên đĩa. So với state hiện tại để biết còn thay đổi chưa lưu.
  const [saved, setSaved] = useState({ body: "", pubCaption: "", firstComment: "" });
  const [leaveTo, setLeaveTo] = useState<string | null>(null); // đích đang chờ xác nhận ("" = quay lại)
  const fileInput = useRef<HTMLInputElement>(null);
  const presetDone = useRef(false);
  const router = useRouter();

  const dirty =
    !!item &&
    (body !== saved.body || pubCaption !== saved.pubCaption || firstComment !== saved.firstComment);

  // Quay lại trang Posts giữ nguyên view + filter (URL trước đó). Fallback "/" nếu mở trực tiếp.
  function navBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  function goBack() {
    if (dirty) setLeaveTo("");
    else navBack();
  }

  function leaveNow() {
    const to = leaveTo;
    setLeaveTo(null);
    if (to) router.push(to);
    else navBack();
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

  // Trả về true nếu lưu được — dùng cho nút "Lưu rồi thoát".
  const save = useCallback(async () => {
    if (!item) return false;
    const snap = { body, pubCaption, firstComment };
    setBusy("save");
    setMsg("");
    const r = await fetch("/api/item", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item,
        body,
        publish_caption: pubCaption,
        first_comment: firstComment,
        status,
        publish_at: localInputToIso(publishAt),
      }),
    });
    setBusy("");
    setMsg(r.ok ? "Đã lưu (content-agent + Obsidian)." : "Lưu lỗi.");
    if (r.ok) setSaved(snap);
    return r.ok;
  }, [item, body, pubCaption, firstComment, status, publishAt]);

  useEffect(() => {
    fetch(`/api/item?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.item) {
          const it = d.item as Item;
          setItem(it);
          setBody(it.body || "");
          setPubCaption(it.publish_caption || "");
          setC2dKeyword(it.cta_keyword || "");
          setFirstComment(it.first_comment || "");
          setStatus(it.status || "draft");
          setPublishAt(isoToLocalInput(it.publish_at));
          setSaved({
            body: it.body || "",
            pubCaption: it.publish_caption || "",
            firstComment: it.first_comment || "",
          });
        }
      });
    loadMedia();
    fetch("/api/youtube-playlists")
      .then((r) => r.json())
      .then((d) => setPlaylists(d.playlists || []))
      .catch(() => setPlaylists([]));
    fetch("/api/groups")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.groups || []) as Group[];
        setGroups(list);
        setGroupSel(list.filter((g) => g.enabled).map((g) => g.id));
      })
      .catch(() => setGroups([]));
    fetch("/api/group-post")
      .then((r) => r.json())
      .then((d) => setGHealth(d.error ? null : (d as GroupHealth)))
      .catch(() => setGHealth(null));
  }, [id, loadMedia]);

  // Tick sẵn chip: ưu tiên accountId đã lưu (frontmatter accounts), rồi tới platform cũ (map về
  // account đầu của platform đó), cuối cùng là mặc định theo loại bài. Phải đợi accounts về
  // nên tách khỏi effect load item. Bài youtube (Long) chưa từng đăng qua app nên platform
  // trong frontmatter là đánh dấu cũ, lọc theo kinds để không preset nhầm.
  useEffect(() => {
    if (presetDone.current || !item || !accounts.length) return;
    presetDone.current = true;
    const kind = item.type === "short" ? "video" : "text";
    const allowed = accounts.filter((a) =>
      PLATFORMS.find((p) => p.key === a.platform)?.kinds.includes(kind)
    );
    const savedIds = (item.accounts || "").split(";").map((x) => x.trim()).filter(Boolean);
    const byId = allowed.filter((a) => savedIds.includes(a.id));
    if (byId.length) {
      setSelected(byId.map((a) => a.id));
      return;
    }
    // Bài cũ chỉ có tên platform: lấy đúng account đầu tiên của mỗi platform đã ghi, không
    // tự đánh dấu thêm account mà bài đó chưa từng đăng.
    const savedPlats = (item.platform || "").split(";").map((x) => x.trim()).filter(Boolean);
    if (savedPlats.some((x) => allowed.some((a) => a.platform === x))) {
      setSelected(
        savedPlats
          .map((x) => allowed.find((a) => a.platform === x)?.id)
          .filter((x): x is string => !!x)
      );
      return;
    }
    // Bài mới: tick sẵn MỌI account của các platform mặc định theo loại bài.
    const defaults =
      item.type === "short"
        ? ["facebook", "instagram", "tiktok", "youtube"]
        : item.type === "post" || item.type === "youtube"
        ? ["facebook", "linkedin"]
        : [];
    setSelected(allowed.filter((a) => defaults.includes(a.platform)).map((a) => a.id));
  }, [item, accounts]);

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

  // Ctrl+S (Cmd+S trên Mac) = lưu, chặn hộp thoại save-page của trình duyệt.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (dirty && busy !== "save") save();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, busy, save]);

  // Đóng tab / F5 khi chưa lưu: hộp thoại mặc định của trình duyệt (không đổi chữ được).
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // App Router không có router events, nên bắt click vào link nội bộ ở capture phase
  // rồi chặn lại để hỏi. Bỏ qua link mở tab mới và click có phím tắt.
  useEffect(() => {
    if (!dirty) return;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element)?.closest?.("a");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || !a.href) return;
      const url = new URL(a.href);
      const here = location.pathname + location.search;
      if (url.origin !== location.origin || url.pathname + url.search === here) return;
      e.preventDefault();
      setLeaveTo(url.pathname + url.search);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  if (!item) return <p className="text-muted">Đang tải…</p>;

  const isYoutube = item.type === "youtube";
  const isShort = item.type === "short";
  const isPost = item.type === "post";
  const mediaIsVideo = isShort || isYoutube;
  const platformOptions = PLATFORMS.filter((p) =>
    p.kinds.includes(isShort ? "video" : "text")
  );
  const accountOptions = accounts.filter((a) => platformOptions.some((p) => p.key === a.platform));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  // Nhiều chỗ bên dưới chỉ cần biết đang tick những nền tảng nào (threads, youtube, comment…).
  const platforms = [
    ...new Set(selected.map((id) => accById.get(id)?.platform).filter((x): x is string => !!x)),
  ];
  const captionText = isShort || isYoutube ? pubCaption : body;
  // Preview chuỗi Threads — phải khớp đúng logic server trong lib/zernio-publish.ts.
  const threadParts = platforms.includes("threads")
    ? [...splitThreads(captionText), ...splitThreads(firstComment)]
    : [];

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
    if (!c2dOn || !c2dKeyword.trim()) return "";
    const dmAccounts = selected.filter((id) => {
      const p = accById.get(id)?.platform;
      return !!p && DM_PLATFORMS.includes(p);
    });
    if (!dmAccounts.length) {
      return " Chưa tạo rule Comment to DM: cần tick Facebook hoặc Instagram.";
    }
    if (scheduledTime) {
      return " Chưa tạo rule Comment to DM: bài hẹn lịch chưa có post ID. Sau khi bài lên, vào tab Comment - DM tạo tay.";
    }
    const o = (result || {}) as Record<string, PlatResult>;
    // Mỗi account một rule riêng (2 Instagram = 2 bài khác nhau), key là slot server trả về.
    const slots = slotById(accounts, selected);
    const targets: Record<string, { accountId: string; postId: string; platformPostId?: string; postTitle?: string }> = {};
    for (const accountId of dmAccounts) {
      const slot = slots[accountId];
      const postId = slot ? o[slot]?.zernioPostId : undefined;
      if (postId) {
        targets[slot] = {
          accountId,
          postId: String(postId),
          platformPostId: o[slot]?.platformPostId ? String(o[slot].platformPostId) : undefined,
          postTitle: captionText.split("\n", 1)[0]?.trim().slice(0, 160),
        };
      }
    }
    if (!Object.keys(targets).length) {
      return " Chưa tạo rule Comment to DM: Zernio không trả post ID. Vào tab Comment - DM tạo tay.";
    }
    try {
      const cr = await fetch("/api/auto-rules/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: c2dKeyword.trim(),
          message: c2dMessage.trim() || DEFAULT_DM_MESSAGE,
          commentReply: DEFAULT_COMMENT_REPLY,
          targets,
        }),
      });
      const cd = await cr.json();
      if (!cr.ok) return ` Rule Comment to DM lỗi: ${cd.error || "không rõ"}.`;
      const extra = Array.isArray(cd.errors) && cd.errors.length ? ` ${cd.errors.join(" ")}` : "";
      return ` + ${cd.created || 0} rule Comment to DM native (chỉ bài này).${extra}`;
    } catch (e) {
      return ` Rule Comment to DM lỗi: ${(e as Error).message}.`;
    }
  }

  async function publish() {
    const caption = captionText;
    if ((isShort || isYoutube) && !pubCaption.trim()) {
      setMsg("Cần điền Caption đăng trước khi đăng.");
      return;
    }
    setBusy("publish");
    setMsg("");
    setResult(null);
    const scheduledTime = localInputToIso(publishAt) || undefined;
    try {
      const { ok, data } = await postJson("/api/publish", {
        id,
        files,
        accountIds: selected,
        scheduledTime,
        caption,
        playlistId: platforms.includes("youtube") ? playlistId : "",
        firstComment,
      });
      const res = data.result || data;
      setResult(res);
      const failed = hasFailure(res);
      const pending = hasPendingPublication(res);
      if (ok && !failed && !(pending && !scheduledTime)) {
        await fetch("/api/mark-posted", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, scheduledTime }),
        });
        // Ghi lại đúng platform đã đăng (có thể nhiều) để PostsTable/Card/Calendar + filter không hiển thị sai.
        const publishedPlatform = platforms.join(";");
        const publishedAccounts = selected.join(";");
        // Đăng ngay -> set publish_at = giờ đăng để LÊN CALENDAR (scheduled thì đã có giờ).
        const whenIso = scheduledTime || new Date().toISOString();
        await patch({
          platform: publishedPlatform,
          accounts: publishedAccounts,
          publish_at: whenIso,
          first_comment: firstComment,
        });
        const newStatus = scheduledTime ? "scheduled" : "published";
        setStatus(newStatus);
        setPublishAt(isoToLocalInput(whenIso));
        setItem((it) =>
          it
            ? {
                ...it,
                status: newStatus,
                posted: true,
                platform: publishedPlatform,
                accounts: publishedAccounts,
                publish_at: whenIso,
              }
            : it
        );
        setMsg(
          (scheduledTime ? "Đã lên lịch + đánh dấu." : "Đã gửi đăng + đánh dấu.") +
            commentSummary(res) +
            (await createC2dRule(res, scheduledTime))
        );
      } else if (ok && pending) {
        setMsg("Zernio đang xử lý đăng. Chưa đánh dấu đã đăng; xem trạng thái từng nền tảng bên dưới.");
      } else if (ok) {
        const succeeded = successfulPlatforms(res);
        const issues = platformIssues(res);
        const sent = succeeded.length ? `Đã đăng: ${succeeded.join(", ")}. ` : "";
        const errors = issues.length
          ? `Lỗi: ${issues.map((issue) => `${issue.platform}: ${issue.reason}`).join(" · ")}. `
          : "";
        setMsg(`${sent}${errors}Chưa đánh dấu đã đăng; nếu thử lại, chỉ chọn nền tảng bị lỗi.`);
      } else {
        setMsg(String(data.error || "Đăng lỗi."));
      }
    } catch (e) {
      setMsg(`Đăng lỗi: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  function toggleGroup(gid: string) {
    setGroupSel((s) => (s.includes(gid) ? s.filter((x) => x !== gid) : [...s, gid]));
  }

  // Đăng lên group FB/Zalo qua scripts/group_poster (không qua Zernio). Không đụng status/posted.
  // Server tự ghi group_posted_at + groups vào frontmatter khi có group OK.
  async function postToGroups() {
    const caption = captionText;
    if (!caption.trim()) {
      setGroupMsg(isShort || isYoutube ? "Cần điền Caption đăng trước." : "Bài chưa có nội dung.");
      return;
    }
    setBusy("groupPost");
    setGroupMsg("");
    setGroupResult(null);
    try {
      const { ok, status, data } = await postJson("/api/group-post", {
        id,
        caption,
        files,
        groupIds: groupSel,
      });
      if (status === 409) {
        setGroupMsg(String(data.error || "Đang có job đăng group khác, chờ xong rồi bấm lại."));
        return;
      }
      const res = data.result || data;
      setGroupResult(res);
      if (data.item) setItem(data.item as Item);
      if (ok && !hasFailure(res)) setGroupMsg("Đã đăng lên group.");
      else if (ok) setGroupMsg("Có group lỗi, xem chi tiết bên dưới.");
      else setGroupMsg(String(data.error || "Đăng group lỗi."));
    } catch (e) {
      setGroupMsg(`Đăng group lỗi: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
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

  function toggleAccount(accountId: string) {
    setSelected((p) =>
      p.includes(accountId) ? p.filter((x) => x !== accountId) : [...p, accountId]
    );
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
          {dirty && (
            <span className="chip !bg-amber-50 !text-amber-700 !border-amber-200">Chưa lưu</span>
          )}
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

        {platforms.includes("threads") && threadParts.length > 0 && (
          <div className="mt-4 grid gap-1">
            <p className="text-xs text-muted">
              {threadParts.length > 1
                ? `Threads: nội dung trên tự chia thành ${threadParts.length} post nối tiếp, ảnh gắn vào phần 1.`
                : "Threads: đăng nguyên nội dung trên trong 1 post."}
              {firstComment.trim() && " Câu comment tự động thành phần cuối."}
            </p>
            {threadParts.length > 1 &&
              threadParts.map((p, i) => (
                <p key={i} className="text-xs text-muted truncate">
                  <b>Phần {i + 1}</b> · {p.length} ký tự · {p.replace(/\s+/g, " ").slice(0, 50)}
                </p>
              ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <button
            className={`btn ${dirty ? "btn-primary" : "btn-ghost"}`}
            disabled={busy === "save"}
            onClick={save}
          >
            {busy === "save" ? "Đang lưu…" : "Lưu"}
          </button>
          {isYoutube && (
            <button className="btn btn-primary" disabled={busy === "markyt"} onClick={markPostedYoutube}>
              {busy === "markyt" ? "Đang lưu…" : "Đánh dấu đã đăng"}
            </button>
          )}
          {dirty ? (
            <span className="text-sm text-amber-700">Chưa lưu · Ctrl+S để lưu</span>
          ) : (
            msg && <span className="text-sm text-muted">{msg}</span>
          )}
        </div>
      </div>

      {/* Media */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">
            {mediaIsVideo ? "Media (video đã quay)" : "Media (nhiều ảnh, hoặc 1 video ngắn)"}
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
          accept={mediaIsVideo ? "video/*" : "image/*,video/*"}
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
                  Kéo-thả {mediaIsVideo ? "video" : "ảnh hoặc video"} vào đây, dán ảnh{" "}
                  <b>(Ctrl+V)</b>, hoặc bấm <b>Upload</b>.
                </>
              )}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {files.map((f) => (
                <div key={f} className="relative group">
                  {isVideo(f) ? (
                    <video
                      src={`/api/media?id=${encodeURIComponent(id)}&file=${encodeURIComponent(f)}#t=0.1`}
                      controls
                      preload="metadata"
                      className="aspect-square object-contain rounded-lg border border-line w-full bg-black"
                    />
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
          {accountOptions.map((a) => (
            <button
              key={a.id}
              onClick={() => toggleAccount(a.id)}
              className={`chip cursor-pointer ${selected.includes(a.id) ? "!bg-brand !text-white !border-brand" : ""}`}
            >
              {accountLabel(a)}
              <span className="opacity-60 ml-1">{isShort || isYoutube ? "🎬" : "✎"}</span>
            </button>
          ))}
        </div>
        {accLoading && <p className="text-xs text-muted mb-2">Đang tải account…</p>}
        {accErr && <p className="text-sm text-brand mb-2">Không lấy được account Zernio: {accErr}</p>}
        {!accLoading && !accErr && accountOptions.length === 0 && (
          <p className="text-sm text-muted mb-2">
            Chưa kết nối account nào cho loại bài này. Vào Connections để kết nối.
          </p>
        )}

        {isYoutube && (
          <p className="text-xs text-muted mb-4">
            Giới hạn thời lượng video: Facebook tới 240 phút (4 tiếng), thoải mái cho video dài.
            LinkedIn chỉ tới 10 phút qua API (web cho phép 15 phút), video dài hơn sẽ bị từ chối.
            Cắt bản ngắn riêng nếu muốn đăng LinkedIn.
          </p>
        )}

        {isPost && (
          <p className="text-xs text-muted mb-4">
            Nhiều ảnh: Facebook và Threads tối đa 10, LinkedIn tối đa 20, dư sẽ bị cắt bớt.
            Kèm video thì bài chỉ đăng video (ảnh bị bỏ), Threads nhận MP4 H.264 tối đa 5 phút.
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

        <div className="rounded-lg border border-line p-3 mb-4 grid gap-2">
          <label className="label mb-0">Comment tự động sau khi đăng</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder={"Bỏ trống thì không comment.\nVD: Link tài liệu đây nha: https://…"}
            value={firstComment}
            onChange={(e) => setFirstComment(e.target.value)}
          />
          <p className="text-xs text-muted">
            Đăng xong Zernio tự comment câu này vào chính bài vừa đăng, để link nằm dưới comment thay
            vì trong bài. Bài hẹn lịch cũng chạy. Facebook, Instagram, LinkedIn, YouTube comment
            thẳng, Threads thì câu này thành phần cuối của chuỗi.
            {platforms.some((p) => !COMMENTABLE.includes(p)) && (
              <b> Đang tick {platforms.filter((p) => !COMMENTABLE.includes(p)).join(", ")}, mấy cái này sẽ bỏ qua.</b>
            )}
          </p>
        </div>

        <div className="rounded-lg border border-line p-3 mb-4 grid gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={c2dOn}
              onChange={(e) => {
                const checked = e.target.checked;
                setC2dOn(checked);
                if (checked && !c2dMessage.trim()) setC2dMessage(DEFAULT_DM_MESSAGE);
              }}
            />
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
                  placeholder={DEFAULT_DM_MESSAGE}
                  value={c2dMessage}
                  onChange={(e) => setC2dMessage(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted">
                Ai comment đúng keyword sẽ được reply công khai + nhận DM này. Rule tạo sau
                khi đăng thành công và <b>chỉ áp đúng bài này</b>. Cần tick Facebook hoặc Instagram
                (TikTok/YouTube/LinkedIn không gửi DM riêng được). Like tự động không áp dụng cho rule native.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            className="btn btn-primary"
            disabled={busy === "publish" || selected.length === 0}
            onClick={publish}
          >
            {busy === "publish" ? "Đang đăng…" : publishAt ? "Lên lịch đăng" : "Đăng ngay"}
          </button>
          {result != null && msg && (
            <span
              className={`chip ${
                hasFailure(result)
                  ? "!bg-red-50 !text-red-700 !border-red-200"
                  : hasPendingPublication(result)
                  ? "!bg-amber-50 !text-amber-700 !border-amber-200"
                  : "!bg-green-50 !text-green-700 !border-green-200"
              }`}
            >
              {hasFailure(result) ? "!" : hasPendingPublication(result) ? "…" : "✓"} {msg}
            </span>
          )}
        </div>

        <ResultView r={result} />
      </div>

      {/* Group FB + Zalo: đi scripts/group_poster, không qua Zernio */}
      <div className="card p-5">
        <label className="label">Đăng lên cộng đồng (group Facebook + Zalo)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {groups
            .filter((g) => g.enabled)
            .map((g) => (
              <button
                key={g.id}
                onClick={() => toggleGroup(g.id)}
                className={`chip cursor-pointer ${groupSel.includes(g.id) ? "!bg-brand !text-white !border-brand" : ""}`}
              >
                <span className="opacity-60 mr-1">{g.platform === "fb" ? "FB" : "Zalo"}</span>
                {g.label || g.target}
              </button>
            ))}
        </div>
        {groups.filter((g) => g.enabled).length === 0 && (
          <p className="text-sm text-muted mb-2">Chưa có group nào. Thêm trong Settings.</p>
        )}
        <p className="text-xs text-muted mb-1">
          Facebook: {!gHealth ? "đang kiểm tra…" : gHealth.fb.ok ? "sẵn sàng" : gHealth.fb.reason} · Zalo
          relay: {!gHealth ? "đang kiểm tra…" : gHealth.zalo.ok ? "sẵn sàng" : gHealth.zalo.reason} ·{" "}
          <a className="underline" href="/settings">
            Cấu hình
          </a>
        </p>
        <p className="text-xs text-muted mb-4">
          Facebook nhận {isShort ? "caption + video" : "nội dung + ảnh (có clip thì gửi cả clip)"}. Zalo nhận
          text + link YouTube (lấy từ bài), không gửi video. Chạy tuần tự: Zalo trước, rồi mở Chrome
          thật cho Facebook, cách nhau khoảng 30 giây mỗi group. Đừng đóng cửa sổ Chrome, nhất là khi
          đang up video.
        </p>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-primary"
            disabled={busy === "groupPost" || groupSel.length === 0}
            onClick={postToGroups}
          >
            {busy === "groupPost" ? "Đang đăng group…" : "Đăng lên group"}
          </button>
          {groupMsg && (
            <span
              className={`chip ${
                groupResult && !hasFailure(groupResult)
                  ? "!bg-green-50 !text-green-700 !border-green-200"
                  : "!bg-red-50 !text-red-700 !border-red-200"
              }`}
            >
              {groupResult && !hasFailure(groupResult) ? "✓" : "!"} {groupMsg}
            </span>
          )}
        </div>
        {item.group_posted_at && (
          <p className="text-xs text-muted mt-2">
            Đã đăng group lúc {new Date(item.group_posted_at).toLocaleString("vi-VN")}
            {item.groups ? ` (${item.groups})` : ""}
          </p>
        )}
        <ResultView r={groupResult} />
      </div>

      {leaveTo !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setLeaveTo(null)}
        >
          <div className="card p-5 w-full max-w-sm grid gap-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-ink">Bài chưa lưu</p>
            <p className="text-sm text-muted">
              Nội dung vừa sửa chưa ghi xuống file. Lưu trước khi rời trang?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary"
                disabled={busy === "save"}
                onClick={async () => {
                  if (await save()) leaveNow();
                }}
              >
                {busy === "save" ? "Đang lưu…" : "Lưu rồi thoát"}
              </button>
              <button className="btn btn-ghost" onClick={leaveNow}>
                Thoát không lưu
              </button>
              <button className="btn btn-ghost" onClick={() => setLeaveTo(null)}>
                Ở lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
