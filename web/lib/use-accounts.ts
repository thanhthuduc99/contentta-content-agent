"use client";
import { useEffect, useState } from "react";

export type PubAccount = { id: string; platform: string; name: string };

// Platform đăng được qua Zernio + loại content dùng được. Thứ tự ở đây cũng là thứ tự chip.
export const PUB_PLATFORMS: { key: string; label: string; kinds: ("text" | "video")[] }[] = [
  { key: "facebook", label: "Facebook", kinds: ["text", "video"] },
  { key: "linkedin", label: "LinkedIn", kinds: ["text", "video"] },
  { key: "threads", label: "Threads", kinds: ["text"] },
  { key: "instagram", label: "Instagram", kinds: ["video"] },
  { key: "tiktok", label: "TikTok", kinds: ["video"] },
  { key: "youtube", label: "YouTube", kinds: ["video"] },
];

const ORDER = new Map(PUB_PLATFORMS.map((p, i) => [p.key, i]));

export function platformOf(a: PubAccount) {
  return PUB_PLATFORMS.find((p) => p.key === a.platform);
}

export function accountLabel(a: PubAccount): string {
  const label = platformOf(a)?.label || a.platform;
  return a.name ? `${label} · ${a.name}` : label;
}

// Account kết nối trong Zernio (gộp cả 4 key). Sort cứng theo bảng trên rồi tới tên vì API
// trả thứ tự khác nhau giữa các lần gọi, để nguyên thì chip nhảy chỗ mỗi lần load.
export function useAccounts(): { accounts: PubAccount[]; loading: boolean; err: string } {
  const [accounts, setAccounts] = useState<PubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErr(String(d.error));
          return;
        }
        const list = ((d.accounts || []) as PubAccount[])
          .filter((a) => ORDER.has(a.platform))
          .sort(
            (a, b) =>
              (ORDER.get(a.platform) as number) - (ORDER.get(b.platform) as number) ||
              (a.name || "").localeCompare(b.name || "") ||
              a.id.localeCompare(b.id)
          );
        setAccounts(list);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return { accounts, loading, err };
}

// Cùng quy tắc đặt slot với lib/zernio-publish.ts: account đầu của mỗi platform giữ tên
// trần ("instagram"), account sau thành "instagram2". Dùng để tra kết quả đăng theo account.
export function slotById(accounts: PubAccount[], selected: string[]): Record<string, string> {
  const seen: Record<string, number> = {};
  const out: Record<string, string> = {};
  for (const id of selected) {
    const a = accounts.find((x) => x.id === id);
    if (!a) continue;
    const k = (seen[a.platform] = (seen[a.platform] || 0) + 1);
    out[id] = k === 1 ? a.platform : `${a.platform}${k}`;
  }
  return out;
}
