import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { zernioPublish, type Platform } from "./zernio-publish";
import { generateVideoCaption } from "./claude";
import { mediaDirFor } from "./paths";
import { getAccountMap } from "./zernio";
import { createNativeAutomation } from "./comment-automations";
import { createYoutubeSearchReplyRule } from "./auto-react";
import { deriveKeyword, extractGithubLink, isValidKeyword, KEYWORD_MAX } from "./daily-news-keyword";

// Edit Agent pipeline gốc — giữ nguyên vị trí, gọi qua child_process thay vì copy code.
// Nếu di chuyển edit-agent, chỉ cần sửa hằng số này.
const EDIT_AGENT_ROOT = path.join(
  "D:", "thanh", "CONTENTTA AGENCY", "6. AI Agent", "edit-agent"
);
export const DAILY_NEWS_DIR = path.join(EDIT_AGENT_ROOT, "sandbox", "contentta-daily-ai-news");
// Sandbox video dọc TÓM TẮT VIDEO YOUTUBE — cùng hạ tầng queue với daily-news
// (bắt buộc chung hàng đợi: 2 claude headless song song đá nhau khỏi phiên OAuth).
export const YT_SUMMARY_DIR = path.join(EDIT_AGENT_ROOT, "sandbox", "contentta-yt-summary");

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
const TPL_HUMAN_DIR = path.join(YT_SUMMARY_DIR, "skill", "templates-vertical-human");
const DN_PROJECTS = path.join(DAILY_NEWS_DIR, "video-projects");
const YS_PROJECTS = path.join(YT_SUMMARY_DIR, "video-projects");
const DN_JOBS = path.join(DN_PROJECTS, "_jobs");
const MAX_CONCURRENT = Math.max(1, Number(process.env.DAILY_NEWS_MAX_CONCURRENT) || 1);
// Model của agent build video (dùng chung cho dn-* lẫn ys-*).
const BUILD_MODEL = "claude-opus-5";

// 2 loại job chung 1 hàng đợi (_jobs trong daily-news), phân biệt bằng prefix slug:
// dn-* = daily-news · ys-* = yt-summary. Project dir mỗi loại nằm ở sandbox riêng.
function dnProjectDir(slug: string): string {
  return path.join(slug.startsWith("ys-") ? YS_PROJECTS : DN_PROJECTS, slug);
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
  publishedAt?: number; // đã đăng qua Zernio (hoặc đánh dấu tay) — hàng đợi tách ra mục "đã đăng"
  platforms?: string[];
  // yt-summary (slug ys-*)
  url?: string;
  groupUrl?: string;
  groupName?: string;
  itemId?: string; // item short đã tạo sau khi build xong (route /edit/youtube gắn vào)
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
   CANH GIỜ scene cuối: nó PHẢI bắt đầu ĐÚNG lúc giọng đọc câu CTA "Comment ${kw} và follow kênh...". Mở transcript-final.json, tìm mốc "start" của từ đầu tiên câu CTA (từ "Comment"), đặt data-start của scene cuối = mốc đó (làm tròn 2 số), data-duration = (tổng transcript + 2.00) - mốc đó. Cộng 2 giây vì video giữ scene CTA thêm 2s SAU KHI giọng đã im, cho người xem kịp đọc chữ "Comment ${kw}"; timeline v15 tự đứng yên ở khung cuối nên không cần sửa gì trong file scene. Scene ngay trước phải KÉO DÀI data-duration để kết thúc đúng mốc này (không chừa khoảng trống, không đè). TUYỆT ĐỐI không để hình v15 hiện khi giọng còn đang đọc thân bài.`
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
2. Viết 2 file script TỪ INFO: assets/vo-script.txt (phiên âm tên riêng để TTS đọc đúng: vd Claude Code->"Cờ lo Cốt", GitHub->"Gít Hấp", Contentta->"Còn Ten Ta"; GIỮ "AI") + assets/vo-script-display.txt (tên thật cho caption). ~120-145 từ ~ 48-58s (giọng đã giảm tốc; video còn cộng 2s đuôi im lặng sau câu cuối nên script phải gọn để tổng không vượt 65s). Hook 3s đầu tạo tension (số shock/mâu thuẫn), KHÔNG mở bằng "Hôm nay...". Thuần Việt, casual câu ngắn. CHỈ dùng số liệu CÓ trong INFO — KHÔNG bịa số. TUYỆT ĐỐI KHÔNG nhắc loại giấy phép (MIT, Apache, GPL, open-source license...) trong script — người xem không quan tâm; nói "mã nguồn mở, tự tải về chạy được" là đủ.
   ${outroRule}
3. TTS: cd video-projects/${slug}/assets && node "${path.join(DAILY_NEWS_DIR, "tools", "tts-vivibe.mjs")}" (giọng Vivibe, key riêng trong edit-agent/.env). Check voice.mp3 ≤62s (dùng ffmpeg-static; cộng 2s đuôi im lặng là 64s). Nếu script lỗi (thiếu key/timeout) → fallback node "${path.join(DAILY_NEWS_DIR, "tools", "tts-openai.mjs")}" (giọng onyx) để không chặn build.
4. Transcribe: từ video-projects/${slug} chạy node "${path.join(DAILY_NEWS_DIR, "tools", "transcribe-openai.mjs")}" assets/voice.mp3.
5. Caption: đối chiếu transcript-final.json với vo-script-display.txt TỪNG CÂU, chỗ nào Whisper nghe khác script thì ghi vào assets/replacements.json (chuỗi Whisper nghe SAI thành chữ ĐÚNG trong script). KHÔNG chỉ soi tên riêng: từ thường nghe nhầm cũng phải sửa (đã dính lỗi thật: Whisper ra "thể tiến dụng" trong khi script ghi "thẻ tín dụng"). Key nhiều từ được phép, số từ 2 vế không cần bằng nhau. Rồi chạy node "${path.join(DAILY_NEWS_DIR, "contentta-shorts-skill", "scripts", "generate-captions.mjs")}" assets/transcript-final.json compositions/captions.html assets/replacements.json --theme ivory. Cờ --theme ivory BẮT BUỘC: caption chữ ink rgba(23,19,13,0.40) -> từ đang đọc plum #4A3AE0. Grep verify caption hiện TÊN THẬT, KHÔNG leak phiên âm.

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
7. index.html: <head> load assets/fonts/brand-fonts.css + assets/base-vertical.css, body background #FAF6EF. Track ambient 0, scenes 2 (tuần tự, TRỪ 0.02 vào data-duration của mọi scene trừ scene cuối để tránh lỗi lint overlapping_clips_same_track do sai số float), captions 3, voice(<audio>) 4 vol 1, grain 99. KHÔNG có track music. Tổng data-duration của #root = độ dài voice.mp3 + 2.00: 2 giây cuối là ĐUÔI IM LẶNG giữ nguyên scene CTA cho người xem đọc kịp. ambient-bg và grain dài bằng #root; scene CUỐI phải kéo data-duration tới hết #root (phủ luôn đuôi im lặng, không để 2s cuối trống trơn); track captions CHỈ dài bằng voice (không kéo vào đuôi im lặng); <audio> voice giữ đúng độ dài file. Tham chiếu cấu trúc: contentta-shorts-skill/video-projects/dn-ivory-test/index.html (video mẫu đã render đạt, BỎ QUA track music/audio thứ 2 trong file mẫu đó nếu có).
   VIDEO TRACK (chỉ khi có assets/media/demo.mp4): thêm <video id="demo-video" src="assets/media/demo.mp4" muted playsinline data-start="<mốc scene demo>" data-duration="<dài scene>" data-track-index="1" data-width="1080" data-height="1920"> làm CON TRỰC TIẾP của #root (KHÔNG bọc trong template/iframe). TUYỆT ĐỐI KHÔNG đặt data-composition-id lên <video>: hyperframes coi mọi element có data-composition-id là 1 composition PHẢI đăng ký window.__timelines[id]; <video> không đăng ký timeline nên bị chờ timeout 45s rồi DROP khỏi output (video KHÔNG hiện). <video> là media element như <audio>: chỉ cần id + data-start/data-duration/data-track-index/src + muted. Video repo thường ngang 16:9: canh giữa dạng letterbox (nền kem lộ trên/dưới) bằng CSS trong <style> ở index.html: #demo-video{object-fit:contain;background:transparent}. muted BẮT BUỘC (voice đang nói, không lẫn tiếng video). Cắt ~6-8s: data-duration ngắn hơn để clip không chạy hết. Nếu demo.mp4 dài hơn khoảng cần, vẫn OK (hyperframes chỉ lấy đúng data-duration).
8. cd video-projects/${slug} && npx hyperframes lint (phải 0 error) -> npx hyperframes render --quality standard --gpu --browser-gpu --output renders/final.mp4.
9. Viết video-projects/${slug}/assets/caption.txt: caption đăng social (hook + tóm tắt + "Theo dõi Contentta...") + TỐI ĐA 5 hashtag. DÒNG ĐẦU = tiêu đề ngắn (dùng cho YouTube).
10. Verify: extract vài frame bằng ffmpeg VÀ ĐỌC ẢNH đó, đảm bảo nền kem không phải nền đen, dấu tiếng Việt đúng, không tràn chữ, caption tên thật, no-face. Nếu lỗi nặng -> fix -> re-render.

Khi xong, in DÒNG CUỐI: "DONE video-projects/${slug}/renders/final.mp4".`;
}

// Prompt build video dọc TÓM TẮT VIDEO YOUTUBE — bộ template human, xen đoạn thao tác
// cắt từ video gốc, CTA mời group (mặc định AI Automation Academy).
function buildYtSummaryPrompt(job: DnJob): string {
  const slug = job.slug;
  const groupName = job.groupName || "AI Automation Academy";
  const tool = (f: string) => path.join(YT_SUMMARY_DIR, "tools", f);
  return `Bạn là editor Contentta, chạy HEADLESS (không có người trả lời). TUYỆT ĐỐI KHÔNG hỏi lại — tự quyết mọi thứ và chạy tới khi ra final.mp4. Không dừng giữa chừng.

NHIỆM VỤ: làm 1 video DỌC 1080x1920 NO-FACE tóm tắt video YouTube dài (60-90 giây, KHÔNG vượt 95s), xen 2-3 ĐOẠN THAO TÁC cắt từ chính video gốc, lưu vào video-projects/${slug}/renders/final.mp4.

NGUỒN: đọc video-projects/${slug}/assets/source.json — có url, videoId, title, thumb (đường dẫn thumbnail YouTube đã tải sẵn, có thể null), transcript (mảng {start giây, text}), groupUrl, groupName. Toàn bộ nội dung tóm tắt lấy từ transcript này, KHÔNG bịa số liệu.

CWD hiện tại = sandbox contentta-yt-summary (có node_modules, tools/, scripts/, skill/, .env OPENAI_API_KEY).

CÁC BƯỚC:
1. Scaffold: cp -r video-projects/scaffold-yt-summary/* video-projects/${slug}/ (project dir đã tồn tại, chứa assets/source.json + assets/media/thumb.jpg + build.log — GIỮ NGUYÊN 3 file đó, KHÔNG xoá/ghi đè). Xoá file mẫu (assets/vo-script.txt.example, assets/transcript-final.json.example). GIỮ compositions/ambient-bg.html + grain-overlay.html, assets/vendor, assets/base-vertical.css, assets/bg-vertical.png, assets/fonts, assets/emoji, hyperframes.json. mkdir -p assets/media renders/frames. KHÔNG có track music.
2. Viết 2 file script TÓM TẮT VIDEO từ transcript: assets/vo-script.txt (PHIÊN ÂM tên riêng tiếng Anh để TTS Việt đọc đúng: Claude->"Cờ lót", GitHub->"Gít Hấp", Contentta->"Còn Ten Ta"; GIỮ "AI") + assets/vo-script-display.txt (tên thật). 150-220 từ ~ 60-90s. Cấu trúc BẮT BUỘC:
   - Mở đầu (~6s, khớp scene h11 hiện thumbnail video gốc): câu 1 GIỚI THIỆU video dạng "Đây là video nói về <chủ đề cụ thể>", câu 2 nói vì sao đáng xem. KHÔNG mở bằng "Hôm nay", KHÔNG mở bằng số shock.
   - Câu chuyển sang tóm tắt: "Nội dung như sau" hoặc biến thể tự nhiên cùng nghĩa.
   - Thân: tóm tắt CÁC Ý CHÍNH cả video theo thứ tự, câu dẫn vào mỗi đoạn thao tác ("nhìn thử thao tác này").
   - Outro CTA.
   CTA CUỐI CỐ ĐỊNH, không có biến thể: câu chốt display = "Video đầy đủ mình để dưới bình luận, xem thử nha." (vo-script.txt phiên âm cho TTS). Short này chỉ để kéo người xem về video gốc: TUYỆT ĐỐI KHÔNG mời vào group, KHÔNG bảo comment keyword, KHÔNG hứa tặng tài liệu.
   Xưng "mình"/"bạn", thuần Việt câu ngắn, KHÔNG em-dash, KHÔNG mũi tên.
3. Chọn 2-3 ĐOẠN THAO TÁC từ transcript: đoạn đang demo màn hình/gõ lệnh/thao tác cụ thể (nhận biết qua lời thoại kiểu "mình bấm/gõ/chạy/các bạn nhìn"), mỗi đoạn 6-12 giây, TRỌN Ý. Ghi assets/segments.json: [{"start":<giây>,"end":<giây>,"label":"<nhãn ngắn>"}]. Tải từng đoạn: node "${tool("yt-clip.mjs")}" <videoId> <start> <end> video-projects/${slug}/assets/media/seg-1.mp4 (chạy từ CWD sandbox; videoId lấy trong source.json; cache đã có sẵn nên cắt rất nhanh).
4. TTS: cd video-projects/${slug}/assets && node "${tool("tts-vivibe.mjs")}" (giọng Vivibe). Check voice.mp3 ≤95s. Lỗi thì fallback node "${tool("tts-openai.mjs")}".
5. Transcribe: từ video-projects/${slug} chạy node "${tool("transcribe-openai.mjs")}" assets/voice.mp3.
6. Caption: viết assets/replacements.json (phiên âm -> tên thật) rồi node "${path.join(YT_SUMMARY_DIR, "scripts", "generate-captions.mjs")}" assets/transcript-final.json compositions/captions.html assets/replacements.json --theme ivory. Grep verify không leak phiên âm.
7. Build 5-7 scene bằng BỘ TEMPLATE HUMAN. ĐỌC TRƯỚC: "${TPL_HUMAN_DIR}/README.md" (11 template, hình học khung video h04, giới hạn ký tự, luật cứng).
   Mỗi scene: node "${tool("template-to-scene.mjs")}" "${TPL_HUMAN_DIR}/hXX-....html" compositions/sceneN-ten.html sN-ten <duration>
   SCENE 1 BẮT BUỘC h11-yt-thumb (hiện thumbnail video gốc, khớp câu mở "Đây là video nói về..."): sửa headline thành "Đây là video nói về <span class=\\"accent\\">chủ đề</span>" và .vtitle = title thật trong source.json (title dài quá 2 dòng thì rút gọn). Ảnh trong template là demo-assets/thumb.jpg, template-to-scene tự đổi thành assets/media/thumb.jpg. Nếu source.json có thumb = null thì dùng h01 thay.
   Chọn theo vai trò các scene sau: h03 liệt kê ý chính · h05 các bước · h06 con số · h07 quote · h08 trước/sau · h09 điều phải nhớ · h04 BẮT BUỘC bọc mỗi đoạn thao tác · h10 BẮT BUỘC scene cuối, CTA xem video gốc: GIỮ NGUYÊN headline "Xem bản đầy đủ?", nút "Xem video" và dòng .how "Link video ngay dưới bình luận"; chỉ được sửa .gsub cho khớp video (KHÔNG mời group, KHÔNG comment keyword).
   Sửa text từng scene theo lời thoại thật + canh data-start/data-duration theo mốc từ trong transcript-final.json. Scene h04 đặt ĐÚNG khoảng thời gian giọng đọc câu dẫn đoạn thao tác đó.
8. index.html: <head> load assets/fonts/brand-fonts.css + assets/base-vertical.css, body #FAF6EF. Track: ambient 0 · VIDEO THAO TÁC track 1 · scenes track 2 (tuần tự, TRỪ 0.02 data-duration mọi scene trừ scene cuối) · captions 3 · voice 4 · grain 99. Tổng data-duration = duration transcript (+~0.1).
   VIDEO TRACK: mỗi đoạn seg-N.mp4 là 1 <video id="seg-N" src="assets/media/seg-N.mp4" muted playsinline data-start="<mốc scene h04 tương ứng + 0.4>" data-duration="<ngắn hơn scene h04 ~0.8s>" data-track-index="1" data-width="936" data-height="527"> làm CON TRỰC TIẾP của #root. TUYỆT ĐỐI KHÔNG đặt data-composition-id lên <video> (hyperframes sẽ chờ timeline 45s rồi DROP). Thêm CSS trong index.html: video[id^="seg-"]{position:absolute;left:72px;top:700px;width:936px;height:527px;object-fit:cover;border-radius:14px;background:#17130D} — khớp từng pixel khung .vframe của h04 (x=72 y=700 936x527). muted BẮT BUỘC.
9. cd video-projects/${slug} && npx hyperframes lint -> npx hyperframes render --quality standard --gpu --browser-gpu --output renders/final.mp4.
   LỖI LINT font_family_without_font_face LÀ FALSE POSITIVE — bỏ qua, KHÔNG sửa gì. Font đã load qua <link href="assets/fonts/brand-fonts.css"> mà linter không đọc theo. TUYỆT ĐỐI KHÔNG tự thêm @font-face vào scene/captions: file woff2 kia là subset CHỈ CÓ LATIN, thêm @font-face không kèm unicode-range là nó chiếm hết dải Unicode, chữ "ề" vỡ thành "ê" + dấu huyền rời (đã dính lỗi này 2026-08-31). Các lỗi lint KHÁC thì phải sửa.
10. Viết assets/caption.txt: DÒNG ĐẦU = tiêu đề ngắn giật (dùng cho YouTube). Thân: hook + 3-5 dòng giá trị video + CTA khớp bước 2 (mời xem video đầy đủ, link dưới bình luận; KHÔNG mời group, KHÔNG comment keyword). TỐI ĐA 5 hashtag dòng cuối. KHÔNG em-dash.
11. Verify: extract 6-8 frame bằng ffmpeg VÀ ĐỌC ẢNH: nền kem, dấu tiếng Việt đúng, không tràn chữ, SCENE 1 HIỆN ĐÚNG THUMBNAIL (không phải ô đen), VIDEO THAO TÁC HIỆN ĐÚNG TRONG KHUNG h04 (không lệch, không đè chữ), scene h10 cuối đúng CTA. Lỗi -> fix -> re-render.

Khi xong, in DÒNG CUỐI: "DONE video-projects/${slug}/renders/final.mp4".`;
}

// Thumbnail YouTube cho scene mở đầu h11. maxres không phải video nào cũng có -> fallback hq.
async function saveThumbnail(videoId: string, dest: string): Promise<boolean> {
  for (const name of ["maxresdefault", "hqdefault"]) {
    try {
      const r = await fetch(`https://i.ytimg.com/vi/${videoId}/${name}.jpg`);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) continue;
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      return true;
    } catch {
      /* thử ảnh kế */
    }
  }
  return false;
}

// Enqueue build video dọc tóm tắt. Server đã fetch sẵn transcript + title + thumbnail, ghi
// source.json vào project dir TRƯỚC khi agent chạy (prompt dặn agent giữ nguyên khi scaffold).
export async function enqueueYtSummaryBuild(params: {
  url: string;
  videoId: string;
  title: string;
  transcript: { start: number; text: string }[];
  groupUrl?: string;
  groupName?: string;
}): Promise<{ slug: string }> {
  if ((process.env.DAILY_NEWS_BUILD_ENABLED || "").trim() !== "1") {
    throw new InvalidEditParamError("Tính năng build đang TẮT. Đặt DAILY_NEWS_BUILD_ENABLED=1 trong web/.env để bật.");
  }
  const slug = assertSlug(`ys-${Date.now()}`, "slug");
  const projDir = dnProjectDir(slug);
  const groupUrl = (params.groupUrl || "https://www.facebook.com/groups/aiauacademy").trim();
  const groupName = (params.groupName || "AI Automation Academy").trim();
  await fs.mkdir(path.join(projDir, "assets"), { recursive: true });
  const hasThumb = await saveThumbnail(params.videoId, path.join(projDir, "assets", "media", "thumb.jpg"));
  await fs.writeFile(
    path.join(projDir, "assets", "source.json"),
    JSON.stringify(
      {
        url: params.url,
        videoId: params.videoId,
        title: params.title,
        thumb: hasThumb ? "assets/media/thumb.jpg" : null,
        groupUrl,
        groupName,
        transcript: params.transcript,
      },
      null,
      2
    ),
    "utf8"
  );
  writeJob({ slug, topic: params.title, keyword: "", queuedAt: Date.now(), url: params.url, groupUrl, groupName });
  tickQueue();
  return { slug };
}

export function getJob(slug: string): DnJob | null {
  assertSlug(slug, "slug");
  return readJob(slug);
}

// Route /edit/youtube gắn itemId sau khi tạo item short từ final.mp4 (idempotency marker).
export function attachJobItem(slug: string, itemId: string): void {
  const j = readJob(assertSlug(slug, "slug"));
  if (j) writeJob({ ...j, itemId });
}

export function ytSummaryProjectDir(slug: string): string {
  return dnProjectDir(assertSlug(slug, "slug"));
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

  const isYs = job.slug.startsWith("ys-");
  const sandboxDir = isYs ? YT_SUMMARY_DIR : DAILY_NEWS_DIR;
  const prompt = isYs ? buildYtSummaryPrompt(job) : buildDailyNewsPrompt(job.topic, job.slug, job.keyword);
  // KHÔNG dùng fd + detached: trên Windows (shell:true → cmd.exe) file descriptor không truyền
  // tới process claude khi detached → log rỗng, agent không chạy, build treo tới timeout ("lỗi").
  // Dùng pipe + event handler ghi log; child gắn theo vòng đời server (đủ cho tool local).
  const child = spawn(
    "claude",
    ["-p", "--model", BUILD_MODEL, "--permission-mode", "bypassPermissions",
     "--output-format", "stream-json", "--verbose", "--add-dir", sandboxDir],
    { cwd: sandboxDir, shell: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"] }
  );
  if (child.pid) writeJob({ ...started, pid: child.pid });
  child.stdout?.on("data", (d) => { try { fsSync.appendFileSync(logPath, d.toString()); } catch {} });
  child.stderr?.on("data", (d) => { try { fsSync.appendFileSync(logPath, d.toString()); } catch {} });
  child.on("error", (e) => finish(`\n[spawn error] ${e.message}\n`, -1));
  child.on("exit", (code) => finish("", code ?? -1));
  child.stdin?.write(prompt);
  child.stdin?.end();
}

export type DailyNewsState = "queued" | "running" | "done" | "published" | "failed";

export type DailyNewsBuild = {
  slug: string;
  state: DailyNewsState;
  logTail: string;
  hasVideo: boolean;
  caption: string | null;
  failReason: string | null;
  topic: string;
  keyword: string;
  publishedAt: number | null;
};

// Job cũ (trước khi có _jobs/) không có metadata — chúng đều đã kết thúc từ lâu,
// nên chỉ cần nhìn có final.mp4 hay không.
function stateOf(job: DnJob | null, hasVideo: boolean): DailyNewsState {
  if (hasVideo) return job?.publishedAt ? "published" : "done";
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
    publishedAt: job?.publishedAt || null,
  };
}

// Đánh dấu đã đăng / bỏ đánh dấu (tay, cho video đăng ngoài app hoặc bấm nhầm).
// Project cũ chưa có file job thì tạo mới tối thiểu để ghi được mốc.
export function setDailyNewsPublished(slug: string, published: boolean): void {
  assertSlug(slug, "slug");
  const cur = readJob(slug) || { slug, topic: "", keyword: "", queuedAt: Number(slug.slice(3)) || Date.now() };
  const job: DnJob = { ...cur };
  if (published) job.publishedAt = Date.now();
  else { delete job.publishedAt; delete job.platforms; }
  writeJob(job);
}

export type DailyNewsJobRow = {
  slug: string;
  topic: string;
  keyword: string;
  state: DailyNewsState;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  publishedAt?: number;
};

// Gộp job có metadata với project cũ chỉ còn thư mục (slug dn-<ms> đã mang sẵn mốc thời gian).
// prefix tách 2 loại job dùng chung hàng đợi: "dn-" cho trang daily-news, "ys-" cho /edit/youtube.
export async function listDailyNewsJobs(limit = 10, prefix: "dn-" | "ys-" = "dn-"): Promise<DailyNewsJobRow[]> {
  const bySlug = new Map<string, DnJob>();
  const withMeta = new Set<string>();
  for (const j of readAllJobs()) {
    if (!j.slug.startsWith(prefix)) continue;
    bySlug.set(j.slug, j);
    withMeta.add(j.slug);
  }
  try {
    const entries = await fs.readdir(prefix === "ys-" ? YS_PROJECTS : DN_PROJECTS, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith(prefix) || !/^\w+-\d+$/.test(e.name) || bySlug.has(e.name)) continue;
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
      publishedAt: j.publishedAt,
    });
  }
  // limit chỉ cắt mục đã đăng + lỗi: video chưa đăng (và job đang chờ/chạy) phải hiện đủ
  // để Thanh đăng dần.
  rows.sort((a, b) => b.queuedAt - a.queuedAt);
  let settled = 0;
  return rows.filter((r) => (r.state !== "published" && r.state !== "failed") || settled++ < limit);
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

  // Ít nhất 1 nền tảng nhận bài (ok hoặc pending/hẹn lịch) → ghi mốc đã đăng vào job.
  const okPlats = plats.filter((p) => {
    const st = (result[p] as { status?: string } | undefined)?.status;
    return st === "ok" || st === "pending";
  });
  if (okPlats.length) {
    const cur = readJob(slug) || { slug, topic: "", keyword: "", queuedAt: Number(slug.slice(3)) || Date.now() };
    writeJob({ ...cur, publishedAt: Date.now(), platforms: okPlats });
  }
  return result;
}
