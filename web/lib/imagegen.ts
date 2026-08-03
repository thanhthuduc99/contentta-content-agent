import "./env";
import { spawn } from "node:child_process";
import { REPO_ROOT } from "./paths";
import {
  renderThumbnail,
  renderSingle,
  renderSlide,
  type ThumbSpec,
  type SingleSpec,
  type Slide,
} from "./render";

export type ImageItem = {
  type?: string; // youtube | short | post
  content_type?: string; // nhan-tai-lieu | chia-se-kien-thuc
  topic?: string;
  body?: string;
};

export type GenResult = {
  kind: "thumbnail" | "single" | "carousel";
  buffers: Buffer[];
};

// Gọi claude -p headless (subscription, không tốn API).
function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "text"], { cwd: REPO_ROOT, shell: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("claude -p timeout"));
    }, 150_000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out.trim()) : reject(new Error(`claude exit ${code}: ${err.slice(0, 300)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function extractJson<T>(raw: string): T {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude không trả JSON hợp lệ");
  return JSON.parse(m[0]) as T;
}

const BRAND = `Thương hiệu ${(process.env.BRAND_NAME || "của người dùng").trim()}. Bám BUSINESS CONTEXT và VOICE PROFILE; tiếng Việt có dấu, câu ngắn.`;

function excerpt(body?: string): string {
  return (body || "").replace(/^---[\s\S]*?---/, "").trim().slice(0, 1600);
}

async function thumbSpec(item: ImageItem): Promise<ThumbSpec> {
  const prompt = `${BRAND}
Tạo SPEC cho 1 thumbnail YouTube từ bài dưới. CHỈ trả JSON:
{"badge": "...", "line1": "...", "accentWord": "...", "line2": "", "sub": "..."}
- badge: nhãn ngắn (vd "Tự động hoá 2026"), <= 22 ký tự.
- line1 + accentWord (+ line2 nếu cần): ghép thành tiêu đề thumbnail RẤT NGẮN, mỗi dòng 1-3 từ, tổng <= 6 từ. accentWord = cụm nổi bật nhất (sẽ tô đỏ, IN HOA).
- sub: 1 câu ngắn <= 40 ký tự.
Tiếng Việt có dấu. Không markdown, chỉ JSON.

CHỦ ĐỀ: ${item.topic || ""}
NỘI DUNG: ${excerpt(item.body)}`;
  return extractJson<ThumbSpec>(await runClaude(prompt));
}

async function singleSpec(item: ImageItem): Promise<SingleSpec> {
  const prompt = `${BRAND}
Tạo SPEC cho 1 ảnh "nhận tài liệu" (lead magnet) từ bài. CHỈ trả JSON:
{"title": "...", "subtitle": "...", "keyword": "...", "cta": ""}
- title: hook ngắn mạnh về tài liệu/kết quả nhận được (<= 9 từ).
- subtitle: 1-2 câu giá trị tài liệu.
- keyword: 1 từ IN HOA để người ta comment (vd "TAILIEU", "EDIT").
- cta: để "" (hệ thống tự ghép "Comment ... + follow").
Tiếng Việt có dấu. Chỉ JSON.

CHỦ ĐỀ: ${item.topic || ""}
NỘI DUNG: ${excerpt(item.body)}`;
  return extractJson<SingleSpec>(await runClaude(prompt));
}

async function carouselSpec(item: ImageItem): Promise<Slide[]> {
  const prompt = `${BRAND}
Tạo SPEC carousel (4-7 slide) từ bài "chia sẻ kiến thức". CHỈ trả JSON:
{"slides":[{"kind":"cover","title":"...","accent":"...","body":"..."},{"kind":"point","title":"...","body":"..."},...,{"kind":"cta","title":"...","accent":"...","body":"..."}]}

Quy tắc THIẾT KẾ (chữ sẽ to, phải ngắn):
- cover: title <= 6 từ, mạnh (vd "Việc cần làm sau khi build xong"). accent = 1-3 từ trong title sẽ được tô GRADIENT (cụm nhấn mạnh nhất, vd "build xong"). body = 1 câu phụ <= 10 từ.
- point: title <= 6 từ, tên/ý rõ ràng. body = 1 câu <= 15 từ, súc tích. (point không cần accent.)
- cta: title = 1 câu hỏi/kêu gọi <= 6 từ (vd "Muốn full hệ thống?"). accent = cụm nhấn (vd "full hệ thống"). body = 1 câu lead-in ngắn.
- accent PHẢI là cụm con xuất hiện y nguyên trong title. Tổng 4-7 slide. Tiếng Việt có dấu, KHÔNG dùng em-dash hay ký tự mũi tên. Chỉ JSON.

CHỦ ĐỀ: ${item.topic || ""}
NỘI DUNG: ${excerpt(item.body)}`;
  const data = extractJson<{ slides: Slide[] }>(await runClaude(prompt));
  const slides = (data.slides || []).filter((s) => s && s.title).slice(0, 7);
  if (slides.length < 2) throw new Error("Carousel spec quá ít slide");
  return slides;
}

export async function generateImages(item: ImageItem): Promise<GenResult> {
  if (item.type === "youtube") {
    return { kind: "thumbnail", buffers: [await renderThumbnail(await thumbSpec(item))] };
  }
  if (item.content_type === "nhan-tai-lieu") {
    return { kind: "single", buffers: [await renderSingle(await singleSpec(item))] };
  }
  // mặc định loại 2 = carousel
  const slides = await carouselSpec(item);
  const buffers: Buffer[] = [];
  for (let i = 0; i < slides.length; i++) {
    buffers.push(await renderSlide(slides[i], i + 1, slides.length));
  }
  return { kind: "carousel", buffers };
}
