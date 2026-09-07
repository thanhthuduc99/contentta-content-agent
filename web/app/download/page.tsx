"use client";
import { useState } from "react";

type Result = { url: string; ok: boolean; file?: string; size?: number; error?: string; via?: string };

const mb = (n?: number) => (n ? (n / 1048576).toFixed(1) + " MB" : "");

export default function DownloadPage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dest, setDest] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  const urls = input
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  async function run() {
    if (busy || !urls.length) return;
    setBusy(true);
    setErr("");
    setResults([]);
    try {
      const r = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error || "Tải lỗi");
      else {
        setResults(d.results || []);
        setDest(d.dest || "");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Tải video</h1>
        <p className="text-muted text-sm mt-1">
          Dán link Facebook, Instagram, TikTok hoặc YouTube. File lưu vào <code>D:\Downloads</code>.
          Chỉ tải được video công khai. TikTok đi qua Apify (~$0.006 mỗi video), 3 nền tảng còn lại
          miễn phí.
        </p>
      </div>

      <div className="card p-5 grid gap-4">
        <div>
          <label className="label">Link (mỗi dòng 1 link)</label>
          <textarea
            className="textarea"
            rows={6}
            placeholder={"https://www.tiktok.com/@user/video/123…\nhttps://www.youtube.com/watch?v=…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <p className="text-xs text-muted mt-1">{urls.length} link</p>
        </div>

        {err && <p className="text-sm text-brand">{err}</p>}

        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={busy || !urls.length} onClick={run}>
            {busy ? "Đang tải…" : "Tải về"}
          </button>
          {busy && <span className="text-sm text-muted">Video dài có thể mất vài phút mỗi cái.</span>}
        </div>
      </div>

      {results.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="label mb-0">Kết quả</label>
            {dest && <span className="text-xs text-muted">{dest}</span>}
          </div>
          <div className="grid gap-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 text-sm ${
                  r.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                }`}
              >
                <p className={r.ok ? "text-green-700" : "text-red-700"}>
                  {r.ok ? `✓ ${r.file}` : "✗ Lỗi"}
                  {r.ok && r.size ? <span className="text-muted"> · {mb(r.size)}</span> : null}
                  {r.via && <span className="text-muted"> · {r.via}</span>}
                </p>
                <p className="text-xs text-muted truncate mt-0.5">{r.url}</p>
                {!r.ok && r.error && (
                  <p className="text-xs text-red-700 mt-1 break-all">{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
