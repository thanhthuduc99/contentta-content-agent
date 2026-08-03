"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PubMode = "now" | "schedule" | "draft";

const PLATFORMS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
];

function toIsoVN(value: string): string {
  return `${value}:00+07:00`;
}

export default function ShortForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (id?: string) => void;
}) {
  const router = useRouter();

  // chung
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  // upload mode
  const [platforms, setPlatforms] = useState<string[]>(PLATFORMS.map((p) => p.key));
  const [pubMode, setPubMode] = useState<PubMode>("now");
  const [datetime, setDatetime] = useState("");

  function togglePlatform(k: string) {
    setPlatforms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  async function submitUpload() {
    if (!file) throw new Error("Chọn video đã edit.");
    if (!caption.trim()) throw new Error("Nhập caption đã.");
    if (pubMode === "schedule" && !datetime) throw new Error("Chọn ngày & giờ để lên lịch.");
    if (pubMode !== "draft" && platforms.length === 0) throw new Error("Chọn ít nhất 1 platform.");

    const topicGuess = caption.trim().split("\n")[0].slice(0, 60) || file.name;
    // Tạo item (body = caption làm tham chiếu, short không cần script)
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "short",
        content_type: "chia-se-kien-thuc",
        topic: topicGuess,
        manual: true,
        body: caption.trim(),
        publish_caption: caption.trim(),
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Tạo bài lỗi");
    const id = d.item.id as string;

    // Upload video
    const fd = new FormData();
    fd.append("id", id);
    fd.append("files", file);
    const up = await fetch("/api/media", { method: "POST", body: fd });
    const ud = await up.json();
    if (!up.ok) throw new Error(ud.error || "Upload video lỗi");
    const saved: string[] = ud.saved || [];

    if (pubMode === "draft") {
      onCreated?.(id);
      onClose();
      router.push(`/item?id=${encodeURIComponent(id)}`);
      return;
    }

    // Đăng ngay / lên lịch
    const scheduledTime = pubMode === "schedule" ? toIsoVN(datetime) : undefined;
    const pub = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, files: saved, platforms, scheduledTime, caption: caption.trim() }),
    });
    const pd = await pub.json();
    if (!pub.ok) throw new Error(pd.error || "Đăng lỗi");
    await fetch("/api/mark-posted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, scheduledTime }),
    });
    await fetch("/api/item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, platform: platforms.join(";") }),
    });
    onCreated?.(id);
    onClose();
  }

  async function submit() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      await submitUpload();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* File */}
      <div>
        <label className="label">Video đã edit</label>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className={`w-full rounded-lg border-2 border-dashed p-5 text-sm transition ${
            file ? "border-brand bg-brand/5 text-ink" : "border-line text-muted hover:border-brand"
          }`}
        >
          {file ? `🎬 ${file.name}` : "Bấm để chọn video"}
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label mb-0">Caption đăng</label>
          <span className="text-xs text-muted">{caption.length} ký tự</span>
        </div>
        <textarea
          className="textarea"
          rows={4}
          placeholder="Caption gắn kèm video khi đăng…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Đăng lên</label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => togglePlatform(p.key)}
              className={`chip cursor-pointer ${platforms.includes(p.key) ? "!bg-brand !text-white !border-brand" : ""}`}
            >
              {p.label} 🎬
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Chế độ đăng</label>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-line p-1 bg-canvas">
          {(
            [
              { v: "now", label: "Đăng ngay" },
              { v: "schedule", label: "Lên lịch" },
              { v: "draft", label: "Lưu nháp" },
            ] as { v: PubMode; label: string }[]
          ).map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => setPubMode(s.v)}
              className={`rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                pubMode === s.v ? "bg-surface text-ink shadow-sm" : "text-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {pubMode === "schedule" && (
          <input
            type="datetime-local"
            className="input mt-3"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
          />
        )}
      </div>

      {err && <p className="text-sm text-brand">{err}</p>}

      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Hủy
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy
            ? "Đang xử lý…"
            : pubMode === "now"
            ? "Đăng ngay"
            : pubMode === "schedule"
            ? "Lên lịch"
            : "Lưu nháp"}
        </button>
      </div>
    </div>
  );
}
