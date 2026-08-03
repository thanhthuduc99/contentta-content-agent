import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT, SYSTEM_DIR } from "./paths";

const THREADS_MARK = "===THREADS===";

async function readSafe(p: string): Promise<string> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

// Gọi claude CLI headless (dùng subscription, không tốn API). web=true bật WebSearch/WebFetch.
function runClaude(prompt: string, web = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "text"];
    if (web) args.push("--allowedTools", "WebSearch,WebFetch,Read");
    const child = spawn("claude", args, {
      cwd: REPO_ROOT,
      shell: true,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude -p timeout (${web ? 290 : 180}s)`));
    }, web ? 290_000 : 180_000);
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
  const voice = await readSafe(path.join(SYSTEM_DIR, "voice-profile.md"));
  const biz = await readSafe(path.join(SYSTEM_DIR, "business-context.md"));
  const patterns = await readSafe(path.join(SYSTEM_DIR, "skills", "writing-patterns.md"));
  const tmplFile =
    type === "youtube" ? "long-video-template.md" : "post-templates.md";
  const tmpl = await readSafe(path.join(SYSTEM_DIR, "templates", tmplFile));
  return [
    "# VOICE PROFILE\n" + voice,
    "# BUSINESS CONTEXT\n" + biz,
    "# WRITING PATTERNS\n" + patterns,
    "# TEMPLATE\n" + tmpl,
  ].join("\n\n---\n\n");
}

export async function generate(input: GenerateInput): Promise<{
  body: string;
  threads?: string;
}> {
  const ctx = await buildContext(input.type);
  const ctLabel = CT_LABEL[input.content_type] || input.content_type;

  let task: string;
  if (input.type === "youtube") {
    task = `NHIỆM VỤ: Viết kịch bản video YouTube dài (20-25 phút) theo template.
Loại content: ${ctLabel}
Chủ đề: ${input.topic}
${input.notes ? "Ghi chú: " + input.notes : ""}

BẮT BUỘC theo template:
- Mở đầu bằng 5 title vidIQ-style + breakdown + recommend Top 2.
- Intro hook tự nhiên (KHÔNG dùng form "Không phải X. Không phải Y. Chỉ Z.").
- Đầy đủ sections, recap, outro (KHÔNG câu hỏi engagement-bait).
- YouTube Description: footer block ở ĐẦU (copy nguyên xi từ template) + title + timestamps + tags.

Chỉ trả về nội dung Markdown hoàn chỉnh. Không dùng tool, không hỏi lại, không thêm lời dẫn.`;
  } else if (input.type === "short") {
    task = `NHIỆM VỤ: Viết script video ngắn (60-90 giây) — viết như lời nói tự nhiên để quay, KHÔNG timestamp/B-roll.
Loại content: ${ctLabel}
Chủ đề: ${input.topic}
${input.notes ? "Ghi chú: " + input.notes : ""}

YÊU CẦU:
- Bám đúng VOICE PROFILE phía trên; câu ngắn, nói tự nhiên như đang quay.
- Hook 1 câu mạnh ở đầu → nội dung → CTA.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait.

Chỉ trả về nội dung script. Không dùng tool, không hỏi lại, không thêm lời dẫn.`;
  } else {
    task = `NHIỆM VỤ: Viết 1 bài post (text để đăng).
Loại content: ${ctLabel}
Chủ đề: ${input.topic}
${input.notes ? "Ghi chú: " + input.notes : ""}

YÊU CẦU:
- Bám đúng VOICE PROFILE phía trên; câu ngắn, xuống dòng nhiều, chỉ dùng số liệu có nguồn.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait.
- Sau bài post chính, in đúng dòng "${THREADS_MARK}" rồi viết bản Threads (≤500 ký tự, không hashtag).

Chỉ trả về nội dung. Không dùng tool, không hỏi lại, không thêm lời dẫn.`;
  }

  const prompt = `${ctx}\n\n========================\n\n${task}`;
  const raw = await runClaude(prompt);

  if (input.type === "post" && raw.includes(THREADS_MARK)) {
    const [body, threads] = raw.split(THREADS_MARK);
    return { body: body.trim(), threads: threads.trim() };
  }
  return { body: raw };
}

function splitThreads(raw: string): { body: string; threads?: string } {
  if (raw.includes(THREADS_MARK)) {
    const [body, threads] = raw.split(THREADS_MARK);
    return { body: body.trim(), threads: threads.trim() };
  }
  return { body: raw.trim() };
}

// Post từ video YouTube: tóm tắt/chia sẻ nội dung video, cuối bài là link video.
export async function generateYouTubePost(input: {
  title: string;
  transcript: string;
  url: string;
}): Promise<{ body: string; threads?: string }> {
  const ctx = await buildContext("post");
  const task = `NHIỆM VỤ: Viết 1 bài post chia sẻ nội dung video YouTube "${input.title}" dựa trên transcript bên dưới.

YÊU CẦU:
- Bám đúng VOICE PROFILE phía trên; câu ngắn, xuống dòng nhiều.
- Rút ý hay nhất của video, kể lại theo góc nhìn của mình — KHÔNG dịch máy.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait.
- DÒNG CUỐI bài post in đúng: ${input.url}
- Sau bài post chính, in đúng dòng "${THREADS_MARK}" rồi viết bản Threads (≤500 ký tự, không hashtag, vẫn có link video ở cuối).

Chỉ trả về nội dung. Không dùng tool, không hỏi lại, không thêm lời dẫn.

TRANSCRIPT:
${input.transcript.slice(0, 14000)}`;
  const raw = await runClaude(`${ctx}\n\n========================\n\n${task}`);
  return splitThreads(raw);
}

// Post chia sẻ kiến thức + CTA comment keyword nhận tài liệu. source = text có sẵn; url lạ → claude tự đọc web.
// Sinh caption đăng Facebook cho video daily-news từ script (vo-script-display.txt).
export async function generateVideoCaption(script: string): Promise<string> {
  const ctx = await buildContext("post");
  const task = `NHIỆM VỤ: Từ SCRIPT video no-face bên dưới, viết CAPTION đăng Facebook cho video đó.

YÊU CẦU:
- Bám đúng VOICE PROFILE phía trên; câu ngắn, xuống dòng thoáng.
- DÒNG ĐẦU = tiêu đề ngắn giật (1 câu, không hashtag).
- Thân bài: hook + tóm tắt giá trị video, vài dòng.
- KHÔNG intro form "Không phải X...", KHÔNG kết bằng câu hỏi engagement-bait.
- KHÔNG dùng dấu gạch ngang dài, KHÔNG dùng emoji.
- Kết bằng CTA phù hợp với BUSINESS CONTEXT phía trên.
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
}): Promise<{ body: string; threads?: string }> {
  const ctx = await buildContext("post");
  const useWeb = Boolean(input.url && !input.source);
  const kw = (input.keyword || "").trim();
  const ctaLine = kw ? `\n- CTA cuối bài: comment "${kw}" để nhận tài liệu.` : "";
  const task = `NHIỆM VỤ: Viết 1 bài post chia sẻ kiến thức (lead magnet) từ thông tin nguồn bên dưới.

YÊU CẦU:
- Bám đúng VOICE PROFILE phía trên; câu ngắn, xuống dòng nhiều.
- KHÔNG intro form "Không phải X…", KHÔNG kết bằng câu hỏi engagement-bait.${ctaLine}
- Sau bài post chính, in đúng dòng "${THREADS_MARK}" rồi viết bản Threads (≤500 ký tự, không hashtag).

Chỉ trả về nội dung.${useWeb ? " Dùng WebFetch đọc link nguồn trước khi viết." : " Không dùng tool."} Không hỏi lại, không thêm lời dẫn.

NGUỒN:
${input.source ? input.source.slice(0, 14000) : input.url}`;
  const raw = await runClaude(`${ctx}\n\n========================\n\n${task}`, useWeb);
  return splitThreads(raw);
}
