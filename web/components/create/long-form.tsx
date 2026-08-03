"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "ai" | "manual";

export default function LongForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (id?: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ai");
  const [contentType, setContentType] = useState("chia-se-kien-thuc");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const manual = mode === "manual";
      if (!topic.trim()) throw new Error("Nhập chủ đề đã.");
      if (manual && !script.trim()) throw new Error("Dán script đã.");
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "youtube",
          content_type: contentType,
          topic,
          notes: manual ? undefined : notes,
          manual,
          body: manual ? script : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Tạo script lỗi");
      onCreated?.(d.item.id);
      onClose();
      router.push(`/item?id=${encodeURIComponent(d.item.id)}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {[
          { v: "ai" as Mode, label: "AI viết script" },
          { v: "manual" as Mode, label: "Dán script sẵn" },
        ].map((m) => (
          <button
            key={m.v}
            type="button"
            onClick={() => setMode(m.v)}
            className={`chip cursor-pointer ${mode === m.v ? "!bg-brand !text-white !border-brand" : ""}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Chủ đề</label>
          <input
            className="input"
            placeholder="VD: Claude Code cho content creator"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Kiểu nội dung</label>
          <select className="select" value={contentType} onChange={(e) => setContentType(e.target.value)}>
            <option value="chia-se-kien-thuc">Chia sẻ kiến thức nhanh</option>
            <option value="nhan-tai-lieu">Nhận tài liệu (lead magnet)</option>
          </select>
        </div>
      </div>

      {mode === "ai" ? (
        <div>
          <label className="label">Ghi chú thêm (tuỳ chọn)</label>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Số liệu thật, ví dụ, góc nhìn muốn nhấn…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="text-xs text-muted mt-1">
            AI viết script 20-25 phút (5 title vidIQ + description) rồi mở editor. Mất ~1-3 phút.
          </p>
        </div>
      ) : (
        <div>
          <label className="label">Script</label>
          <textarea
            className="textarea"
            rows={10}
            placeholder="Dán script video dài vào đây…"
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
        </div>
      )}

      {err && <p className="text-sm text-brand">{err}</p>}

      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Hủy
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Đang xử lý… (~1-3 phút)" : mode === "ai" ? "AI viết script" : "Lưu script"}
        </button>
      </div>
    </div>
  );
}
