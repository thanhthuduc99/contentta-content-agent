import "./env";
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { zernioPublish, type Platform } from "./zernio-publish";
import { generateVideoCaption } from "./claude";
import { mediaDirFor, REPO_ROOT } from "./paths";

// Tính năng edit daily-news là tuỳ chọn và cần một project edit-agent riêng.
// Cấu hình DAILY_NEWS_DIR trong .env để bật đúng workspace của bạn.
export const DAILY_NEWS_DIR = (process.env.DAILY_NEWS_DIR || "").trim()
  ? path.resolve(process.env.DAILY_NEWS_DIR!)
  : path.join(REPO_ROOT, "edit-agent", "sandbox", "contentta-daily-ai-news");

export type EditRunResult = { ok: boolean; log: string; code: number | null };

// Whitelist strict — slug chỉ chữ-số-gạch, không cho path traversal hay ký tự shell đặc biệt.
const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export class InvalidEditParamError extends Error {}

function assertSlug(v: string, field: string): string {
  if (!SAFE_SLUG_RE.test(v)) throw new InvalidEditParamError(`${field} không hợp lệ (chỉ chữ/số/-/_ tối đa 64 ký tự)`);
  return v;
}

// Edit daily news — KHÔNG phải 1 script đơn: đây là runbook nhiều bước cần lý luận
// (chọn topic, viết script, dựng scene, commit git) — xem AGENT-RUNBOOK.md trong DAILY_NEWS_DIR.
// Pipeline này chạy dưới dạng Claude Code remote routine theo lịch (cấu hình riêng, ngoài
// phạm vi web app). KHÔNG expose nút "chạy" trên web app công khai/chưa xác thực — routine
// cần quyền Bash + WebFetch, cấp quyền đó cho 1 route public là rủi ro RCE thật.
// Trang /edit/daily-news trong app chỉ hiển thị trạng thái/lịch sử, KHÔNG có hành động thực thi.
export async function getDailyNewsStatus(): Promise<{
  runbookPath: string;
  recentProjects: string[];
}> {
  const fs = await import("node:fs/promises");
  let recentProjects: string[] = [];
  try {
    const entries = await fs.readdir(path.join(DAILY_NEWS_DIR, "video-projects"), { withFileTypes: true });
    recentProjects = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .slice(-10)
      .reverse();
  } catch {
    recentProjects = [];
  }
  return {
    runbookPath: path.join(DAILY_NEWS_DIR, "AGENT-RUNBOOK.md"),
    recentProjects,
  };
}

// ============================================================================
// Edit daily news — TỰ ĐỘNG build video no-face từ topic user gửi + đăng Blotato.
// Bật bằng env DAILY_NEWS_BUILD_ENABLED=1. Spawn Claude Code headless (detached),
// render chạy nền ~15 phút → page poll trạng thái qua getDailyNewsBuild.
// ============================================================================

// Nhạc licensed của user — mọi build daily-news dùng track này (KHÔNG dùng nhạc khác).
const MUSIC_TRACK = (process.env.DAILY_NEWS_MUSIC_PATH || "").trim()
  ? path.resolve(process.env.DAILY_NEWS_MUSIC_PATH!)
  : path.join(DAILY_NEWS_DIR, "assets", "music", "trailer.mp3");
const DN_PROJECTS = path.join(DAILY_NEWS_DIR, "video-projects");
const DN_BUILD_TIMEOUT_MS = 25 * 60_000;

function dnProjectDir(slug: string): string {
  return path.join(DN_PROJECTS, slug);
}

// Prompt cho headless agent — encode toàn bộ recipe no-face đã dùng (junction/GLM/…).
function buildDailyNewsPrompt(info: string, slug: string): string {
  return `Bạn là editor Contentta, chạy HEADLESS (không có người trả lời). TUYỆT ĐỐI KHÔNG hỏi lại — tự quyết mọi thứ và chạy tới khi ra final.mp4. Không dừng giữa chừng.

NHIỆM VỤ: từ INFO dưới đây, làm 1 video short NO-FACE DỌC 1080x1920 brand Contentta (55-62 giây, KHÔNG vượt 65s), lưu vào video-projects/${slug}/renders/final.mp4.

INFO NGUỒN (chủ đề/nội dung user gửi):
"""
${info}
"""

CWD hiện tại = repo daily (có node_modules, tools/, .env OPENAI_API_KEY, hyperframes CLI).

CÁC BƯỚC:
1. Scaffold: cp -r contentta-shorts-skill/video-projects/opus-48-daily-khong-face video-projects/${slug}. Trong video-projects/${slug}: xoá file động cũ (assets/voice*, assets/transcript-final.json*, assets/vo-script*, assets/replacements.json, compositions/scene*.html, compositions/captions.html, renders/*). GIỮ compositions/ambient-bg.html + grain-overlay.html, assets/vendor/gsap.min.js, assets/brand-tokens.contentta.css, meta.json, hyperframes.json.
   Copy nhạc licensed (BẮT BUỘC, KHÔNG dùng nhạc khác): cp "${MUSIC_TRACK}" video-projects/${slug}/assets/music.mp3
2. Viết 2 file script TỪ INFO: assets/vo-script.txt (phiên âm tên riêng để TTS đọc đúng: vd Claude Code->"Cờ lo Cốt", GitHub->"Gít Hấp", Contentta->"Còn Ten Ta"; GIỮ "AI") + assets/vo-script-display.txt (tên thật cho caption). ~150-190 từ ~ 50-60s. Hook 3s đầu tạo tension (số shock/mâu thuẫn), KHÔNG mở bằng "Hôm nay...". Thuần Việt, casual câu ngắn. CHỈ dùng số liệu CÓ trong INFO — KHÔNG bịa số.
3. TTS: cd video-projects/${slug}/assets && node "${path.join(DAILY_NEWS_DIR, "tools", "tts-openai.mjs")}" (giọng onyx). Check voice.mp3 ≤65s (dùng ffmpeg-static).
4. Transcribe: từ video-projects/${slug} chạy node "${path.join(DAILY_NEWS_DIR, "tools", "transcribe-openai.mjs")}" assets/voice.mp3.
5. Caption: đọc transcript-final.json, viết assets/replacements.json map chuỗi Whisper nghe SAI -> TÊN THẬT; node "${path.join(DAILY_NEWS_DIR, "contentta-shorts-skill", "scripts", "generate-captions.mjs")}" assets/transcript-final.json compositions/captions.html assets/replacements.json. Grep verify caption hiện TÊN THẬT, KHÔNG leak phiên âm. (captions.html có thể load gsap CDN — đổi sang assets/vendor/gsap.min.js nếu cần render offline.)
6. Build 4-6 scene HTML brand Contentta, tham chiếu style ở contentta-shorts-skill/video-projects/opus-48-daily-khong-face/compositions/scene1-hook.html + scene8-cta.html: hook -> các ý chính -> CTA "CONTENTTA / DAILY AI NEWS". Cosmic Red #E10E1F emphasis, Deep Space #070409 bg, Stardust #FAF7F5 text, Be Vietnam Pro 800, JetBrains Mono cho số/code. Scoped selector [data-composition-id=...]; gsap timeline paused -> window.__timelines; tl.set({},{},DUR) pad; finite repeat (KHÔNG -1); KHÔNG Date.now/Math.random; <script src="assets/vendor/gsap.min.js">.
7. index.html (cấu trúc như opus-48/index.html): track ambient 0, scenes 2 (tuần tự, shave 0.02 tránh float overlap), captions 3, voice(<audio>) 4 vol 1, music(<audio>) 5 vol 0.14, grain 99. Tổng data-duration = duration transcript (+~0.1). Cập nhật data-duration + const TOTAL/tl.set của ambient-bg.html & grain-overlay.html cho khớp.
8. cd video-projects/${slug} && npx hyperframes lint (phải 0 error) -> npx hyperframes render --quality standard --gpu --browser-gpu --output renders/final.mp4.
9. Viết video-projects/${slug}/assets/caption.txt: caption đăng social (hook + tóm tắt + "Theo dõi Contentta...") + TỐI ĐA 5 hashtag. DÒNG ĐẦU = tiêu đề ngắn (dùng cho YouTube).
10. Verify: extract vài frame bằng ffmpeg, đảm bảo brand đúng + caption tên thật + no-face. Nếu lỗi nặng -> fix -> re-render.

Khi xong, in DÒNG CUỐI: "DONE video-projects/${slug}/renders/final.mp4".`;
}

const SAFE_INFO_MAX = 4000;
export function assertInfo(v: string): string {
  const t = (v || "").trim();
  if (!t) throw new InvalidEditParamError("thiếu nội dung (info)");
  if (t.length > SAFE_INFO_MAX) throw new InvalidEditParamError(`info quá dài (tối đa ${SAFE_INFO_MAX} ký tự)`);
  return t;
}

// Spawn headless build detached, log ra build.log. Trả về ngay (không await render).
export async function startDailyNewsBuild(info: string, slug: string): Promise<{ slug: string }> {
  if ((process.env.DAILY_NEWS_BUILD_ENABLED || "").trim() !== "1") {
    throw new InvalidEditParamError("Tính năng build daily-news đang TẮT. Đặt DAILY_NEWS_BUILD_ENABLED=1 trong web/.env để bật.");
  }
  assertSlug(slug, "slug");
  const cleanInfo = assertInfo(info);
  const projDir = dnProjectDir(slug);
  await fs.mkdir(projDir, { recursive: true });
  const logPath = path.join(projDir, "build.log");
  await fs.writeFile(logPath, `[start ${new Date().toISOString()}] slug=${slug}\n`, "utf8");

  const prompt = buildDailyNewsPrompt(cleanInfo, slug);
  // KHÔNG dùng fd + detached: trên Windows (shell:true → cmd.exe) file descriptor không truyền
  // tới process claude khi detached → log rỗng, agent không chạy, build treo tới timeout ("lỗi").
  // Dùng pipe + event handler ghi log; child gắn theo vòng đời server (đủ cho tool local).
  const child = spawn(
    "claude",
    ["-p", "--permission-mode", "bypassPermissions", "--output-format", "stream-json", "--verbose",
     "--add-dir", DAILY_NEWS_DIR],
    { cwd: DAILY_NEWS_DIR, shell: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"] }
  );
  child.stdout?.on("data", (d) => { try { fsSync.appendFileSync(logPath, d.toString()); } catch {} });
  child.stderr?.on("data", (d) => { try { fsSync.appendFileSync(logPath, d.toString()); } catch {} });
  child.on("error", (e) => { try { fsSync.appendFileSync(logPath, `\n[spawn error] ${e.message}\n`); } catch {} });
  child.stdin?.write(prompt);
  child.stdin?.end();
  return { slug };
}

export type DailyNewsBuild = {
  slug: string;
  state: "running" | "done" | "failed";
  logTail: string;
  hasVideo: boolean;
  caption: string | null;
};

export async function getDailyNewsBuild(slug: string): Promise<DailyNewsBuild> {
  assertSlug(slug, "slug");
  const projDir = dnProjectDir(slug);
  const logPath = path.join(projDir, "build.log");
  const videoPath = path.join(projDir, "renders", "final.mp4");
  const captionPath = path.join(projDir, "assets", "caption.txt");

  let log = "";
  try { log = await fs.readFile(logPath, "utf8"); } catch { log = ""; }
  const hasVideo = fsSync.existsSync(videoPath) && (() => { try { return fsSync.statSync(videoPath).size > 0; } catch { return false; } })();
  let caption: string | null = null;
  try { caption = (await fs.readFile(captionPath, "utf8")).trim(); } catch {}

  const startM = log.match(/\[start ([^\]]+)\]/);
  const elapsed = startM ? Date.now() - Date.parse(startM[1]) : 0;
  const fatal = /\[spawn error\]|Agent kết thúc: (error|error_max)/i.test(log);

  let state: DailyNewsBuild["state"] = "running";
  if (hasVideo) state = "done";
  else if (fatal || elapsed > DN_BUILD_TIMEOUT_MS) state = "failed";

  const logTail = log.split("\n").slice(-60).join("\n");
  return { slug, state, logTail, hasVideo, caption };
}

// Sinh caption đăng cho build daily-news từ script hiển thị (tên thật), ghi vào caption.txt.
export async function generateDailyNewsCaption(slug: string): Promise<string> {
  assertSlug(slug, "slug");
  const dir = dnProjectDir(slug);
  let script = "";
  for (const f of ["assets/vo-script-display.txt", "assets/vo-script.txt"]) {
    try {
      const t = (await fs.readFile(path.join(dir, f), "utf8")).trim();
      if (t) { script = t; break; }
    } catch {}
  }
  if (!script) throw new InvalidEditParamError("chưa có script để sinh caption");
  const caption = (await generateVideoCaption(script)).trim();
  if (!caption) throw new InvalidEditParamError("sinh caption rỗng");
  await fs.writeFile(path.join(dir, "assets", "caption.txt"), caption, "utf8");
  return caption;
}

// Copy final.mp4 vào MEDIA_DIR rồi đăng qua Zernio (Blotato đã ngưng dùng).
const ZERNIO_PLATFORMS: Platform[] = ["facebook", "instagram", "tiktok", "youtube", "linkedin"];

export async function publishDailyNews(params: {
  slug: string;
  caption: string;
  platforms?: string[];
  scheduledTime?: string;
  playlistId?: string;
}): Promise<Record<string, unknown>> {
  const slug = assertSlug(params.slug, "slug");
  const caption = (params.caption || "").trim();
  if (!caption) throw new InvalidEditParamError("thiếu caption");
  const src = path.join(dnProjectDir(slug), "renders", "final.mp4");
  if (!fsSync.existsSync(src)) throw new InvalidEditParamError("chưa có final.mp4 để đăng");
  const dstDir = mediaDirFor(slug);
  await fs.mkdir(dstDir, { recursive: true });
  const dst = path.join(dstDir, "final.mp4");
  await fs.copyFile(src, dst);
  // Lọc bỏ platform Zernio không hỗ trợ (vd threads). Mặc định Facebook.
  const plats = (params.platforms || ["facebook"]).filter(
    (p): p is Platform => (ZERNIO_PLATFORMS as string[]).includes(p)
  );
  const playlistId = (params.playlistId || "").trim();
  if (playlistId && !/^[A-Za-z0-9_-]{10,64}$/.test(playlistId)) {
    throw new InvalidEditParamError("playlistId không hợp lệ");
  }
  return zernioPublish({
    mediaPaths: [dst],
    caption,
    platforms: plats.length ? plats : ["facebook"],
    scheduledTime: params.scheduledTime || undefined,
    youtube: playlistId ? { playlistId } : undefined,
  });
}
