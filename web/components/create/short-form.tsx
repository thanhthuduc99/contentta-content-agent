"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/post-json";
import { accountLabel, useAccounts } from "@/lib/use-accounts";

type PubMode = "now" | "schedule" | "draft";

// Đích đăng của short. LinkedIn nhận video nhưng không nằm trong luồng này, muốn đăng
// LinkedIn thì lưu nháp rồi mở bài ra tick.
const SHORT_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"];

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
  const { accounts, loading: accLoading, err: accErr } = useAccounts();
  const accountOptions = accounts.filter((a) => SHORT_PLATFORMS.includes(a.platform));
  const [selected, setSelected] = useState<string[]>([]);
  const [pubMode, setPubMode] = useState<PubMode>("now");
  const [datetime, setDatetime] = useState("");

  // Mặc định tick hết account video, nhưng phải đợi danh sách account về mới biết có những gì.
  const preset = useRef(false);
  useEffect(() => {
    if (preset.current || !accountOptions.length) return;
    preset.current = true;
    setSelected(accountOptions.map((a) => a.id));
  }, [accountOptions]);

  function toggleAccount(accountId: string) {
    setSelected((p) =>
      p.includes(accountId) ? p.filter((x) => x !== accountId) : [...p, accountId]
    );
  }

  async function submitUpload() {
    if (!file) throw new Error("Chọn video đã edit.");
    if (!caption.trim()) throw new Error("Nhập caption đã.");
    if (pubMode === "schedule" && !datetime) throw new Error("Chọn ngày & giờ để lên lịch.");
    if (pubMode !== "draft" && selected.length === 0) throw new Error("Chọn ít nhất 1 account để đăng.");

    const topicGuess = caption.trim().split("\n")[0].slice(0, 60) || file.name;
    // Tạo item (body = caption làm tham chiếu, short không cần script)
    const { ok, data } = await postJson("/api/generate", {
      type: "short",
      content_type: "chia-se-kien-thuc",
      topic: topicGuess,
      manual: true,
      body: caption.trim(),
      publish_caption: caption.trim(),
    });
    if (!ok) throw new Error(String(data.error || "Tạo bài lỗi"));
    const id = (data.item as { id: string }).id;

    // Upload video. File nặng nên đi riêng bằng FormData, có timeout để không treo nút.
    const fd = new FormData();
    fd.append("id", id);
    fd.append("files", file);
    let saved: string[];
    try {
      const up = await fetch("/api/media", {
        method: "POST",
        body: fd,
        signal: AbortSignal.timeout(10 * 60_000),
      });
      const ud = await up.json();
      if (!up.ok) throw new Error(ud.error || `HTTP ${up.status}`);
      saved = ud.saved || [];
    } catch (e) {
      const err = e as Error;
      throw new Error(
        `Upload video lỗi: ${err.name === "TimeoutError" ? "quá 10 phút không xong" : err.message}`
      );
    }
    if (!saved.length) throw new Error("Upload video lỗi: server không lưu được file nào.");

    if (pubMode === "draft") {
      onCreated?.(id);
      onClose();
      router.push(`/item?id=${encodeURIComponent(id)}`);
      return;
    }

    // Đăng ngay / lên lịch
    const scheduledTime = pubMode === "schedule" ? toIsoVN(datetime) : undefined;
    const pub = await postJson("/api/publish", {
      id,
      files: saved,
      accountIds: selected,
      scheduledTime,
      caption: caption.trim(),
    });
    if (!pub.ok) throw new Error(String(pub.data.error || "Đăng lỗi"));
    // Zernio báo lỗi theo từng nền tảng trong result, HTTP vẫn 200. Không đọc chỗ này thì
    // bài fail vẫn bị đánh dấu đã đăng.
    const res = (pub.data.result || {}) as Record<
      string,
      { status?: string; reason?: string; account?: string }
    >;
    const failed = Object.keys(res).filter((k) => res[k]?.status === "failed");
    if (failed.length) {
      throw new Error(
        `Đăng lỗi: ${failed
          .map((k) => `${res[k]?.account || k} (${res[k]?.reason || "không rõ"})`)
          .join(", ")}. ` + `Video đã lưu vào bài, mở bài ra đăng lại phần còn thiếu.`
      );
    }
    await fetch("/api/mark-posted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, scheduledTime }),
    });
    await fetch("/api/item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        platform: [...new Set(accountOptions.filter((a) => selected.includes(a.id)).map((a) => a.platform))].join(";"),
        accounts: selected.join(";"),
      }),
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
          {accountOptions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggleAccount(a.id)}
              className={`chip cursor-pointer ${selected.includes(a.id) ? "!bg-brand !text-white !border-brand" : ""}`}
            >
              {accountLabel(a)} 🎬
            </button>
          ))}
        </div>
        {accLoading && <p className="text-xs text-muted mt-1">Đang tải account…</p>}
        {accErr && <p className="text-sm text-brand mt-1">Không lấy được account Zernio: {accErr}</p>}
        {!accLoading && !accErr && accountOptions.length === 0 && (
          <p className="text-sm text-muted mt-1">Chưa kết nối account video nào trong Zernio.</p>
        )}
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
