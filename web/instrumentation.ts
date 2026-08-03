// Chạy khi Next server khởi động (nodejs runtime).
let dailyStarted = false;

function startDailyResearch() {
  if (dailyStarted) return;
  dailyStarted = true;
  const HOUR = 8; // 08:00 giờ máy (VN)
  // Gọi API route (nodejs runtime) — KHÔNG import lib node-only vào instrumentation (tránh edge bundle).
  // GET = skip-aware (runDaily tự bỏ qua nếu hôm nay đã chạy).
  const run = () =>
    fetch("http://localhost:8502/api/research/daily", { method: "GET" })
      .then((r) => r.json())
      .then((r) => console.log("[daily-research]", JSON.stringify(r).slice(0, 200)))
      .catch((e) => console.error("[daily-research]", e));
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(HOUR, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next.getTime() - now.getTime();
    console.log("[daily-research] next run in", Math.round(ms / 60000), "min");
    setTimeout(() => {
      run();
      schedule();
    }, ms);
  };
  schedule();

  // Catch-up: nếu server boot SAU 08:00 (hoặc máy bật trễ) → chạy 1 lần sau 60s.
  // runDaily() tự skip nếu hôm nay đã chạy → an toàn khi restart nhiều lần.
  if (new Date().getHours() >= HOUR) {
    console.log("[daily-research] đã qua 8h → catch-up sau 60s");
    setTimeout(run, 60_000);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPollLoop } = await import("./lib/poll");
    startPollLoop();
    startDailyResearch();
  }
}
