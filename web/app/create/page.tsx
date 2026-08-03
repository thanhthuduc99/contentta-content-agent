"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type CType = "youtube" | "short" | "post";
type ContentType = "chia-se-kien-thuc" | "nhan-tai-lieu";

const TYPE_LABEL: Record<CType, string> = {
  youtube: "YouTube",
  short: "Video ngắn",
  post: "Post",
};

type QueueStatus =
  | { kind: "wait" }
  | { kind: "running" }
  | { kind: "done"; id: string }
  | { kind: "error"; msg: string };

type QueueRow = {
  key: string;
  type: CType;
  content_type: ContentType;
  topic: string;
  notes: string;
  manual: boolean;
  body: string;
  status: QueueStatus;
};

export default function CreatePage() {
  const router = useRouter();
  const [type, setType] = useState<CType>("post");
  const [contentType, setContentType] = useState<ContentType>("chia-se-kien-thuc");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [pasted, setPasted] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [running, setRunning] = useState(false);

  function currentSpecValid(): boolean {
    if (!topic.trim()) return false;
    if (mode === "manual" && !pasted.trim()) return false;
    return true;
  }

  function buildBody() {
    return {
      type,
      content_type: contentType,
      topic,
      notes,
      manual: mode === "manual",
      body: mode === "manual" ? pasted : undefined,
    };
  }

  async function generateOne() {
    if (!topic.trim()) return;
    if (mode === "manual" && !pasted.trim()) {
      setErr("Dán nội dung vào đã.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sinh nội dung lỗi");
      router.push(`/item?id=${encodeURIComponent(d.item.id)}`);
    } catch (e) {
      setErr((e as Error).message);
      setLoading(false);
    }
  }

  function addToQueue() {
    if (!currentSpecValid()) {
      setErr(mode === "manual" ? "Cần có tên và nội dung dán vào." : "Nhập chủ đề đã.");
      return;
    }
    setErr("");
    setQueue((q) => [
      ...q,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        content_type: contentType,
        topic: topic.trim(),
        notes,
        manual: mode === "manual",
        body: mode === "manual" ? pasted : "",
        status: { kind: "wait" },
      },
    ]);
    setTopic("");
    setNotes("");
    setPasted("");
  }

  function removeFromQueue(key: string) {
    setQueue((q) => q.filter((r) => r.key !== key));
  }

  async function runAll() {
    if (running) return;
    setRunning(true);
    setErr("");
    // Lấy danh sách key cần chạy tại thời điểm bấm (các dòng đang chờ hoặc lỗi).
    const keys = queue
      .filter((r) => r.status.kind === "wait" || r.status.kind === "error")
      .map((r) => r.key);

    for (const key of keys) {
      const row = queue.find((r) => r.key === key);
      if (!row) continue;
      setQueue((q) =>
        q.map((r) => (r.key === key ? { ...r, status: { kind: "running" } } : r))
      );
      try {
        const r = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: row.type,
            content_type: row.content_type,
            topic: row.topic,
            notes: row.notes,
            manual: row.manual,
            body: row.manual ? row.body : undefined,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Sinh nội dung lỗi");
        setQueue((q) =>
          q.map((x) =>
            x.key === key ? { ...x, status: { kind: "done", id: d.item.id } } : x
          )
        );
      } catch (e) {
        const msg = (e as Error).message;
        setQueue((q) =>
          q.map((x) => (x.key === key ? { ...x, status: { kind: "error", msg } } : x))
        );
      }
    }
    setRunning(false);
  }

  const pendingCount = queue.filter(
    (r) => r.status.kind === "wait" || r.status.kind === "error"
  ).length;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink mb-5">Tạo nội dung mới</h1>

      <div className="card p-5 grid gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={`chip cursor-pointer ${mode === "ai" ? "!bg-brand !text-white !border-brand" : ""}`}
          >
            AI viết
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`chip cursor-pointer ${mode === "manual" ? "!bg-brand !text-white !border-brand" : ""}`}
          >
            Tôi tự dán
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Loại nội dung</label>
            <select
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as CType)}
            >
              <option value="youtube">YouTube</option>
              <option value="short">Video ngắn</option>
              <option value="post">Post</option>
            </select>
          </div>
          <div>
            <label className="label">Kiểu (chỉ 2 loại)</label>
            <select
              className="select"
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
            >
              <option value="chia-se-kien-thuc">Chia sẻ kiến thức nhanh</option>
              <option value="nhan-tai-lieu">Nhận tài liệu (lead magnet)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">{mode === "manual" ? "Tên (để đặt tên file)" : "Chủ đề"}</label>
          <input
            className="input"
            placeholder="VD: Claude Code cho content creator"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>

        {mode === "ai" ? (
          <div>
            <label className="label">Ghi chú thêm (tuỳ chọn)</label>
            <textarea
              className="textarea"
              rows={3}
              placeholder="Số liệu thật, ví dụ, góc nhìn muốn nhấn…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <label className="label">Nội dung (dán vào — AI không sửa)</label>
            <textarea
              className="textarea"
              rows={12}
              placeholder="Dán bài viết / script của bạn vào đây…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">{pasted.length} ký tự</p>
          </div>
        )}

        {err && <p className="text-brand text-sm">{err}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary justify-center"
            disabled={loading || running || !currentSpecValid()}
            onClick={generateOne}
          >
            {mode === "manual"
              ? loading
                ? "Đang lưu…"
                : "Lưu 1 bài ngay"
              : loading
              ? "Claude đang viết… (~30-120s)"
              : "Tạo 1 bài ngay"}
          </button>
          <button
            className="btn btn-ghost justify-center"
            type="button"
            disabled={loading || running || !currentSpecValid()}
            onClick={addToQueue}
          >
            Thêm vào hàng đợi
          </button>
        </div>
        <p className="text-xs text-muted">
          {mode === "manual"
            ? "Lưu thẳng nội dung bạn dán vào content-agent, rồi mở editor để đính media và đăng. Nếu đã cấu hình Obsidian, app sẽ mirror tự động."
            : "Dùng Claude Code trên máy. Kết quả lưu vào content-agent và được mirror sang Obsidian nếu bạn đã cấu hình."}
        </p>
      </div>

      {queue.length > 0 && (
        <div className="card p-5 grid gap-3 mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">
              Hàng đợi tạo nhiều bài ({queue.length})
            </h2>
            <button
              className="btn btn-primary"
              type="button"
              disabled={running || pendingCount === 0}
              onClick={runAll}
            >
              {running ? "Đang tạo tuần tự…" : `Tạo tất cả (${pendingCount})`}
            </button>
          </div>

          <div className="grid gap-2">
            {queue.map((row) => (
              <div
                key={row.key}
                className="flex items-center gap-3 border border-line rounded-lg px-3 py-2 bg-surface"
              >
                <span className="chip shrink-0">{TYPE_LABEL[row.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink text-sm truncate">{row.topic}</p>
                  <p className="text-xs text-muted truncate">
                    {row.content_type === "nhan-tai-lieu"
                      ? "Nhận tài liệu"
                      : "Chia sẻ kiến thức"}
                    {row.manual ? " · tự dán" : ""}
                  </p>
                </div>
                <StatusBadge status={row.status} />
                {row.status.kind === "wait" && !running && (
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    onClick={() => removeFromQueue(row.key)}
                  >
                    Xóa
                  </button>
                )}
              </div>
            ))}
          </div>

          {running && (
            <p className="text-xs text-muted">
              Đang chạy tuần tự từng bài — giữ tab này mở tới khi xong nhé (mỗi bài ~30-120s).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: QueueStatus }) {
  if (status.kind === "wait") {
    return (
      <span className="chip shrink-0 !bg-gray-50 !text-gray-700 !border-gray-200">chờ</span>
    );
  }
  if (status.kind === "running") {
    return (
      <span className="chip shrink-0 !bg-blue-50 !text-blue-700 !border-blue-200">
        đang tạo… (~30-120s)
      </span>
    );
  }
  if (status.kind === "done") {
    return (
      <a
        href={`/item?id=${encodeURIComponent(status.id)}`}
        className="chip shrink-0 !bg-green-50 !text-green-700 !border-green-200"
      >
        xong → mở
      </a>
    );
  }
  return (
    <span
      className="chip shrink-0 !bg-amber-50 !text-amber-700 !border-amber-200"
      title={status.msg}
    >
      lỗi: {status.msg}
    </span>
  );
}
