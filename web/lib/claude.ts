import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT, SYSTEM_DIR } from "./paths";

async function readSafe(p: string): Promise<string> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

// Gọi claude CLI headless (dùng subscription, không tốn API). web=true bật WebSearch/WebFetch.
// --settings ép outputStyle "default": nếu không, subprocess ăn theo outputStyle account
// (vd "Explanatory") → nội dung lẫn khối "✶ Insight ──" vào giữa caption/post đăng thật.
const HEADLESS_SETTINGS = path.join(REPO_ROOT, "web", "lib", "headless-claude-settings.json");
function runClaude(prompt: string, web = false, timeoutMs?: number): Promise<string> {
  const limit = timeoutMs ?? (web ? 290_000 : 180_000);
  return new Promise((resolve, reject) => {
    // shell:true trên Windows chỉ join args bằng space, không tự quote — path REPO_ROOT
    // có space ("CONTENTTA AGENCY") nên phải tự bọc "" mới không bị cmd cắt giữa chừng.
    const args = ["-p", "--output-format", "text", "--settings", `"${HEADLESS_SETTINGS}"`];
    if (web) args.push("--allowedTools", "WebSearch,WebFetch,Read");
    const child = spawn("claude", args, {
      cwd: REPO_ROOT,
      shell: true,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude -p timeout (${Math.round(limit / 1000)}s)`));
    }, limit);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude exit ${code}: ${err.slice(0, 400)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export type GenerateInput = {
  type: "youtube" | "short" | "post";
  content_type: "nhan-tai-lieu" | "chia-se-kien-thuc";
  topic: string;
  notes?: string;
};

const CT_LABEL: Record<string, string> = {
  "nhan-tai-lieu": "Nhận tài liệu (lead magnet — comment keyword + follow để nhận)",
  "chia-se-kien-thuc": "Chia sẻ kiến thức nhanh (kể 1 trải nghiệm/quy trình mình làm)",
};

async function buildContext(type: string): Promise<string> {
  const biz = await readSafe(path.join(SYSTEM_DIR, "business-context.md"));
  const patterns = await readSafe(path.join(SYSTEM_DIR, "skills", "writing-patterns.md"));
  const tmplFile =
    type === "youtube" ? "long-video-template.md" : "post-templates.md";
  const tmpl = await readSafe(path.join(SYSTEM_DIR, "templates", tmplFile));
  return [
    "# BUSINESS CONTEXT\n" + biz,
    "# WRITING PATTERNS\n" + patterns,
    "# TEMPLATE\n" + tmpl,
  ].join("\n\n---\n\n");
}

export async function generate(input: GenerateInput): Promise<{ body: string }> {
  const ctx = await buildContext(input.type);
  const ctLabel = CT_LABEL[input.content_type] || input.content_type;

  let task: string;
  if (input.type === "youtube") {
    task = `NHIỆM VỤ: Viết SƯỜN BÀI cho video YouTube dài (20-25 phút) theo template. KHÔNG viết word-for-word.
Loại content: ${ctLabel}
Chủ đề: ${input.topic}
${input.notes ? "Ghi chú: " + input.notes : ""}

CẤU TRÚC BẮT BUỘC, theo đúng thứ tự:
1. "## Title đề xuất": 5 title, mỗi title 1 dòng trần. KHÔNG breakdown, KHÔNG angle, KHÔNG đếm ký tự, KHÔNG recommend.
2. "## HOOK (20-60s)": VIẾT ĐỦ CÂU. First line chọn 1 kiểu (câu hỏi / tuyên bố sốc / kể chuyện / preview / kết nối cá nhân / số liệu / thách thức / trích dẫn / ví von / bằng chứng). Rồi introduction làm đủ 3 việc: bối cảnh, stakes (không nắm chỗ này thì hỏng cái gì), payoff. Trả lời hết câu hỏi mà title đặt ra nhưng VIẾT LIỀN MẠCH, KHÔNG đánh số "Câu một, câu hai", KHÔNG mở kiểu "mình đi qua ba thứ". Cắm 1 chi tiết cụ thể kiểm chứng được để gây chú ý. Chốt payoff bằng con số cấu trúc ("gói hết vào bốn thứ"). Không câu chào, không jargon, ngôn ngữ mức lớp 5.
3. "OPEN LOOP sang Ý N" trước mỗi ý: VIẾT ĐỦ CÂU, xây tò mò để ý sắp tới nghe quan trọng hơn ý vừa xong.
4. "## Ý N - <tên>": BULLET, mỗi dòng 1 ý, có số liệu thật. Viết bullet bằng cách tự hỏi người xem sẽ có câu hỏi gì ở mục này. Cắm marker [SLIDE 02], [DEMO: ...] inline trong bullet, slide đánh số tăng dần. Kết mỗi ý bằng 1 dòng "Chốt: ...".
5. "## RECAP": bullet.
6. "## OUTRO + CTA": VIẾT ĐỦ CÂU theo framework Hook, Curiosity, Action. Luôn CTA sang 1 video khác. KHÔNG "like và subscribe", KHÔNG tóm tắt lại nội dung, KHÔNG câu hỏi engagement-bait.
7. "## YOUTUBE DESCRIPTION": footer block ở ĐẦU (copy nguyên xi từ template), rồi 1-2 câu tóm tắt video, rồi timestamps, rồi tags. KHÔNG viết bullet dài kiểu "Bạn sẽ biết:".

KHÔNG tạo mục PROMISE riêng. KHÔNG tạo mục GHI CHÚ SẢN XUẤT ở cuối file.
Xưng "mình"/"bạn", gọi model là "con model"/"con agent". Tuyệt đối không dùng ký tự em-dash hay mũi tên.

Chỉ trả về nội dung Markdown hoàn chỉnh. Không dùng tool, không hỏi lại, không thêm lời dẫn.`;
  } else if (input.type === "short") {
    task = `NHIỆM VỤ: Viết script video ngắn (60-90 giây) — viết như lời nói tự nhiên để quay, KHÔNG timestamp/B-roll.
Loại content: ${ctLabel}
Chủ đề: ${input.topic}
${input.notes ? "Ghi chú: " + input.notes : ""}

YÊU CẦU:
- Đúng voice Thanh: xưng "mình"/"bạn", câu ngắn, nói tự nhiên như đang quay.
- Hook 1 câu mạnh ở đầu → nội dung → CTA.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait.

Chỉ trả về nội dung script. Không dùng tool, không hỏi lại, không thêm lời dẫn.`;
  } else {
    task = `NHIỆM VỤ: Viết 1 bài post (text để đăng).
Loại content: ${ctLabel}
Chủ đề: ${input.topic}
${input.notes ? "Ghi chú: " + input.notes : ""}

YÊU CẦU:
- Đúng voice Thanh: xưng "mình"/"bạn", câu ngắn, xuống dòng nhiều, số liệu thật.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait.

Chỉ trả về nội dung. Không dùng tool, không hỏi lại, không thêm lời dẫn.`;
  }

  const prompt = `${ctx}\n\n========================\n\n${task}`;
  const raw = await runClaude(prompt);

  return { body: raw.trim() };
}

// Post từ video YouTube: tóm tắt/chia sẻ nội dung video, cuối bài là link video.
export async function generateYouTubePost(input: {
  title: string;
  transcript: string;
  url: string;
}): Promise<{ body: string }> {
  const ctx = await buildContext("post");
  const task = `NHIỆM VỤ: Viết 1 bài post chia sẻ nội dung video YouTube "${input.title}" dựa trên transcript bên dưới.

YÊU CẦU:
- Đúng voice Thanh: xưng "mình"/"bạn", câu ngắn, xuống dòng nhiều.
- Rút ý hay nhất của video, kể lại theo góc nhìn của mình — KHÔNG dịch máy.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait.
- DÒNG CUỐI bài post in đúng: ${input.url}

Chỉ trả về nội dung. Không dùng tool, không hỏi lại, không thêm lời dẫn.

TRANSCRIPT:
${input.transcript.slice(0, 14000)}`;
  const raw = await runClaude(`${ctx}\n\n========================\n\n${task}`);
  return { body: raw.trim() };
}

const CLIP_MARK = "===CLIP===";

export type ClipPick = { start: number; end: number; reason?: string };

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? `${h}:` : "") + `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Transcript 1h30 quá dài cho 1 prompt → giữ đều đầu + giữa + cuối để bài post vẫn tổng hợp cả video.
function sampleTimed(lines: { start: number; text: string }[], budget = 60_000): string {
  const all = lines.map((l) => `[${fmtTime(l.start)}] ${l.text}`);
  const full = all.join("\n");
  if (full.length <= budget) return full;
  const third = Math.floor(budget / 3);
  const pick = (arr: string[], limit: number) => {
    const out: string[] = [];
    let n = 0;
    for (const s of arr) {
      if (n + s.length + 1 > limit) break;
      out.push(s);
      n += s.length + 1;
    }
    return out.join("\n");
  };
  const midStart = Math.floor(all.length / 2);
  return [
    pick(all, third),
    "[... lược bớt ...]",
    pick(all.slice(midStart), third),
    "[... lược bớt ...]",
    pick(all.slice().reverse(), third).split("\n").reverse().join("\n"),
  ].join("\n");
}

// YouTube dài → 1 bài post duy nhất dùng cho cả LinkedIn lẫn Threads (CTA "video dưới comment")
// + clip đăng kèm LUÔN cắt từ giây 0, AI chỉ chọn điểm dừng (60-180s).
export async function generateYouTubeVideoPost(input: {
  title: string;
  timed: { start: number; text: string }[];
  url: string;
}): Promise<{ body: string; clip: ClipPick | null }> {
  const ctx = await buildContext("post");
  const durSec = input.timed.length ? input.timed[input.timed.length - 1].start : 0;
  const task = `NHIỆM VỤ: Từ transcript (kèm mốc thời gian) của video YouTube "${input.title}" (dài ${fmtTime(durSec)}), làm 2 việc:

1. Viết 1 bài post TỔNG HỢP TOÀN BỘ nội dung video, đủ các phần chính từ đầu đến cuối, không chỉ mở bài. Rút ý theo góc nhìn của mình, có số liệu thật từ transcript.
2. Chọn ĐIỂM DỪNG cho đoạn MỞ ĐẦU video để cắt đăng kèm bài.

YÊU CẦU BÀI POST:
- Đúng voice Thanh: xưng "mình"/"bạn", câu ngắn, xuống dòng nhiều.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait, KHÔNG em-dash, KHÔNG mũi tên.
- KHÔNG chứa link nào trong bài.
- CÂU CUỐI bài in đúng: "Video đầy đủ mình để dưới comment."

CHỌN ĐOẠN CẮT: clip LUÔN bắt đầu từ giây 0 (đoạn mở đầu video). Việc của bạn là chọn ĐIỂM DỪNG. Sau bài post, in đúng dòng "${CLIP_MARK}" rồi 1 JSON duy nhất dạng {"end": <giây>, "reason": "<1 câu vì sao dừng ở đó>"}. Điểm dừng phải rơi vào chỗ CÂU NÓI ĐÃ TRỌN Ý và người xem đang tò mò muốn xem tiếp, KHÔNG cắt giữa câu. Dài 60-180 giây tính từ giây 0. end tính bằng giây, khớp mốc [h:mm:ss] trong transcript.

Chỉ trả về nội dung. Không dùng tool, không hỏi lại, không thêm lời dẫn.

TRANSCRIPT (mỗi dòng có mốc thời gian):
${sampleTimed(input.timed)}`;
  const raw = await runClaude(`${ctx}\n\n========================\n\n${task}`, false, 420_000);

  let rest = raw;
  let clip: ClipPick | null = null;
  if (rest.includes(CLIP_MARK)) {
    const [before, after] = rest.split(CLIP_MARK);
    rest = before;
    const m = after.match(/\{[\s\S]*?\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]) as { end?: number; reason?: string };
        const end = Math.min(Math.max(Number(j.end), 60), 180);
        if (Number.isFinite(end)) clip = { start: 0, end, reason: j.reason };
      } catch {
        /* AI trả JSON hỏng → bỏ clip, post vẫn dùng được */
      }
    }
  }
  return { body: rest.trim(), clip };
}

// Post chia sẻ kiến thức + CTA comment keyword nhận tài liệu. source = text có sẵn; url lạ → claude tự đọc web.
// Sinh caption đăng Facebook cho video daily-news từ script (vo-script-display.txt).
export async function generateVideoCaption(script: string): Promise<string> {
  const ctx = await buildContext("post");
  const task = `NHIỆM VỤ: Từ SCRIPT video no-face bên dưới, viết CAPTION đăng Facebook cho video đó.

YÊU CẦU:
- Đúng voice Thanh: xưng "mình"/"bạn", câu ngắn, xuống dòng thoáng.
- DÒNG ĐẦU = tiêu đề ngắn giật (1 câu, không hashtag).
- Thân bài: hook + tóm tắt giá trị video, vài dòng.
- KHÔNG intro form "Không phải X...", KHÔNG kết bằng câu hỏi engagement-bait.
- KHÔNG dùng dấu gạch ngang dài, KHÔNG dùng emoji.
- Kết bằng câu CTA: "Theo dõi Contentta để cập nhật tin AI mỗi ngày."
- DÒNG CUỐI: tối đa 5 hashtag ngắn, cách nhau bằng khoảng trắng.

Chỉ trả về caption. Không dùng tool. Không hỏi lại, không thêm lời dẫn.

SCRIPT:
${script.slice(0, 6000)}`;
  const raw = await runClaude(`${ctx}\n\n========================\n\n${task}`, false);
  return raw.trim();
}

export async function generateSharePost(input: {
  source?: string;
  url?: string;
  keyword?: string;
}): Promise<{ body: string }> {
  const ctx = await buildContext("post");
  const useWeb = Boolean(input.url && !input.source);
  const kw = (input.keyword || "").trim();
  const ctaLine = kw ? `\n- CTA cuối bài: comment "${kw}" để nhận tài liệu.` : "";
  const task = `NHIỆM VỤ: Viết 1 bài post chia sẻ kiến thức (lead magnet) từ thông tin nguồn bên dưới.

YÊU CẦU:
- Đúng voice Thanh: xưng "mình"/"bạn", câu ngắn, xuống dòng nhiều.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait.${ctaLine}

Chỉ trả về nội dung.${useWeb ? " Dùng WebFetch đọc link nguồn trước khi viết." : " Không dùng tool."} Không hỏi lại, không thêm lời dẫn.

NGUỒN:
${input.source ? input.source.slice(0, 14000) : input.url}`;
  const raw = await runClaude(`${ctx}\n\n========================\n\n${task}`, useWeb);
  return { body: raw.trim() };
}
