import "./env";

// SociaVault — analytics bổ sung rẻ (public metrics, no OAuth). Optional.
// Base/endpoint có thể cần chỉnh theo docs.sociavault.com khi dùng thật.
const DEFAULT_BASE = "https://api.sociavault.com";

export function isConfigured(): boolean {
  return Boolean((process.env.SOCIAVAULT_API_KEY || "").trim());
}

export async function profileStats(platform: string, username: string) {
  const key = (process.env.SOCIAVAULT_API_KEY || "").trim();
  if (!key) throw new Error("SOCIAVAULT_API_KEY chưa cấu hình");
  const base = (process.env.SOCIAVAULT_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
  const r = await fetch(
    `${base}/v1/${encodeURIComponent(platform)}/${encodeURIComponent(username)}`,
    { headers: { Authorization: `Bearer ${key}` } }
  );
  if (!r.ok) throw new Error(`SociaVault ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
