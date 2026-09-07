"use client";
import { useCallback, useEffect, useState } from "react";
import type { Group } from "@/lib/group-post";

type Health = {
  fb: { ok: boolean; reason?: string; lastOkAt?: string };
  zalo: { ok: boolean; reason?: string };
  busy: "post" | "login" | null;
  lastLogin?: { at: string; ok: boolean };
};

const okChip = "chip !bg-green-50 !text-green-700 !border-green-200";
const badChip = "chip !bg-red-50 !text-red-700 !border-red-200";
const warnChip = "chip !bg-amber-50 !text-amber-700 !border-amber-200";

// Rút gọn từ checklist trong plan: mấy việc làm là mất phiên FB/Zalo.
const DONTS = [
  "Không chạy Facebook headless. App luôn mở Chrome thật, đừng đóng cửa sổ giữa chừng, nhất là khi đang up video.",
  "Không mở profile này ở chỗ khác, không copy profile, không chạy skill upload-group cũ song song với app.",
  "Đăng nhập lại phải tick \"Duy trì đăng nhập\". Không tick thì đóng Chrome là mất phiên.",
  "Không mở chat.zalo.me trên bất kỳ trình duyệt nào. Zalo chỉ giữ 1 phiên web, mở là đá phiên của relay.",
  "Không hạ delay giữa các group (FB 30s, Zalo 15s). Một bài không bắn quá 3 đến 5 group FB, không quá 2 đợt/ngày.",
  "Không bật VPN hay đổi máy khi đăng. Phiên FB sống 2 đến 3 tuần rồi FB tự thu hồi, thấy cảnh báo tuổi phiên thì đăng nhập lại chủ động.",
];

export default function GroupsSection() {
  const [health, setHealth] = useState<Health | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [secretOk, setSecretOk] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [editSecret, setEditSecret] = useState(false);
  const [msg, setMsg] = useState("");
  const [zaloNames, setZaloNames] = useState<string[] | null>(null);
  const [plat, setPlat] = useState<"fb" | "zalo">("fb");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState("");

  const loadHealth = useCallback(() => {
    fetch("/api/group-post")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setHealth(d as Health);
      })
      .catch(() => {});
  }, []);
  const loadGroups = useCallback(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups || []))
      .catch(() => {});
  }, []);
  const loadSecret = useCallback(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSecretOk(!!d.zaloRelay))
      .catch(() => setSecretOk(false));
  }, []);

  useEffect(() => {
    loadHealth();
    loadGroups();
    loadSecret();
  }, [loadHealth, loadGroups, loadSecret]);

  // Đang login (Chrome mở chờ gõ mật khẩu) thì poll tới khi xong.
  useEffect(() => {
    if (health?.busy !== "login") return;
    const t = setInterval(loadHealth, 5000);
    return () => clearInterval(t);
  }, [health?.busy, loadHealth]);

  async function login() {
    setMsg("");
    const r = await fetch("/api/group-post/login", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(d.error || "Không mở được Chrome để đăng nhập.");
      return;
    }
    setMsg('Chrome đang mở. Đăng nhập Facebook trong đó, nhớ tick "Duy trì đăng nhập". Tối đa 5 phút.');
    loadHealth();
  }

  async function saveSecret() {
    if (!secret.trim()) return;
    setBusy("secret");
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zaloRelaySecret: secret }),
      });
      setSecret("");
      setEditSecret(false);
      loadSecret();
      loadHealth();
    } finally {
      setBusy("");
    }
  }

  async function addGroup() {
    if (!target.trim()) return;
    setBusy("add");
    setMsg("");
    try {
      const r = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: plat, target, label }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(d.error || "Thêm group lỗi.");
        return;
      }
      setTarget("");
      setLabel("");
      loadGroups();
    } finally {
      setBusy("");
    }
  }

  async function toggle(g: Group) {
    await fetch("/api/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: g.id, enabled: !g.enabled }),
    });
    loadGroups();
  }

  async function remove(g: Group) {
    if (!window.confirm(`Xóa group "${g.label || g.target}"?`)) return;
    await fetch(`/api/groups?id=${encodeURIComponent(g.id)}`, { method: "DELETE" });
    loadGroups();
  }

  async function showZaloNames() {
    setBusy("zalo");
    setMsg("");
    setZaloNames(null);
    try {
      const r = await fetch("/api/groups?zalo=1");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(d.error || "Không lấy được danh sách từ relay.");
        return;
      }
      setZaloNames(d.names || []);
    } finally {
      setBusy("");
    }
  }

  const fbAge = health?.fb.lastOkAt
    ? Math.floor((Date.now() - new Date(health.fb.lastOkAt).getTime()) / 86_400_000)
    : null;

  return (
    <>
      <div className="card p-5">
        <h2 className="font-bold text-ink mb-1">Đăng lên group (Facebook + Zalo)</h2>
        <p className="text-sm text-muted mb-3">
          Facebook mở Chrome thật với profile riêng trong web/scripts/group_poster/profiles. Zalo đi
          qua relay trên VPS, app tự mở SSH tunnel khi cần.
        </p>

        <div className="flex items-center justify-between gap-3 py-3 border-t border-line">
          <div className="min-w-0">
            <div className="font-semibold text-ink">Facebook</div>
            <div className="text-xs text-muted">
              {!health
                ? "Đang kiểm tra…"
                : health.fb.ok
                ? `Phiên còn tốt${fbAge !== null ? `, xác nhận lần cuối ${fbAge} ngày trước` : ""}`
                : health.fb.reason}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {health && (
              <span className={health.fb.ok ? okChip : warnChip}>
                {health.fb.ok ? "sẵn sàng" : "cần đăng nhập"}
              </span>
            )}
            <button className="btn" onClick={login} disabled={!!health?.busy}>
              {health?.busy === "login" ? "Chrome đang mở…" : "Đăng nhập lại Facebook"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 py-3 border-t border-line">
          <div className="min-w-0">
            <div className="font-semibold text-ink">Zalo relay</div>
            <div className="text-xs text-muted">
              {!health
                ? "Đang kiểm tra…"
                : health.zalo.ok
                ? "Relay kết nối được và đã đăng nhập Zalo"
                : health.zalo.reason}
            </div>
          </div>
          {health && (
            <span className={health.zalo.ok ? okChip : badChip}>{health.zalo.ok ? "sẵn sàng" : "lỗi"}</span>
          )}
        </div>

        <div className="py-3 border-t border-line">
          <label className="label">ZALO_RELAY_SECRET</label>
          {secretOk && !editSecret ? (
            <div className="flex items-center gap-3">
              <span className={okChip}>đã cấu hình</span>
              <button className="btn" onClick={() => setEditSecret(true)}>
                Đổi
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 max-w-md">
              <input
                className="input"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Khớp RELAY_SECRET trong .env của zalo-relay"
              />
              <button
                className="btn btn-primary"
                onClick={saveSecret}
                disabled={busy === "secret" || !secret.trim()}
              >
                Lưu
              </button>
              {secretOk && (
                <button
                  className="btn"
                  onClick={() => {
                    setEditSecret(false);
                    setSecret("");
                  }}
                >
                  Hủy
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 rounded-lg border border-line p-3">
          <div className="font-semibold text-ink text-sm mb-1">Đừng làm mấy cái này, không là bị log out</div>
          <ul className="text-xs text-muted list-disc pl-4 grid gap-0.5">
            {DONTS.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>

        {msg && <p className="text-sm text-brand mt-3">{msg}</p>}
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-ink mb-1">Danh sách group</h2>
        <p className="text-sm text-muted mb-3">
          Facebook: dán link group. Zalo: gõ đúng TÊN group như relay thấy (không phân biệt hoa
          thường). Bỏ tick là group không hiện trong editor.
        </p>
        <div className="grid gap-1 mb-4">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 py-2 border-t border-line first:border-t-0"
            >
              <label className="flex items-center gap-2 min-w-0 text-sm text-ink">
                <input type="checkbox" checked={g.enabled} onChange={() => toggle(g)} />
                <span className="chip">{g.platform === "fb" ? "Facebook" : "Zalo"}</span>
                <span className="truncate">
                  {g.label ? `${g.label} · ` : ""}
                  {g.target}
                </span>
              </label>
              <button className="btn" onClick={() => remove(g)}>
                Xóa
              </button>
            </div>
          ))}
          {groups.length === 0 && <p className="text-sm text-muted">Chưa có group nào.</p>}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Loại</label>
            <select
              className="select"
              value={plat}
              onChange={(e) => setPlat(e.target.value as "fb" | "zalo")}
            >
              <option value="fb">Facebook</option>
              <option value="zalo">Zalo</option>
            </select>
          </div>
          <div className="flex-1 min-w-[16rem]">
            <label className="label">{plat === "fb" ? "Link group" : "Tên group"}</label>
            <input
              className="input"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={
                plat === "fb" ? "https://www.facebook.com/groups/…" : "AI Agent Academy - Nhóm Hỗ Trợ"
              }
            />
          </div>
          <div>
            <label className="label">Nhãn (tuỳ chọn)</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <button
            className="btn btn-primary"
            onClick={addGroup}
            disabled={busy === "add" || !target.trim()}
          >
            Thêm
          </button>
        </div>

        <div className="mt-4">
          <button className="btn" onClick={showZaloNames} disabled={busy === "zalo"}>
            {busy === "zalo" ? "Đang hỏi relay…" : "Xem tên group Zalo relay thấy"}
          </button>
          {zaloNames &&
            (zaloNames.length ? (
              <ul className="text-sm text-ink mt-2 grid gap-0.5">
                {zaloNames.map((n) => (
                  <li key={n} className="flex items-center gap-2">
                    <span>{n}</span>
                    <button
                      className="text-xs underline text-muted"
                      onClick={() => {
                        setPlat("zalo");
                        setTarget(n);
                      }}
                    >
                      dùng
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted mt-2">Relay không thấy group nào.</p>
            ))}
        </div>
      </div>
    </>
  );
}
