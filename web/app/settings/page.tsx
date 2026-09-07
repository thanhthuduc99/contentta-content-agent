"use client";
import { useEffect, useState } from "react";
import GroupsSection from "./groups-section";

type Row = {
  name: string;
  desc: string;
  configured: boolean | null;
  hint: string;
};

export default function SettingsPage() {
  const [zernioOk, setZernioOk] = useState<boolean | null>(null);

  const [zernioConfigured, setZernioConfigured] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setZernioOk(!d.error))
      .catch(() => setZernioOk(false));
  }, []);

  function loadSettings() {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setZernioConfigured(!!d.zernio))
      .catch(() => setZernioConfigured(false));
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function saveKey() {
    if (!keyInput.trim()) return;
    setSaving(true);
    setSavedMsg("");
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zernioKey: keyInput }),
      });
      setKeyInput("");
      setEditing(false);
      loadSettings();
      setSavedMsg("Đã lưu, tải lại trang để áp dụng.");
    } finally {
      setSaving(false);
    }
  }

  const rows: Row[] = [
    {
      name: "Zernio",
      desc: "Inbox / analytics / campaigns",
      configured: zernioOk,
      hint: "Kết nối + đăng đa kênh, đọc inbox/comment.",
    },
  ];

  function statusLabel(c: boolean | null) {
    if (c === null) return <span className="chip">chưa kiểm tra</span>;
    return c ? (
      <span className="chip !bg-green-50 !text-green-700 !border-green-200">đã cấu hình</span>
    ) : (
      <span className="chip !bg-red-50 !text-red-700 !border-red-200">chưa cấu hình</span>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-muted mt-1">
          Trạng thái dịch vụ tích hợp, cấu hình Zernio và đăng lên group
        </p>
      </div>

      {/* Integrations card */}
      <div className="card p-5">
        <h2 className="font-bold text-ink">Tích hợp &amp; trạng thái</h2>
        <p className="text-sm text-muted mt-0.5 mb-4">
          Không hiển thị key — chỉ kiểm tra đã cấu hình hay chưa.
        </p>
        <div className="grid gap-1">
          {rows.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between gap-3 py-3 border-t border-line first:border-t-0"
            >
              <div className="min-w-0">
                <div className="font-semibold text-ink">
                  {r.name} <span className="text-muted font-normal text-sm">· {r.desc}</span>
                </div>
                <div className="text-xs text-muted mt-0.5">{r.hint}</div>
              </div>
              {statusLabel(r.configured)}
            </div>
          ))}
        </div>
      </div>

      {/* Zernio API key card */}
      <div className="card p-5">
        <h2 className="font-bold text-ink mb-1">Cấu hình Zernio API key</h2>
        <p className="text-sm text-muted mb-3">
          Dán API key của bạn lấy từ Zernio. App dùng key này để đăng bài và đọc inbox.
        </p>

        {zernioConfigured === null ? (
          <p className="text-sm text-muted">Đang kiểm tra...</p>
        ) : zernioConfigured && !editing ? (
          <div className="flex items-center gap-3">
            <span className="chip !bg-green-50 !text-green-700 !border-green-200">đã cấu hình</span>
            <button className="btn" onClick={() => setEditing(true)}>
              Đổi key
            </button>
          </div>
        ) : (
          <div className="grid gap-2 max-w-md">
            <label className="label">Zernio API key</label>
            <input
              className="input"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Dán key vào đây"
            />
            <div className="flex items-center gap-2">
              <button
                className="btn btn-primary"
                onClick={saveKey}
                disabled={saving || !keyInput.trim()}
              >
                {saving ? "Đang lưu..." : "Lưu key"}
              </button>
              {zernioConfigured && (
                <button
                  className="btn"
                  onClick={() => {
                    setEditing(false);
                    setKeyInput("");
                  }}
                >
                  Hủy
                </button>
              )}
            </div>
          </div>
        )}

        {savedMsg && <p className="text-sm text-brand mt-3">{savedMsg}</p>}
      </div>

      <GroupsSection />
    </div>
  );
}
