"use client";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_COMMENT_REPLY } from "@/lib/comment-automation-defaults";
import { deriveKeyword, isValidKeyword, KEYWORD_MAX } from "@/lib/daily-news-keyword";

type JobState = "queued" | "running" | "done" | "published" | "failed";
type Job = {
  slug: string;
  topic: string;
  keyword: string;
  state: JobState;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  publishedAt?: number;
};
type Status = { jobs: Job[] };
type AutoDm = { link: string; keyword: string };
type Build = {
  slug: string;
  state: JobState;
  logTail: string;
  hasVideo: boolean;
  caption: string | null;
  failReason: string | null;
  topic: string;
  keyword: string;
  publishedAt: number | null;
};

const STATE_LABEL: Record<JobState, string> = {
  queued: "chờ", running: "đang chạy", done: "chưa đăng", published: "đã đăng", failed: "lỗi",
};
const STATE_CLASS: Record<JobState, string> = {
  queued: "text-muted", running: "text-amber-600", done: "text-green-600", published: "text-muted", failed: "text-red-600",
};

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function jobTitle(j: Job): string {
  const line = (j.topic || "").trim().split(/\r?\n/)[0];
  if (!line) return j.slug;
  return line.length > 64 ? `${line.slice(0, 64)}…` : line;
}

function elapsed(j: Job): string {
  if (!j.startedAt) return "";
  const sec = Math.max(0, Math.round(((j.endedAt || Date.now()) - j.startedAt) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

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
  const [keyword, setKeyword] = useState("");
  const [keywordTouched, setKeywordTouched] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);

  // publish state
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["instagram", "facebook", "youtube"]);
  const [schedule, setSchedule] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string>("");
  const [genningCaption, setGenningCaption] = useState(false);
  const [marking, setMarking] = useState(false);

  // auto comment-to-DM (facebook/instagram): rút link GitHub + keyword từ topic gốc
  const [autoDm, setAutoDm] = useState<AutoDm | null>(null);
  const [autoDmEnabled, setAutoDmEnabled] = useState(true);
  const [autoDmKeyword, setAutoDmKeyword] = useState("");
  const [autoDmMessage, setAutoDmMessage] = useState("");
  const [autoDmReply, setAutoDmReply] = useState(DEFAULT_COMMENT_REPLY);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCapRef = useRef<string | null>(null);
  const autoDmRef = useRef<string | null>(null);

  async function loadJobs() {
    try {
      const d: Status = await fetch("/api/edit/daily-news").then((r) => r.json());
      setStatus(d);
      setJobs(d.jobs || []);
    } catch {
      setStatus(null);
    }
  }

  // Poll danh sách khi còn job chờ/đang chạy. Mỗi lần GET server cũng tick hàng đợi,
  // nên job kế tự khởi động kể cả sau khi restart server.
  const hasActive = jobs.some((j) => j.state === "queued" || j.state === "running");
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(loadJobs, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive]);

  useEffect(() => {
    loadJobs();
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
        if (b.state !== "running" && b.state !== "queued" && pollRef.current) {
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

  // Video xong → rút link GitHub + keyword từ topic gốc 1 lần cho slug này (deterministic, không AI).
  useEffect(() => {
    if (build?.hasVideo && slug && autoDmRef.current !== slug) {
      autoDmRef.current = slug;
      fetch("/api/edit/daily-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "autodm", slug }),
      })
        .then((r) => r.json())
        .then((d) => {
          const found: AutoDm | null = d.autoDm || null;
          setAutoDm(found);
          if (found) {
            setAutoDmKeyword(found.keyword);
            setAutoDmMessage(`Mình gửi link nha: ${found.link}`);
          }
        })
        .catch(() => setAutoDm(null));
    }
  }, [build?.hasVideo, slug]);

  // Bắn job xong KHÔNG đụng panel đang xem: gõ topic kế tiếp được ngay, job cũ vẫn theo dõi được.
  async function startBuild() {
    setErr(""); setStarting(true);
    try {
      const res = await fetch("/api/edit/daily-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", info, keyword }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Lỗi không rõ"); return; }
      setInfo(""); setKeyword(""); setKeywordTouched(false);
      await loadJobs();
    } catch (e) { setErr((e as Error).message); }
    finally { setStarting(false); }
  }

  // Keyword hiện TRÊN MÀN HÌNH trong scene CTA nên phải chốt trước khi render.
  // Prefill từ tên repo, Thanh sửa tay là ngừng ghi đè.
  function onInfoChange(v: string) {
    setInfo(v);
    if (!keywordTouched) setKeyword(deriveKeyword(v));
  }

  function togglePlatform(p: string) {
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function doPublish() {
    if (!slug) return;
    setPublishing(true); setPublishResult("");
    try {
      const scheduledTime = schedule ? new Date(schedule).toISOString() : undefined;
      const canAutoDm = autoDmEnabled && !!autoDm && (platforms.includes("facebook") || platforms.includes("instagram") || platforms.includes("youtube"));
      const res = await fetch("/api/edit/daily-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          slug,
          caption,
          platforms,
          scheduledTime,
          playlistId: platforms.includes("youtube") ? playlistId : "",
          autoDm: canAutoDm
            ? { keyword: autoDmKeyword, link: autoDm!.link, dmMessage: autoDmMessage, commentReply: autoDmReply }
            : undefined,
        }),
      });
      const data = await res.json();
      setPublishResult(data.error ? `Lỗi: ${data.error}` : JSON.stringify(data.result, null, 2));
      // Server đã ghi publishedAt nếu có nền tảng nhận bài → tải lại để dòng nhảy sang "đã đăng".
      await Promise.all([loadJobs(), reloadBuild()]);
    } catch (e) { setPublishResult(`Lỗi: ${(e as Error).message}`); }
    finally { setPublishing(false); }
  }

  async function reloadBuild() {
    if (!slug) return;
    try {
      const b: Build = await fetch(`/api/edit/daily-news?slug=${slug}`).then((r) => r.json());
      setBuild(b);
    } catch {}
  }

  // Đánh dấu tay: video đã đăng ngoài app, hoặc bỏ đánh dấu khi bấm nhầm.
  async function doMark(published: boolean) {
    if (!slug || marking) return;
    setMarking(true); setErr("");
    try {
      const res = await fetch("/api/edit/daily-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", slug, published }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Đánh dấu lỗi"); return; }
      await Promise.all([loadJobs(), reloadBuild()]);
    } catch (e) { setErr((e as Error).message); }
    finally { setMarking(false); }
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
    setAutoDm(null); setAutoDmKeyword(""); setAutoDmMessage(""); setAutoDmReply(DEFAULT_COMMENT_REPLY);
    autoCapRef.current = null;
    autoDmRef.current = null;
    setSlug(p);
  }

  const keywordBad = !!keyword && !isValidKeyword(keyword);
  const pendingJobs = jobs.filter((j) => j.state !== "published");
  const publishedJobs = jobs.filter((j) => j.state === "published");

  const renderJob = (j: Job) => (
    <li key={j.slug}>
      <button
        type="button"
        onClick={() => openProject(j.slug)}
        className={`w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5 ${j.slug === slug ? "bg-black/5" : ""}`}
      >
        <span className={`text-xs shrink-0 w-16 ${STATE_CLASS[j.state]}`}>{STATE_LABEL[j.state]}</span>
        <span className="text-xs text-ink truncate flex-1">{jobTitle(j)}</span>
        {j.keyword && <span className="text-xs text-muted font-mono shrink-0">{j.keyword}</span>}
        <span className="text-xs text-muted font-mono shrink-0 w-12 text-right">
          {j.state === "published" && j.publishedAt ? fmtTime(j.publishedAt) : elapsed(j)}
        </span>
      </button>
    </li>
  );

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
            value={info} onChange={(e) => onInfoChange(e.target.value)}
            placeholder="Dán thông tin về 1 tool/repo/tin AI... Agent sẽ tự viết script + dựng video."
          />
        </label>

        <label className="text-sm font-medium text-ink flex flex-col gap-1">
          Keyword comment
          <input
            className="border border-line rounded-lg px-3 py-2 text-sm font-mono self-start w-56"
            value={keyword}
            onChange={(e) => { setKeywordTouched(true); setKeyword(e.target.value.trim().toLowerCase()); }}
            placeholder="vd: godeye"
          />
          <span className={`text-xs font-normal ${keywordBad ? "text-red-600" : "text-muted"}`}>
            {keywordBad
              ? `Chỉ chữ thường + số, 2-${KEYWORD_MAX} ký tự, không dấu gạch.`
              : keyword
                ? `Video sẽ hiện "Comment ${keyword}" và giọng đọc nhắc từ này. Rule comment-to-DM lúc đăng dùng đúng nó.`
                : "Để trống nếu không có gì gửi qua DM. CTA cuối video quay về bản chỉ nhắc theo dõi."}
          </span>
        </label>

        <button className="btn btn-primary self-start" disabled={starting || !info.trim() || keywordBad} onClick={startBuild}>
          {starting ? "Đang xếp hàng…" : "Tạo video"}
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
              {build.state === "queued" ? "⏸ chờ tới lượt" :
               build.state === "running" ? "⏳ đang dựng + render (~15 phút)…" :
               build.state === "done" ? "✓ xong, chưa đăng" :
               build.state === "published" ? `✓ đã đăng ${build.publishedAt ? fmtTime(build.publishedAt) : ""}` : "✗ lỗi"}
            </span>
            {build.keyword && <span className="text-xs text-muted font-mono">comment {build.keyword}</span>}
          </div>
          {build.failReason && (
            <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded-lg p-2">{build.failReason}</div>
          )}
          <details>
            <summary className="text-xs text-muted cursor-pointer">Log agent</summary>
            <pre className="text-xs bg-black/90 text-green-200 rounded-lg p-3 mt-2 overflow-auto max-h-64 whitespace-pre-wrap">
              {build.logTail || "(chưa có log)"}
            </pre>
          </details>
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

          {autoDm && (platforms.includes("facebook") || platforms.includes("instagram") || platforms.includes("youtube")) ? (
            <div className="flex flex-col gap-2 border border-line rounded-lg p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <input type="checkbox" checked={autoDmEnabled} onChange={(e) => setAutoDmEnabled(e.target.checked)} />
                Tự tạo comment-to-DM + reply YouTube khi đăng
              </label>
              <p className="text-xs text-muted">
                Link GitHub rút từ topic: <span className="font-mono">{autoDm.link}</span>. FB/IG: comment đúng keyword được nhắn riêng link này. YouTube: reply công khai chỉ đường search Google (YouTube chặn link trong comment).
              </p>
              <label className="text-xs text-ink flex flex-col gap-1">
                Keyword
                <input className="border border-line rounded-lg px-3 py-2 text-sm" disabled={!autoDmEnabled}
                  value={autoDmKeyword} onChange={(e) => setAutoDmKeyword(e.target.value)} />
              </label>
              <label className="text-xs text-ink flex flex-col gap-1">
                DM message
                <textarea className="border border-line rounded-lg px-3 py-2 text-sm min-h-[60px]" disabled={!autoDmEnabled}
                  value={autoDmMessage} onChange={(e) => setAutoDmMessage(e.target.value)} />
              </label>
              <label className="text-xs text-ink flex flex-col gap-1">
                Reply công khai
                <input className="border border-line rounded-lg px-3 py-2 text-sm" disabled={!autoDmEnabled}
                  value={autoDmReply} onChange={(e) => setAutoDmReply(e.target.value)} />
              </label>
              {schedule && (
                <p className="text-xs text-amber-600">Bài hẹn lịch: automation KHÔNG tự tạo lúc bấm nút, tự vào /comment-to-dm tạo sau khi bài lên sóng.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">Không thấy link GitHub trong topic gốc, bỏ qua auto comment-to-DM.</p>
          )}

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

          <div className="flex items-center gap-3">
            <button className="btn btn-primary" disabled={publishing || !caption.trim() || platforms.length === 0} onClick={doPublish}>
              {publishing ? "Đang đăng…" : schedule ? "Hẹn lịch đăng" : "Đăng ngay"}
            </button>
            {build.state === "published" ? (
              <button type="button" className="btn btn-ghost" disabled={marking} onClick={() => doMark(false)}>
                Bỏ đánh dấu đã đăng
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" disabled={marking} onClick={() => doMark(true)}>
                Đánh dấu đã đăng (không đăng)
              </button>
            )}
          </div>
          {publishResult && (
            <pre className="text-xs card p-3 overflow-auto max-h-64 whitespace-pre-wrap">{publishResult}</pre>
          )}
        </div>
      )}

      {/* Hàng đợi job */}
      <div className="card p-5 mt-4 flex flex-col gap-3">
        <div className="text-sm font-medium text-ink">Hàng đợi</div>
        {!status ? (
          <div className="text-xs text-muted">Đang tải…</div>
        ) : jobs.length === 0 ? (
          <div className="text-xs text-muted">Chưa có job nào.</div>
        ) : (
          <>
            {pendingJobs.length === 0 ? (
              <div className="text-xs text-muted">Không còn video nào chờ đăng.</div>
            ) : (
              <ul className="flex flex-col gap-0.5">{pendingJobs.map(renderJob)}</ul>
            )}
            {publishedJobs.length > 0 && (
              <details className="mt-1">
                <summary className="text-xs text-muted cursor-pointer">Đã đăng ({publishedJobs.length})</summary>
                <ul className="flex flex-col gap-0.5 mt-1">{publishedJobs.map(renderJob)}</ul>
              </details>
            )}
          </>
        )}
        <p className="text-xs text-muted">
          Chạy tuần tự 1 video/lần: hai agent headless cùng lúc sẽ đá nhau khỏi phiên đăng nhập.
          Video &quot;chưa đăng&quot; nằm lại đây tới khi đăng qua app hoặc bấm &quot;Đánh dấu đã đăng&quot;.
        </p>
      </div>
    </div>
  );
}
