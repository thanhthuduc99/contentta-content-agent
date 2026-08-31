import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { zernioPublish, type Platform } from "./zernio-publish";
import { generateVideoCaption } from "./claude";
import { mediaDirFor, REPO_ROOT } from "./paths";
import { getAccountMap } from "./zernio";
import { createNativeAutomation } from "./comment-automations";
import { createYoutubeSearchReplyRule } from "./auto-react";
import { deriveKeyword, extractGithubLink, isValidKeyword, KEYWORD_MAX } from "./daily-news-keyword";

// Edit Agent pipeline gốc — gọi qua child_process thay vì copy code.
// Cấu hình DAILY_NEWS_DIR trong .env để trỏ đúng workspace của bạn.
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


// ============================================================================
// Edit daily news — TỰ ĐỘNG build video no-face từ topic user gửi + đăng Zernio.
// Bật bằng env DAILY_NEWS_BUILD_ENABLED=1. Job xếp hàng trong _jobs/, runner spawn
// Claude Code headless TUẦN TỰ → page poll trạng thái qua getDailyNewsBuild.
//
// Vì sao xếp hàng thay vì spawn thẳng: nhiều process claude headless dùng chung
// credential, thằng spawn sau refresh OAuth token làm thằng đang chạy mất phiên
// ("Not logged in · Please run /login" — đã giết build dn-1787979654900). Nâng
// DAILY_NEWS_MAX_CONCURRENT chỉ an toàn khi mỗi process có credential riêng.
// ============================================================================

const TPL_DIR = path.join(DAILY_NEWS_DIR, "contentta-shorts-skill", "templates-vertical-ivory");
const DN_PROJECTS = path.join(DAILY_NEWS_DIR, "video-projects");
const DN_JOBS = path.join(DN_PROJECTS, "_jobs");
const MAX_CONCURRENT = Math.max(1, Number(process.env.DAILY_NEWS_MAX_CONCURRENT) || 1);

function dnProjectDir(slug: string): string {
  return path.join(DN_PROJECTS, slug);
}

export type DnJob = {
  slug: string;
  topic: string;
  keyword: string;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number;
  pid?: number;
};

// Metadata job nằm NGOÀI dn-<slug>/ vì bước scaffold của agent ghi đè cả thư mục đó —
// đã làm mất header build.log của 5/15 build cũ, khiến state kẹt "running" vĩnh viễn.
// Đọc/ghi bằng fs đồng bộ: tickQueue chạy liền mạch nên không có cửa sổ cho hai lần
// tick cùng đếm rồi cùng spawn một job.
function jobPath(slug: string): string {
  return path.join(DN_JOBS, `${slug}.json`);
}

function readJob(slug: string): DnJob | null {
  try {
    return JSON.parse(fsSync.readFileSync(jobPath(slug), "utf8")) as DnJob;
  } catch {
    return null;
  }
}

function writeJob(job: DnJob): void {
  fsSync.mkdirSync(DN_JOBS, { recursive: true });
  fsSync.writeFileSync(jobPath(job.slug), JSON.stringify(job, null, 2), "utf8");
}

function readAllJobs(): DnJob[] {
  let names: string[] = [];
  try {
    names = fsSync.readdirSync(DN_JOBS).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: DnJob[] = [];
  for (const n of names) {
    const j = readJob(n.replace(/\.json$/, ""));
    if (j) out.push(j);
  }
  return out;
}

// Server restart giết child nhưng file job vẫn ghi "đang chạy" → hàng đợi tắc vĩnh viễn.
// Đối chiếu bằng pid: process chết mà chưa có endedAt thì đóng job lại ngay.
function isAlive(pid?: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasFinalVideo(slug: string): boolean {
  try {
    return fsSync.statSync(path.join(dnProjectDir(slug), "renders", "final.mp4")).size > 0;
  } catch {
    return false;
  }
}

// Prompt cho headless agent — encode toàn bộ recipe no-face đã dùng (junction/GLM/…).
function buildDailyNewsPrompt(info: string, slug: string, keyword: string): string {
  const kw = (keyword || "").trim();
  const outroRule = kw
    ? `Câu chốt cuối BẮT BUỘC: vo-script-display.txt ghi "Comment ${kw} và follow kênh, mình gửi link cho nha." — vo-script.txt ghi y hệt nhưng PHIÊN ÂM ${kw} để TTS đọc gần đúng (vd godseye -> "gót xai", pixelle -> "pít xeo"), KHÔNG để nguyên chữ tiếng Anh. ĐÂY là câu CUỐI CÙNG của script, không thêm câu nào sau nó.`
    : `Câu chốt cuối BẮT BUỘC: "Muốn xem tin AI mỗi ngày, nhớ theo dõi Contentta."`;
  const ctaPick = kw
    ? `v15-follow-comment BẮT BUỘC cho scene cuối (video này CÓ keyword "${kw}")`
    : `v13-cta-outro BẮT BUỘC cho scene cuối (video này KHÔNG có keyword)`;
  const ctaEdit = kw
    ? `
   SCENE CUỐI dùng v15-follow-comment (chỉ có headline "Comment X" + con trỏ bấm nút Follow, KHÔNG có ô comment/gõ chữ). Sau khi sinh chỉ sửa 1 chỗ: thay X trong <h1 class="headline xl">Comment <span class="accent">X</span></h1> bằng ${kw}. KHÔNG thêm ô comment lại, KHÔNG đụng timeline.
   CANH GIỜ scene cuối: nó PHẢI bắt đầu ĐÚNG lúc giọng đọc câu CTA "Comment ${kw} và follow kênh...". Mở transcript-final.json, tìm mốc "start" của từ đầu tiên câu CTA (từ "Comment"), đặt data-start của scene cuối = mốc đó (làm tròn 2 số), data-duration = tổng transcript - mốc đó. Scene ngay trước phải KÉO DÀI data-duration để kết thúc đúng mốc này (không chừa khoảng trống, không đè). TUYỆT ĐỐI không để hình v15 hiện khi giọng còn đang đọc thân bài.`
    : "";
  return `Bạn là editor Contentta, chạy HEADLESS (không có người trả lời). TUYỆT ĐỐI KHÔNG hỏi lại — tự quyết mọi thứ và chạy tới khi ra final.mp4. Không dừng giữa chừng.

NHIỆM VỤ: từ INFO dưới đây, làm 1 video short NO-FACE DỌC 1080x1920 brand Contentta (55-62 giây, KHÔNG vượt 65s), lưu vào video-projects/${slug}/renders/final.mp4.

INFO NGUỒN (chủ đề/nội dung user gửi):
"""
${info}
"""

CWD hiện tại = repo daily (có node_modules, tools/, .env OPENAI_API_KEY, hyperframes CLI).

CÁC BƯỚC:
1. Scaffold: cp -r contentta-shorts-skill/video-projects/daily-ivory-vertical video-projects/${slug}. Trong video-projects/${slug}: xoá file mẫu (assets/vo-script.txt.example, assets/transcript-final.json.example, renders/*). GIỮ compositions/ambient-bg.html + grain-overlay.html, assets/vendor/gsap.min.js, assets/base-vertical.css, assets/bg-vertical.png, assets/fonts/, assets/emoji/, hyperframes.json, assets/topic.txt (đã ghi sẵn trước khi build, KHÔNG xoá/ghi đè — dùng để rút link cho auto comment-to-DM lúc đăng), build.log (log đang ghi, KHÔNG xoá). mkdir -p assets/media renders/frames.
   KHÔNG copy/dùng nhạc nền — video chỉ có voice, không có music track.
2. Viết 2 file script TỪ INFO: assets/vo-script.txt (phiên âm tên riêng để TTS đọc đúng: vd Claude Code->"Cờ lo Cốt", GitHub->"Gít Hấp", Contentta->"Còn Ten Ta"; GIỮ "AI") + assets/vo-script-display.txt (tên thật cho caption). ~120-145 từ ~ 48-58s (giọng đã giảm tốc; scene CTA cuối dài hơn trước nên script phải gọn hơn để không vượt 65s). Hook 3s đầu tạo tension (số shock/mâu thuẫn), KHÔNG mở bằng "Hôm nay...". Thuần Việt, casual câu ngắn. CHỈ dùng số liệu CÓ trong INFO — KHÔNG bịa số. TUYỆT ĐỐI KHÔNG nhắc loại giấy phép (MIT, Apache, GPL, open-source license...) trong script — người xem không quan tâm; nói "mã nguồn mở, tự tải về chạy được" là đủ.
   ${outroRule}
3. TTS: cd video-projects/${slug}/assets && node "${path.join(DAILY_NEWS_DIR, "tools", "tts-vivibe.mjs")}" (giọng Vivibe, key riêng trong edit-agent/.env). Check voice.mp3 ≤65s (dùng ffmpeg-static). Nếu script lỗi (thiếu key/timeout) → fallback node "${path.join(DAILY_NEWS_DIR, "tools", "tts-openai.mjs")}" (giọng onyx) để không chặn build.
4. Transcribe: từ video-projects/${slug} chạy node "${path.join(DAILY_NEWS_DIR, "tools", "transcribe-openai.mjs")}" assets/voice.mp3.
5. Caption: đọc transcript-final.json, viết assets/replacements.json map chuỗi Whisper nghe SAI -> TÊN THẬT; node "${path.join(DAILY_NEWS_DIR, "contentta-shorts-skill", "scripts", "generate-captions.mjs")}" assets/transcript-final.json compositions/captions.html assets/replacements.json --theme ivory. Cờ --theme ivory BẮT BUỘC: caption chữ ink rgba(23,19,13,0.40) -> từ đang đọc plum #4A3AE0. Grep verify caption hiện TÊN THẬT, KHÔNG leak phiên âm.

5b. Nếu INFO có link (repo GitHub, blog): node "${path.join(DAILY_NEWS_DIR, "tools", "fetch-media.mjs")}" "<url>" --out assets/media. Lấy screenshot 16:9 (assets/media/shot-viewport.png), ảnh trong trang, số liệu GitHub thật (sao, fork, ngôn ngữ). DÙNG SỐ NÀY, tuyệt đối không bịa (KHÔNG dùng/nhắc license). Không có link thì bỏ qua bước này và không dùng scene cần ảnh.
   VIDEO DEMO: tool tự dò và tải video demo của repo (nếu có) về assets/media/demo.mp4, và ghi field "video" trong JSON stdout. NẾU có assets/media/demo.mp4: thay scene screenshot (v09) bằng 1 SCENE VIDEO chạy clip đó (xem bước 6, mục VIDEO). Không có demo.mp4 thì giữ scene screenshot tĩnh như cũ.
6. Build 4-6 scene bằng BỘ TEMPLATE DỌC IVORY. ĐỌC TRƯỚC: "${TPL_DIR}/README.md" (11 template, bảng chọn, giới hạn ký tự tiếng Việt đã đo thật, luật cứng).
   Mỗi scene sinh bằng: node "${path.join(DAILY_NEWS_DIR, "tools", "template-to-scene.mjs")}" "${TPL_DIR}/vXX-....html" compositions/sceneN-ten.html sN-ten <duration>
   Tool tự scope CSS + selector GSAP theo composition id, nhúng font + base-vertical.css, đổi đường dẫn asset. KHÔNG tự viết scene từ đầu trừ khi không template nào hợp nội dung.
   Chọn template theo vai trò: v01 title-card mở video · v02 hook-statement câu hỏi mạnh · v03 grid-cards liệt kê 3-4 ý · v06 workflow quy trình · v07 big-number một con số · v09 screenshot-callout ảnh thật từ link · v10 terminal-code lệnh/config · v11 before-after đối chiếu · v14 media-slideshow 2-3 ảnh thật · ${ctaPick}.${ctaEdit}
   SAU KHI SINH, sửa nội dung + canh timing NGAY TRONG FILE SCENE:
   - Thay chữ theo lời thoại thật trong khoảng đó, giữ đúng giới hạn ký tự trong README.
   - Scene nhiều mục (v03, v06, v11): canh thời điểm từng mục theo mốc từ trong transcript-final.json. TUYỆT ĐỐI không để stagger mặc định chạy hết trong 1,5 giây rồi đứng im 15 giây.
   - Ảnh thật trỏ vào assets/media/ từ bước 5b.
   Hệ màu: nền kem #FAF6EF, chữ ink #17130D, nhấn plum #4A3AE0, pastel lavender/peach/sky/sage/gold. Font Bricolage Grotesque (display) + Be Vietnam Pro (body) + Lora italic (1-2 từ nhấn, mỗi khung CHỈ MỘT cụm). KHÔNG dùng hệ Orbital cũ (đen/đỏ).
   Luật giữ nguyên: gsap timeline paused -> window.__timelines; tl.set({},{},DUR) pad; finite repeat (KHÔNG -1); KHÔNG Date.now/Math.random; emoji phải là <img> trỏ assets/emoji/*.png, không viết ký tự emoji hay dấu tick vào HTML.
   VIDEO (chỉ khi có assets/media/demo.mp4): KHÔNG nhúng <video> vào file scene/composition — hyperframes chỉ seek currentTime ở timeline GỐC (index.html), video trong iframe composition sẽ đứng hình. Thay vào đó, ở index.html thêm 1 track <video> cấp gốc (xem bước 7). Scene screenshot (v09) bỏ đi, thời gian đó dành cho video track. Nếu muốn có nhãn chữ đè lên (vd tên repo), làm 1 composition nhỏ chỉ có text, đặt track-index trên video track.
7. index.html: <head> load assets/fonts/brand-fonts.css + assets/base-vertical.css, body background #FAF6EF. Track ambient 0, scenes 2 (tuần tự, TRỪ 0.02 vào data-duration của mọi scene trừ scene cuối để tránh lỗi lint overlapping_clips_same_track do sai số float), captions 3, voice(<audio>) 4 vol 1, grain 99. KHÔNG có track music. Tổng data-duration = duration transcript (+~0.1). Tham chiếu cấu trúc: contentta-shorts-skill/video-projects/dn-ivory-test/index.html (video mẫu đã render đạt, BỎ QUA track music/audio thứ 2 trong file mẫu đó nếu có).
   VIDEO TRACK (chỉ khi có assets/media/demo.mp4): thêm <video id="demo-video" src="assets/media/demo.mp4" muted playsinline data-start="<mốc scene demo>" data-duration="<dài scene>" data-track-index="1" data-width="1080" data-height="1920"> làm CON TRỰC TIẾP của #root (KHÔNG bọc trong template/iframe). TUYỆT ĐỐI KHÔNG đặt data-composition-id lên <video>: hyperframes coi mọi element có data-composition-id là 1 composition PHẢI đăng ký window.__timelines[id]; <video> không đăng ký timeline nên bị chờ timeout 45s rồi DROP khỏi output (video KHÔNG hiện). <video> là media element như <audio>: chỉ cần id + data-start/data-duration/data-track-index/src + muted. Video repo thường ngang 16:9: canh giữa dạng letterbox (nền kem lộ trên/dưới) bằng CSS trong <style> ở index.html: #demo-video{object-fit:contain;background:transparent}. muted BẮT BUỘC (voice đang nói, không lẫn tiếng video). Cắt ~6-8s: data-duration ngắn hơn để clip không chạy hết. Nếu demo.mp4 dài hơn khoảng cần, vẫn OK (hyperframes chỉ lấy đúng data-duration).
8. cd video-projects/${slug} && npx hyperframes lint (phải 0 error) -> npx hyperframes render --quality standard --gpu --browser-gpu --output renders/final.mp4.
9. Viết video-projects/${slug}/assets/caption.txt: caption đăng social (hook + tóm tắt + "Theo dõi Contentta...") + TỐI ĐA 5 hashtag. DÒNG ĐẦU = tiêu đề ngắn (dùng cho YouTube).
10. Verify: extract vài frame bằng ffmpeg VÀ ĐỌC ẢNH đó, đảm bảo nền kem không phải nền đen, dấu tiếng Việt đúng, không tràn chữ, caption tên thật, no-face. Nếu lỗi nặng -> fix -> re-render.

Khi xong, in DÒNG CUỐI: "DONE video-projects/${slug}/renders/final.mp4".`;
}

const SAFE_INFO_MAX = 4000;
export function assertInfo(v: string): string {
  const t = (v || "").trim();
  if (!t) throw new InvalidEditParamError("thiếu nội dung (info)");
  if (t.length > SAFE_INFO_MAX) throw new InvalidEditParamError(`info quá dài (tối đa ${SAFE_INFO_MAX} ký tự)`);
  return t;
}

// Xếp job vào hàng đợi rồi trả slug ngay. Runner quyết định lúc nào spawn thật.
export async function enqueueDailyNewsBuild(info: string, keyword: string): Promise<{ slug: string }> {
  if ((process.env.DAILY_NEWS_BUILD_ENABLED || "").trim() !== "1") {
    throw new InvalidEditParamError("Tính năng build daily-news đang TẮT. Đặt DAILY_NEWS_BUILD_ENABLED=1 trong web/.env để bật.");
  }
  const cleanInfo = assertInfo(info);
  const kw = (keyword || "").trim().toLowerCase();
  if (kw && !isValidKeyword(kw)) {
    throw new InvalidEditParamError(`keyword không hợp lệ: chỉ chữ thường + số, 2-${KEYWORD_MAX} ký tự, không dấu gạch`);
  }
  const slug = assertSlug(`dn-${Date.now()}`, "slug");
  writeJob({ slug, topic: cleanInfo, keyword: kw, queuedAt: Date.now() });
  tickQueue();
  return { slug };
}

// Idempotent — gọi được ở mọi lúc: sau enqueue, khi 1 child thoát, và ở mỗi lần page
// poll trạng thái (nhờ vậy hàng đợi tự chạy tiếp sau khi restart server 8502).
export function tickQueue(): void {
  const jobs = readAllJobs();
  for (const j of jobs) {
    if (j.startedAt && !j.endedAt && !isAlive(j.pid)) {
      j.endedAt = Date.now();
      j.exitCode = -1;
      writeJob(j);
    }
  }
  let running = jobs.filter((j) => j.startedAt && !j.endedAt).length;
  const pending = jobs.filter((j) => !j.startedAt).sort((a, b) => a.queuedAt - b.queuedAt);
  for (const job of pending) {
    if (running >= MAX_CONCURRENT) break;
    spawnBuild(job);
    running++;
  }
}

function spawnBuild(job: DnJob): void {
  // Đánh dấu startedAt TRƯỚC khi spawn: readAllJobs/tickQueue chạy đồng bộ nên lần tick
  // kế tiếp thấy ngay job này đang chạy, không spawn trùng.
  const started: DnJob = { ...job, startedAt: Date.now() };
  writeJob(started);

  const projDir = dnProjectDir(job.slug);
  const logPath = path.join(projDir, "build.log");
  try {
    fsSync.mkdirSync(path.join(projDir, "assets"), { recursive: true });
    fsSync.writeFileSync(logPath, `[start ${new Date().toISOString()}] slug=${job.slug}\n`, "utf8");
    // Lưu lại topic gốc: publish (request khác, có thể cách build nhiều phút) cần đọc lại
    // để rút link GitHub cho auto comment-to-DM, "info" không sống ngoài prompt build.
    fsSync.writeFileSync(path.join(projDir, "assets", "topic.txt"), job.topic, "utf8");
  } catch {}

  const finish = (note: string, code: number) => {
    if (note) { try { fsSync.appendFileSync(logPath, note); } catch {} }
    writeJob({ ...(readJob(job.slug) || started), endedAt: Date.now(), exitCode: code });
    tickQueue();
  };

  const prompt = buildDailyNewsPrompt(job.topic, job.slug, job.keyword);
  // KHÔNG dùng fd + detached: trên Windows (shell:true → cmd.exe) file descriptor không truyền
  // tới process claude khi detached → log rỗng, agent không chạy, build treo tới timeout ("lỗi").
  // Dùng pipe + event handler ghi log; child gắn theo vòng đời server (đủ cho tool local).
  const child = spawn(
    "claude",
    ["-p", "--permission-mode", "bypassPermissions", "--output-format", "stream-json", "--verbose",
     "--add-dir", DAILY_NEWS_DIR],
    { cwd: DAILY_NEWS_DIR, shell: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"] }
  );
  if (child.pid) writeJob({ ...started, pid: child.pid });
  child.stdout?.on("data", (d) => { try { fsSync.appendFileSync(logPath, d.toString()); } catch {} });
  child.stderr?.on("data", (d) => { try { fsSync.appendFileSync(logPath, d.toString()); } catch {} });
  child.on("error", (e) => finish(`\n[spawn error] ${e.message}\n`, -1));
  child.on("exit", (code) => finish("", code ?? -1));
  child.stdin?.write(prompt);
  child.stdin?.end();
}

export type DailyNewsState = "queued" | "running" | "done" | "failed";

export type DailyNewsBuild = {
  slug: string;
  state: DailyNewsState;
  logTail: string;
  hasVideo: boolean;
  caption: string | null;
  failReason: string | null;
  topic: string;
  keyword: string;
};

// Job cũ (trước khi có _jobs/) không có metadata — chúng đều đã kết thúc từ lâu,
// nên chỉ cần nhìn có final.mp4 hay không.
function stateOf(job: DnJob | null, hasVideo: boolean): DailyNewsState {
  if (hasVideo) return "done";
  if (!job) return "failed";
  if (!job.startedAt) return "queued";
  if (job.endedAt) return "failed";
  return "running";
}

// Lý do chết lấy từ dòng {"type":"result"} cuối của stream-json — đọc được bằng mắt,
// khác hẳn 60 dòng JSON thô. Regex đoán cũ tìm chuỗi "Agent kết thúc:" không hề tồn tại.
function readFailReason(log: string): string | null {
  const lines = log.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l.startsWith("{") || !l.includes('"type":"result"')) continue;
    try {
      const o = JSON.parse(l) as { result?: string; error?: string };
      const msg = (o.result || o.error || "").trim().slice(0, 300);
      if (!msg) return null;
      return /not logged in|authentication/i.test(`${msg} ${o.error || ""}`)
        ? `${msg}. Mở terminal, chạy "claude" rồi /login.`
        : msg;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getDailyNewsBuild(slug: string): Promise<DailyNewsBuild> {
  assertSlug(slug, "slug");
  const projDir = dnProjectDir(slug);

  let log = "";
  try { log = await fs.readFile(path.join(projDir, "build.log"), "utf8"); } catch { log = ""; }
  let caption: string | null = null;
  try { caption = (await fs.readFile(path.join(projDir, "assets", "caption.txt"), "utf8")).trim(); } catch {}

  const job = readJob(slug);
  const hasVideo = hasFinalVideo(slug);
  const state = stateOf(job, hasVideo);

  return {
    slug,
    state,
    logTail: log.split("\n").slice(-60).join("\n"),
    hasVideo,
    caption,
    failReason: state === "failed" ? readFailReason(log) : null,
    topic: job?.topic || "",
    keyword: job?.keyword || "",
  };
}

export type DailyNewsJobRow = {
  slug: string;
  topic: string;
  keyword: string;
  state: DailyNewsState;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
};

// Gộp job có metadata với project cũ chỉ còn thư mục (slug dn-<ms> đã mang sẵn mốc thời gian).
export async function listDailyNewsJobs(limit = 10): Promise<DailyNewsJobRow[]> {
  const bySlug = new Map<string, DnJob>();
  const withMeta = new Set<string>();
  for (const j of readAllJobs()) { bySlug.set(j.slug, j); withMeta.add(j.slug); }
  try {
    const entries = await fs.readdir(DN_PROJECTS, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !/^dn-\d+$/.test(e.name) || bySlug.has(e.name)) continue;
      bySlug.set(e.name, { slug: e.name, topic: "", keyword: "", queuedAt: Number(e.name.slice(3)) });
    }
  } catch {}

  const rows: DailyNewsJobRow[] = [];
  for (const j of bySlug.values()) {
    let topic = j.topic;
    if (!topic) {
      try { topic = fsSync.readFileSync(path.join(dnProjectDir(j.slug), "assets", "topic.txt"), "utf8").trim(); } catch {}
    }
    rows.push({
      slug: j.slug,
      topic,
      keyword: j.keyword,
      state: stateOf(withMeta.has(j.slug) ? j : null, hasFinalVideo(j.slug)),
      queuedAt: j.queuedAt,
      startedAt: j.startedAt,
      endedAt: j.endedAt,
    });
  }
  return rows.sort((a, b) => b.queuedAt - a.queuedAt).slice(0, limit);
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

export type DailyNewsAutoDm = { link: string; keyword: string };

// Rút link GitHub từ topic gốc — deterministic, không qua AI nên không sợ AI gõ sai/hụt URL.
// Keyword lấy từ metadata job vì ĐÓ là chữ đã in vào scene CTA lúc render; suy lại từ topic
// ở đây sẽ ra chữ khác khi Thanh sửa tay trên form → rule Zernio lệch với màn hình.
// Không thấy link → null, tính năng tự tắt cho video đó.
export async function generateDailyNewsAutoDm(slug: string): Promise<DailyNewsAutoDm | null> {
  assertSlug(slug, "slug");
  let topic = "";
  try {
    topic = (await fs.readFile(path.join(dnProjectDir(slug), "assets", "topic.txt"), "utf8")).trim();
  } catch {
    return null;
  }
  const link = extractGithubLink(topic);
  if (!link) return null;
  const keyword = (readJob(slug)?.keyword || "").trim() || deriveKeyword(topic);
  if (!keyword) return null;
  return { link, keyword };
}

type AutoDmParams = { keyword: string; link: string; dmMessage: string; commentReply: string };
type AutoDmOutcome = { status: "ok" | "skipped" | "failed"; created?: number; reason?: string };

// YouTube lọc comment chứa link -> reply chỉ đường search Google, KHÔNG dán URL.
function youtubeSearchReply(keyword: string): string {
  return `Bạn search "github ${keyword}" trên Google là ra repo nha`;
}

// Áp automation vào ĐÚNG post vừa đăng. FB/IG: Zernio native comment-to-DM (Zernio tự
// DM + reply server-side). YouTube: rule reply công khai qua auto-react local (webhook)
// vì Zernio native chặn non-FB/IG và YouTube không có "nhắn riêng".
async function createDailyNewsAutomations(
  result: Record<string, unknown>,
  autoDm: AutoDmParams
): Promise<AutoDmOutcome> {
  let accMap: Awaited<ReturnType<typeof getAccountMap>>;
  try {
    accMap = await getAccountMap();
  } catch (e) {
    return { status: "failed", reason: `không lấy được account Zernio: ${(e as Error).message}` };
  }
  let created = 0;
  const errors: string[] = [];
  for (const p of ["facebook", "instagram"] as const) {
    const r = result[p] as { status?: string; platformPostId?: string; zernioPostId?: string } | undefined;
    if (!r || r.status !== "ok" || !r.platformPostId || !r.zernioPostId) continue;
    const acc = accMap[p];
    if (!acc) continue;
    try {
      await createNativeAutomation({
        accountId: acc.accountId,
        platform: p,
        platformPostId: r.platformPostId,
        postId: r.zernioPostId,
        keywords: [autoDm.keyword],
        dmMessage: autoDm.dmMessage,
        commentReply: autoDm.commentReply,
      });
      created++;
    } catch (e) {
      errors.push(`${p}: ${(e as Error).message}`);
    }
  }

  // YouTube: reply công khai câu chỉ đường (không link), khớp cùng keyword.
  const yt = result["youtube"] as { status?: string; platformPostId?: string } | undefined;
  const ytAcc = accMap["youtube"];
  if (yt?.status === "ok" && ytAcc) {
    try {
      const ok = await createYoutubeSearchReplyRule({
        accountId: ytAcc.accountId,
        keyword: autoDm.keyword,
        commentReply: youtubeSearchReply(autoDm.keyword),
        platformPostId: yt.platformPostId,
      });
      if (ok) created++;
    } catch (e) {
      errors.push(`youtube: ${(e as Error).message}`);
    }
  }

  if (!created) {
    return errors.length
      ? { status: "failed", reason: errors.join("; ").slice(0, 300) }
      : { status: "skipped", reason: "không có facebook/instagram/youtube đăng thành công" };
  }
  return { status: "ok", created, reason: errors.length ? errors.join("; ").slice(0, 300) : undefined };
}

// Copy final.mp4 vào MEDIA_DIR rồi đăng qua Zernio.
const ZERNIO_PLATFORMS: Platform[] = ["facebook", "instagram", "tiktok", "youtube", "linkedin", "threads"];

export async function publishDailyNews(params: {
  slug: string;
  caption: string;
  platforms?: string[];
  scheduledTime?: string;
  playlistId?: string;
  autoDm?: AutoDmParams;
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
  // Lọc bỏ platform ngoài danh sách Zernio hỗ trợ. Mặc định Facebook.
  const plats = (params.platforms || ["facebook"]).filter(
    (p): p is Platform => (ZERNIO_PLATFORMS as string[]).includes(p)
  );
  const playlistId = (params.playlistId || "").trim();
  if (playlistId && !/^[A-Za-z0-9_-]{10,64}$/.test(playlistId)) {
    throw new InvalidEditParamError("playlistId không hợp lệ");
  }
  const result = await zernioPublish({
    mediaPaths: [dst],
    caption,
    platforms: plats.length ? plats : ["facebook"],
    scheduledTime: params.scheduledTime || undefined,
    youtube: playlistId ? { playlistId } : undefined,
  });

  const autoDm = params.autoDm;
  const isScheduled = !!(params.scheduledTime && new Date(params.scheduledTime).getTime() > Date.now() + 60_000);
  if (!autoDm || !autoDm.keyword.trim()) {
    result.autoDm = { status: "skipped", reason: "chưa có keyword" } as AutoDmOutcome;
  } else if (isScheduled) {
    result.autoDm = {
      status: "skipped",
      reason: "bài hẹn lịch, tự tạo ở /comment-to-dm sau khi bài lên sóng",
    } as AutoDmOutcome;
  } else {
    result.autoDm = await createDailyNewsAutomations(result, autoDm);
  }
  return result;
}
