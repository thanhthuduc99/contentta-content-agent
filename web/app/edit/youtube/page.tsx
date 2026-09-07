"use client";
import { useEffect, useState } from "react";

type JobState = "queued" | "running" | "done" | "failed";
type Job = { slug: string; topic: string; state: JobState; queuedAt: number; startedAt?: number; endedAt?: number };
type Build = {
  slug: string;
  state: JobState;
  logTail: string;
  hasVideo: boolean;
  caption: string | null;
  failReason: string | null;
  topic: string;
  itemId?: string | null;
  itemError?: string;
};
type ClipPick = { start: number; end: number; reason?: string };
type PostResult = {
  item?: { id: string; topic?: string };
  clip?: ClipPick | null;
  clipFile?: string | null;
  clipError?: string;
  error?: string;
};

const DEFAULT_GROUP_URL = "https://www.facebook.com/groups/aiauacademy";
const DEFAULT_GROUP_NAME = "AI Automation Academy";

// clipYouTube trả path tuyệt đối, /api/media chỉ nhận tên file trong thư mục media của item.
const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function EditYoutubePage() {
  const [url, setUrl] = useState("");
  const [groupUrl, setGroupUrl] = useState(DEFAULT_GROUP_URL);
  const [groupName, setGroupName] = useState(DEFAULT_GROUP_NAME);
  const [err, setErr] = useState("");

  const [postRunning, setPostRunning] = useState(false);
  const [postResult, setPostResult] = useState<PostResult | null>(null);

  const [buildStarting, setBuildStarting] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [build, setBuild] = useState<Build | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  async function loadJobs() {
    try {
      const d = await fetch("/api/edit/youtube").then((r) => r.json());
      setJobs(d.jobs || []);
    } catch {}
  }
  useEffect(() => { loadJobs(); }, []);

  // Poll trạng thái build (GET cũng tick queue + tự tạo item short khi xong).
  useEffect(() => {
    if (!slug) return;
    let stopped = false;
    const t = setInterval(() => tick(), 4000);
    const tick = async () => {
      if (stopped) return;
      try {
        const d: Build = await fetch(`/api/edit/youtube?slug=${slug}`).then((r) => r.json());
        setBuild(d);
        // Dừng poll khi build kết thúc VÀ item đã tạo xong (hoặc lỗi hẳn).
        if (d.state === "failed" || (d.state === "done" && d.itemId)) {
          stopped = true;
          clearInterval(t);
          loadJobs();
        }
      } catch {}
    };
    tick();
    return () => { stopped = true; clearInterval(t); };
  }, [slug]);
  // Bước 1: post + clip (chạy ngay, vài phút). Bước 2: enqueue build video dọc.
  async function runPost(): Promise<boolean> {
    setPostRunning(true);
    setPostResult(null);
    try {
      const r = await fetch("/api/edit/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "post", url }),
      });
      const d: PostResult = await r.json();
      setPostResult(d);
      if (!r.ok) { setErr(d.error || "Tạo post lỗi"); return false; }
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setPostRunning(false);
    }
  }

  async function runBuild(): Promise<void> {
    setBuildStarting(true);
    try {
      const r = await fetch("/api/edit/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", url, groupUrl, groupName }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Enqueue build lỗi"); return; }
      setBuild(null);
      setSlug(d.slug);
      loadJobs();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBuildStarting(false);
    }
  }

  async function runBoth() {
    setErr("");
    // Post trước (theo flow đã chốt), build enqueue ngay sau — 2 việc không đụng nhau:
    // post dùng claude.ts trực tiếp, build xếp hàng queue riêng.
    const ok = await runPost();
    if (ok) await runBuild();
  }

  const running = postRunning || buildStarting;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-ink mb-1">YouTube → post + video tóm tắt</h1>
      <p className="text-sm text-muted mb-6">
        Dán link video YouTube dài. App tạo 2 thứ: bài post LinkedIn/Threads kèm clip cắt từ video
        (draft chờ duyệt), và video dọc tóm tắt motion graphics xen đoạn thao tác (item short chờ duyệt).
      </p>

      <div className="card p-5 flex flex-col gap-4">
        <label className="text-sm font-medium text-ink flex flex-col gap-1">
          Link YouTube
          <input
            className="border border-line rounded-lg px-3 py-2 text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>

        <div className="flex gap-3">
          <label className="text-sm font-medium text-ink flex flex-col gap-1 flex-1">
            Group CTA
            <input
              className="border border-line rounded-lg px-3 py-2 text-sm"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-ink flex flex-col gap-1 flex-[2]">
            Link group
            <input
              className="border border-line rounded-lg px-3 py-2 text-sm"
              value={groupUrl}
              onChange={(e) => setGroupUrl(e.target.value)}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-primary" disabled={running || !url.trim()} onClick={runBoth}>
            {postRunning ? "Đang viết post + cắt clip…" : buildStarting ? "Đang xếp hàng build…" : "Chạy cả 2"}
          </button>
          <button className="btn btn-ghost" disabled={running || !url.trim()} onClick={() => { setErr(""); runPost(); }}>
            Chỉ tạo post
          </button>
          <button className="btn btn-ghost" disabled={running || !url.trim()} onClick={() => { setErr(""); runBuild(); }}>
            Chỉ build video
          </button>
        </div>
        {postRunning && (
          <div className="text-xs text-muted">
            AI đang đọc transcript, viết post và chọn đoạn cắt (2-5 phút). Giữ tab này mở.
          </div>
        )}
        {err && <div className="text-xs text-red-600">{err}</div>}
      </div>

      {/* Kết quả post */}
      {postResult?.item && (
        <div className="card p-5 mt-4 flex flex-col gap-2">
          <div className="text-sm font-medium text-ink">✓ Post LinkedIn/Threads (draft)</div>
          <a className="text-sm text-brand underline" href={`/item?id=${encodeURIComponent(postResult.item.id)}`}>
            {postResult.item.topic || postResult.item.id}
          </a>
          {postResult.clip && (
            <div className="text-xs text-muted">
              Clip {fmtTime(postResult.clip.start)} → {fmtTime(postResult.clip.end)}
              {postResult.clip.reason ? ` — ${postResult.clip.reason}` : ""}
            </div>
          )}
          {postResult.clipFile && (
            <video
              className="w-full rounded-lg bg-black"
              controls
              preload="metadata"
              src={`/api/media?id=${encodeURIComponent(postResult.item.id)}&file=${encodeURIComponent(baseName(postResult.clipFile))}#t=0.1`}
            />
          )}
          {postResult.clipError && (
            <div className="text-xs text-red-600">Clip lỗi: {postResult.clipError} (post vẫn lưu, gắn media tay)</div>
          )}
        </div>
      )}

      {/* Trạng thái build video dọc */}
      {slug && (
        <div className="card p-5 mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-ink">{slug}</span>
            <span className={
              build?.state === "done" ? "text-green-600" :
              build?.state === "failed" ? "text-red-600" : "text-amber-600"
            }>
              {!build || build.state === "queued" ? "⏸ chờ tới lượt (chung queue daily-news)" :
               build.state === "running" ? "⏳ đang dựng + render (~15-25 phút)…" :
               build.state === "done" ? "✓ xong" : "✗ lỗi"}
            </span>
          </div>
          {build?.failReason && (
            <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded-lg p-2">{build.failReason}</div>
          )}
          {build?.itemError && (
            <div className="text-xs text-red-600">Tạo item short lỗi: {build.itemError}</div>
          )}
          {build?.itemId && (
            <a className="text-sm text-brand underline" href={`/item?id=${encodeURIComponent(build.itemId)}`}>
              → Item short chờ duyệt: {build.itemId}
            </a>
          )}
          {build?.hasVideo && (
            <video
              key={slug}
              className="w-[260px] max-w-full rounded-lg bg-black self-start"
              controls
              preload="metadata"
              src={`/api/edit/daily-news/media?slug=${slug}#t=0.1`}
            />
          )}
          <details>
            <summary className="text-xs text-muted cursor-pointer">Log agent</summary>
            <pre className="text-xs bg-black/90 text-green-200 rounded-lg p-3 mt-2 overflow-auto max-h-64 whitespace-pre-wrap">
              {build?.logTail || "(chưa có log)"}
            </pre>
          </details>
        </div>
      )}

      {/* Job gần đây */}
      {jobs.length > 0 && (
        <div className="card p-5 mt-4">
          <div className="text-sm font-medium text-ink mb-2">Build gần đây</div>
          <div className="flex flex-col gap-1">
            {jobs.map((j) => (
              <button
                key={j.slug}
                className="text-left text-xs text-muted hover:text-ink flex items-center gap-2"
                onClick={() => { setBuild(null); setSlug(j.slug); }}
              >
                <span className="font-mono">{j.slug}</span>
                <span className={
                  j.state === "done" ? "text-green-600" :
                  j.state === "failed" ? "text-red-600" :
                  j.state === "running" ? "text-amber-600" : "text-muted"
                }>{j.state}</span>
                <span className="truncate max-w-[280px]">{j.topic}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
