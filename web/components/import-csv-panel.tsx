"use client";
import { useEffect, useRef, useState } from "react";

type RowResult = { row: number; ok: boolean; id?: string; error?: string };
type BulkResult = { created: number; total: number; results: RowResult[] };

const COLUMN_REF: Array<{ name: string; desc: string; required: boolean }> = [
  {
    name: "post_content",
    desc: "Nội dung bài viết. Dòng đầu dùng làm chủ đề.",
    required: true,
  },
  {
    name: "platforms",
    desc: "Danh sách platform, phân tách bằng ; hoặc | (vd: facebook;instagram).",
    required: false,
  },
  {
    name: "schedule_time",
    desc: "Giờ đăng (VN). ISO sẵn, hoặc 'YYYY-MM-DD HH:mm', hoặc 'YYYY-MM-DD'.",
    required: false,
  },
];

const SAMPLE_CSV = `post_content,platforms,schedule_time
"Minh vua build xong he thong tu dong hoa content. Ai can thi inbox.",facebook;instagram,2026-06-10 20:00
"3 cach dung Claude Code de viet content nhanh hon.",facebook,2026-06-11 09:30
"Tai lieu mien phi: 50 prompt cho content creator.",facebook;threads,`;

export default function ImportCsvPanel({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: (result: BulkResult) => void;
}) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) return;
    setCsv("");
    setFileName("");
    setDragOver(false);
    setShowRef(false);
    setBusy(false);
    setErr("");
    setResult(null);
  }, [open]);

  if (!open) return null;

  function readFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErr("Chỉ nhận file .csv");
      return;
    }
    setErr("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ""));
    reader.onerror = () => setErr("Đọc file lỗi");
    reader.readAsText(file);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-posts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (busy) return;
    if (!csv.trim()) {
      setErr("Chọn file CSV đã.");
      return;
    }
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const r = await fetch("/api/bulk-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Import lỗi");
      setResult(d as BulkResult);
      onDone?.(d as BulkResult);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const failed = result?.results.filter((x) => !x.ok) || [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-md h-full rounded-none flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="text-xl font-bold text-ink">Tạo hàng loạt từ CSV</h2>
            <p className="text-sm text-muted">Import nhiều bài cùng lúc</p>
          </div>
          <button
            type="button"
            className="text-muted hover:text-ink text-2xl leading-none"
            onClick={onClose}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-4 content-start">
          {/* Dropzone */}
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
            }}
          />
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) readFile(f);
            }}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              dragOver ? "border-brand bg-brand/5" : "border-line bg-canvas"
            }`}
          >
            <p className="text-2xl mb-1">📄</p>
            {fileName ? (
              <p className="text-sm text-ink font-medium">{fileName}</p>
            ) : (
              <>
                <p className="text-sm text-ink font-medium">
                  Kéo-thả file .csv vào đây
                </p>
                <p className="text-xs text-muted">hoặc bấm để chọn file</p>
              </>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={downloadSample}
            >
              ⬇ Sample CSV
            </button>
            <button
              type="button"
              className="text-sm text-muted hover:text-brand"
              onClick={() => setShowRef((v) => !v)}
            >
              {showRef ? "Ẩn mô tả cột" : "Show CSV column reference"}
            </button>
          </div>

          <p className="text-xs text-muted">
            Required columns:{" "}
            <code className="text-ink">post_content, platforms, schedule_time</code>
          </p>

          {showRef && (
            <div className="grid gap-2 rounded-xl border border-line p-3 bg-canvas">
              {COLUMN_REF.map((c) => (
                <div key={c.name} className="text-xs">
                  <span className="font-semibold text-ink">{c.name}</span>
                  {c.required ? (
                    <span className="chip ml-2 !bg-brand/10 !text-brand !border-brand/20">
                      bắt buộc
                    </span>
                  ) : (
                    <span className="chip ml-2">tuỳ chọn</span>
                  )}
                  <p className="text-muted mt-0.5">{c.desc}</p>
                </div>
              ))}
            </div>
          )}

          {err && <p className="text-sm text-brand">{err}</p>}

          {result && (
            <div className="grid gap-2 rounded-xl border border-line p-3">
              <p className="text-sm text-ink font-semibold">
                Tạo {result.created}/{result.total} bài
              </p>
              {failed.length === 0 ? (
                <p className="text-xs text-green-700">Tất cả OK.</p>
              ) : (
                <div className="grid gap-1">
                  <p className="text-xs text-brand font-medium">
                    {failed.length} dòng lỗi:
                  </p>
                  {failed.map((f) => (
                    <p key={f.row} className="text-xs text-muted">
                      Dòng {f.row}: {f.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Đóng
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleImport}
            disabled={busy || !csv.trim()}
          >
            {busy ? "Đang import…" : "Import CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}
