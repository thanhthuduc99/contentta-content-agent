"use client";
import { useEffect, useMemo, useState } from "react";

type Account = { id: string; platform: string; name: string };

const PLATFORM_META: Record<string, { label: string; emoji: string }> = {
  facebook: { label: "Facebook", emoji: "📘" },
  instagram: { label: "Instagram", emoji: "📸" },
  youtube: { label: "YouTube", emoji: "▶️" },
  tiktok: { label: "TikTok", emoji: "🎵" },
  linkedin: { label: "LinkedIn", emoji: "💼" },
  threads: { label: "Threads", emoji: "🧵" },
  zalo: { label: "Zalo", emoji: "💬" },
  twitter: { label: "X / Twitter", emoji: "✖️" },
};

function meta(p: string) {
  return PLATFORM_META[p?.toLowerCase()] || { label: p || "Platform", emoji: "🔗" };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profileId, setProfileId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [copied, setCopied] = useState<string>("");

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else {
          setAccounts(d.accounts || []);
          setProfileId(d.profileId || "");
        }
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const platforms = useMemo(() => {
    const set = new Set(accounts.map((a) => a.platform?.toLowerCase()).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [accounts]);

  const filtered = useMemo(
    () =>
      platformFilter === "all"
        ? accounts
        : accounts.filter((a) => a.platform?.toLowerCase() === platformFilter),
    [accounts, platformFilter]
  );

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Connections</h1>
          <p className="text-sm text-muted mt-1">Quản lý profile &amp; nền tảng</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="btn btn-primary"
            href="https://zernio.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Kết nối tài khoản mới trong Zernio"
          >
            + New Connection
          </a>
          <a
            className="btn btn-ghost"
            href="https://zernio.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Tạo profile mới trong Zernio"
          >
            New Profile
          </a>
        </div>
      </div>

      {err && <p className="text-brand text-sm">{err}</p>}
      {loading && <p className="text-muted text-sm">Đang tải…</p>}

      {!loading && !err && (
        <>
          {/* Platforms section + filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">Platforms</h2>
            <div className="flex flex-wrap items-center gap-2">
              {platforms.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`chip cursor-pointer ${
                    platformFilter === p ? "border-brand text-brand bg-surface" : ""
                  }`}
                >
                  {p === "all" ? "Tất cả nền tảng" : meta(p).label}
                  <span className="ml-1">▾</span>
                </button>
              ))}
            </div>
          </div>

          {filtered.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((a) => {
                const m = meta(a.platform);
                return (
                  <div key={a.id} className="card p-4 grid gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-canvas border border-line flex items-center justify-center text-lg shrink-0">
                        {m.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-ink">{m.label}</span>
                          <span className="chip !bg-green-50 !text-green-700 !border-green-200">
                            connected
                          </span>
                        </div>
                        <div className="text-sm text-muted truncate mt-0.5">{a.name || a.id}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-line">
                      <button
                        onClick={() => copyId(a.id)}
                        className="btn btn-ghost text-xs !py-1.5 !px-3"
                        title="Copy account ID"
                      >
                        {copied === a.id ? "✓ Đã copy" : "⧉ Copy ID"}
                      </button>
                      <button
                        className="btn btn-ghost text-xs !py-1.5 !px-3"
                        disabled
                        title="Quản lý kết nối trong Zernio"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <div className="text-3xl mb-2">🔗</div>
              <p className="text-ink font-semibold">Chưa có kết nối nào</p>
              <p className="text-muted text-sm mt-1">
                Kết nối tài khoản trong Zernio dashboard để bắt đầu.
              </p>
            </div>
          )}

          <p className="text-xs text-muted">
            {profileId && <>Profile ID: {profileId} · </>}
            Comment inbox chưa hỗ trợ TikTok (TikTok khóa API). Kết nối &amp; ngắt kết nối được quản
            lý trong Zernio.
          </p>
        </>
      )}
    </div>
  );
}
