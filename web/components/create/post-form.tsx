"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "youtube" | "share" | "manual";

export default function PostForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (id?: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("youtube");

  const [ytUrl, setYtUrl] = useState("");
  const [shareInput, setShareInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [manualText, setManualText] = useState("");
  const [contentType, setContentType] = useState("chia-se-kien-thuc");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      let id: string;
      if (mode === "youtube") {
        if (!ytUrl.trim()) throw new Error("Dán link YouTube đã.");
        const r = await fetch("/api/generate/from-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: ytUrl.trim() }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Tạo post lỗi");
        id = d.item.id;
      } else if (mode === "share") {
        const input = shareInput.trim();
        if (!input) throw new Error("Dán nội dung hoặc link nguồn đã.");
        const isUrl = /^https?:\/\/\S+$/i.test(input);
        const r = await fetch("/api/generate/share-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isUrl ? { url: input, keyword: keyword.trim() } : { text: input, keyword: keyword.trim() }
          ),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Tạo post lỗi");
        id = d.item.id;
      } else {
        const text = manualText.trim();
        if (!text) throw new Error("Dán nội dung đã.");
        const topicGuess = text.split("\n")[0].slice(0, 60) || "Bài viết";
        const r = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "post",
            content_type: contentType,
            topic: topicGuess,
            manual: true,
            body: text,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Tạo bài lỗi");
        id = d.item.id;
      }
      onCreated?.(id);
      onClose();
      router.push(`/item?id=${encodeURIComponent(id)}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-2 flex-wrap">
        {[
          { v: "youtube" as Mode, label: "Post YouTube" },
          { v: "share" as Mode, label: "Post chia sẻ" },
          { v: "manual" as Mode, label: "Thủ công" },
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

      {mode === "youtube" && (
        <>
          <div>
            <label className="label">Link video YouTube (của bạn hoặc người khác)</label>
            <input
              className="input"
              placeholder="https://www.youtube.com/watch?v=…"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">
            App đọc transcript + tải thumbnail về → AI viết post theo voice của bạn, link video ở cuối
            bài. Video cần có phụ đề. Mất ~1-3 phút.
          </p>
        </>
      )}

      {mode === "share" && (
        <>
          <div>
            <label className="label">Nội dung HOẶC link nguồn (YouTube / GitHub / bài viết)</label>
            <textarea
              className="textarea"
              rows={5}
              placeholder="Dán thông tin muốn chia sẻ, hoặc dán 1 link…"
              value={shareInput}
              onChange={(e) => setShareInput(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Keyword nhận tài liệu (tùy chọn)</label>
            <input
              className="input"
              placeholder='VD: "AGENT". Bỏ trống nếu không cần CTA.'
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">
            Có keyword: AI thêm CTA comment vào bài. Rule Comment to DM bạn bật lúc đăng, không tạo ở
            đây. Bỏ trống: chỉ viết post. Vào editor bấm <b>Tạo ảnh / carousel (Claude)</b> để sinh bộ
            ảnh.
          </p>
        </>
      )}

      {mode === "manual" && (
        <>
          <div>
            <label className="label">Nội dung post</label>
            <textarea
              className="textarea"
              rows={8}
              placeholder="Dán bài viết sẵn có…"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Kiểu nội dung</label>
            <select className="select" value={contentType} onChange={(e) => setContentType(e.target.value)}>
              <option value="chia-se-kien-thuc">Chia sẻ kiến thức nhanh</option>
              <option value="nhan-tai-lieu">Nhận tài liệu (lead magnet)</option>
            </select>
          </div>
        </>
      )}

      {err && <p className="text-sm text-brand">{err}</p>}

      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Hủy
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy
            ? mode === "manual"
              ? "Đang lưu…"
              : "AI đang viết… (~1-3 phút)"
            : mode === "manual"
            ? "Lưu bài"
            : "AI viết post"}
        </button>
      </div>
    </div>
  );
}
