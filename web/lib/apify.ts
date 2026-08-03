import "./env";

// Apify run-sync: chạy actor rồi trả luôn dataset items. Nuốt lỗi mềm (trả [])
// để 1 nguồn chết không làm sập cả báo cáo daily.
// maxTotalChargeUsd = trần chi phí cứng mỗi run, actor tự dừng khi chạm trần.
export async function runActor<T>(
  actorId: string,
  input: Record<string, unknown>,
  maxChargeUsd = 0.05
): Promise<T[]> {
  const token = (process.env.APIFY_API_KEY || "").trim();
  if (!token) return [];
  const url =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&maxTotalChargeUsd=${maxChargeUsd}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(240_000),
    });
    if (!r.ok) {
      console.error(`[apify] ${actorId} ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return [];
    }
    const j = await r.json();
    return Array.isArray(j) ? (j as T[]) : [];
  } catch (e) {
    console.error(`[apify] ${actorId} lỗi:`, (e as Error).message);
    return [];
  }
}
