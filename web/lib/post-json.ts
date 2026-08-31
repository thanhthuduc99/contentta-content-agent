// POST JSON có timeout + parse an toàn (client).
// Đăng bài chạy lâu thật (upload video lặp lại theo từng key Zernio) nên request treo hoặc
// đứt giữa chừng là chuyện xảy ra. Để fetch/r.json() throw thẳng thì nút kẹt "Đang đăng…"
// vĩnh viễn mà không báo gì, nên luôn trả về object thay vì ném lỗi.
export type JsonResult = { ok: boolean; status: number; data: Record<string, unknown> };

export async function postJson(
  url: string,
  body: unknown,
  timeoutMs = 10 * 60_000
): Promise<JsonResult> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    try {
      return { ok: r.ok, status: r.status, data: text ? JSON.parse(text) : {} };
    } catch {
      return {
        ok: false,
        status: r.status,
        data: { error: `HTTP ${r.status}, server trả về không phải JSON: ${text.slice(0, 200)}` },
      };
    }
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      status: 0,
      data: {
        error:
          err.name === "TimeoutError"
            ? `Quá ${Math.round(timeoutMs / 60_000)} phút server không trả lời. Bài có thể đã đăng hoặc chưa, kiểm tra trên nền tảng trước khi đăng lại.`
            : `Mất kết nối tới server: ${err.message}`,
      },
    };
  }
}
