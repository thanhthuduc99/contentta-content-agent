"use client";
import { useEffect, useRef, useState } from "react";

type Status = { runbookPath: string; recentProjects: string[] };
type Build = {
  slug: string;
  state: "running" | "done" | "failed";
  logTail: string;
  hasVideo: boolean;
  caption: string | null;
};

const PLATFORMS = ["instagram", "facebook", "youtube", "tiktok"] as const;
const DAILY_NEWS_PLAYLIST = "ai daily news";

type Playlist = { id: string; title: string; privacy?: string };

export default function EditDailyNewsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [info, setInfo] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [build, setBuild] = useState<Build | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");

  // publish state
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["instagram", "facebook", "youtube"]);
  const [schedule, setSchedule] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string>("");
  const [genningCaption, setGenningCaption] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCapRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/edit/daily-news").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
    fetch("/api/youtube-playlists")
      .then((r) => r.json())
      .then((d) => {
        const list: Playlist[] = d.playlists || [];
        setPlaylists(list);
        setPlaylistId(list.find((p) => p.title.toLowerCase() === DAILY_NEWS_PLAYLIST)?.id || "");
      })
      .catch(() => setPlaylists([]));
  }, []);

  // Poll trạng thái build khi có slug và chưa xong.
  useEffect(() => {
    if (!slug) return;
    const tick = async () => {
      try {
        const b: Build = await fetch(`/api/edit/daily-news?slug=${slug}`).then((r) => r.json());
        setBuild(b);
        if (b.caption && !caption) setCaption(b.caption);
        if (b.state !== "running" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {}
    };
    tick();
    pollRef.current = setInterval(tick, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Video xong mà caption trống → tự sinh caption (AI) 1 lần cho slug này.
  useEffect(() => {
    if (build?.hasVideo && slug && !caption.trim() && autoCapRef.current !== slug && !genningCaption) {
      autoCapRef.current = slug;
      doGenCaption(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build?.hasVideo, slug]);

  async function startBuild() {
    setErr(""); setStarting(true); setBuild(null); setPublishResult(""); setCaption("");
    try {
      const res = await fetch("/api/edit/daily-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", info }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Lỗi không rõ"); return; }
      setSlug(data.slug);
    } catch (e) { setErr((e as Error).message); }
    finally { setStarting(false); }
  }

  function togglePlatform(p: string) {
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function doPublish() {
    if (!slug) return;
    setPublishing(true); setPublishResult("");
    try {
      const scheduledTime = schedule ? new Date(schedule).toISOString() : undefined;
      const res = await fetch("/api/edit/daily-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          slug,
          caption,
          platforms,
          scheduledTime,
          playlistId: platforms.includes("youtube") ? playlistId : "",
        }),
      });
      const data = await res.json();
      setPublishResult(data.error ? `Lỗi: ${data.error}` : JSON.stringify(data.result, null, 2));
    } catch (e) { setPublishResult(`Lỗi: ${(e as Error).message}`); }
    finally { setPublishing(false); }
  }

  async function doGenCaption(auto = false) {
    if (!slug || genningCaption) return;
    setGenningCaption(true);
    if (!auto) setErr("");
    try {
      const res = await fetch("/api/edit/daily-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "caption", slug }),
      });
      const data = await res.json();
      if (res.ok && data.caption) setCaption(data.caption);
      else if (!auto) setErr(data.error || "Sinh caption lỗi");
    } catch (e) { if (!auto) setErr((e as Error).message); }
    finally { setGenningCaption(false); }
  }

  function openProject(p: string) {
    if (p === slug) return;
    setBuild(null); setCaption(""); setPublishResult(""); setErr("");
    autoCapRef.current = null;
    setSlug(p);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-ink mb-1">Edit daily news</h1>
      <p className="text-sm text-muted mb-6">
        Gửi topic/nội dung → agent tự viết script, dựng video no-face dọc brand Contentta, render.
        Xong thì preview + đăng thẳng lên IG/FB/YouTube (có thể hẹn lịch).
      </p>

      {/* Form tạo */}
      <div className="card p-5 flex flex-col gap-4">
        <label className="text-sm font-medium text-ink flex flex-col gap-1">
          Topic / nội dung nguồn
          <textarea
            className="border border-line rounded-lg px-3 py-2 text-sm min-h-[120px]"
            value={info} onChange={(e) => setInfo(e.target.value)}
            placeholder="Dán thông tin về 1 tool/repo/tin AI... Agent sẽ tự viết script + dựng video."
          />
        </label>
        <button className="btn btn-primary self-start" disabled={starting || !info.trim()} onClick={startBuild}>
          {starting ? "Đang khởi động…" : "Tạo video"}
        </button>
        {err && <div className="text-xs text-red-600">{err}</div>}
      </div>

      {/* Trạng thái build */}
      {slug && build && (
        <div className="card p-5 mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-ink">{slug}</span>
            <span className={
              build.state === "done" ? "text-green-600" :
              build.state === "failed" ? "text-red-600" : "text-amber-600"
            }>
              {build.state === "running" ? "⏳ đang dựng + render (~15 phút)…" :
               build.state === "done" ? "✓ xong" : "✗ lỗi"}
            </span>
          </div>
          <pre className="text-xs bg-black/90 text-green-200 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">
            {build.logTail || "(chưa có log)"}
          </pre>
        </div>
      )}

      {/* Preview + đăng */}
      {build?.hasVideo && (
        <div className="card p-5 mt-4 flex flex-col gap-4">
          <video className="w-full rounded-lg bg-black" controls src={`/api/edit/daily-news/media?slug=${slug}`} />

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Caption đăng</span>
              <button type="button" className="btn btn-ghost" disabled={genningCaption} onClick={() => doGenCaption(false)}>
                {genningCaption ? "Đang sinh…" : "Tạo caption (AI)"}
              </button>
            </div>
            <textarea className="border border-line rounded-lg px-3 py-2 text-sm min-h-[100px]"
              value={caption} onChange={(e) => setCaption(e.target.value)}
              placeholder={genningCaption ? "AI đang viết caption…" : "Tự sinh khi video xong, sửa lại được"} />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">Nền tảng</span>
            <div className="flex flex-wrap gap-3 text-sm">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <label className="text-sm font-medium text-ink flex flex-col gap-1">
            Playlist YouTube
            <select
              className="border border-line rounded-lg px-3 py-2 text-sm"
              value={playlistId}
              disabled={!platforms.includes("youtube")}
              onChange={(e) => setPlaylistId(e.target.value)}
            >
              <option value="">(không thêm vào playlist)</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} {p.privacy === "private" ? "(private)" : ""}
                </option>
              ))}
            </select>
            {playlists.length > 0 && !playlists.some((p) => p.title.toLowerCase() === DAILY_NEWS_PLAYLIST) && (
              <span className="text-xs text-muted font-normal">
                Kênh chưa có playlist &quot;AI daily news&quot;. Tạo trên YouTube Studio rồi tải lại trang.
              </span>
            )}
          </label>

          <label className="text-sm font-medium text-ink flex flex-col gap-1">
            Hẹn lịch (để trống = đăng ngay)
            <input type="datetime-local" className="border border-line rounded-lg px-3 py-2 text-sm self-start"
              value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </label>

          <button className="btn btn-primary self-start" disabled={publishing || !caption.trim() || platforms.length === 0} onClick={doPublish}>
            {publishing ? "Đang đăng…" : schedule ? "Hẹn lịch đăng" : "Đăng ngay"}
          </button>
          {publishResult && (
            <pre className="text-xs card p-3 overflow-auto max-h-64 whitespace-pre-wrap">{publishResult}</pre>
          )}
        </div>
      )}

      {/* Trạng thái chung */}
      <div className="card p-5 mt-4 flex flex-col gap-3">
        <div className="text-sm font-medium text-ink">Project gần nhất</div>
        {!status ? (
          <div className="text-xs text-muted">Đang tải…</div>
        ) : status.recentProjects.length === 0 ? (
          <div className="text-xs text-muted">Chưa có project nào.</div>
        ) : (
          <>
            <ul className="text-xs flex flex-col gap-1 items-start">
              {status.recentProjects.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className={`font-mono hover:underline ${p === slug ? "text-ink font-semibold" : "text-brand"}`}
                    onClick={() => openProject(p)}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Bấm 1 project để mở lại video + caption và đăng.</p>
          </>
        )}
      </div>
    </div>
  );
}
