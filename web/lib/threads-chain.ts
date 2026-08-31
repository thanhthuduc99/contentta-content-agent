// Chia text thành chuỗi mắt xích cho Threads (mỗi post tối đa 500 ký tự).
// Dùng chung server (zernio-publish) + client (editor preview) nên KHÔNG import node ở đây.
// Zernio không kiểm độ dài từng threadItem, quá 500 là fail lúc đăng thật → phải cắt ở đây.
export const THREADS_MAX = 500;

const MANUAL_BREAK = /^\s*---\s*$/m;
const SENTENCE_END = /(?<=[.!?…])\s+/;

// Gom tham lam các mảnh vào 1 mắt xích, nối lại bằng sep. Mảnh nào tự nó đã dài quá thì
// đẩy xuống mức cắt nhỏ hơn (đoạn → dòng → câu → cắt cứng).
function pack(parts: string[], sep: string, max: number, next: (s: string) => string[]): string[] {
  const out: string[] = [];
  let cur = "";
  for (const raw of parts) {
    const piece = raw.trim();
    if (!piece) continue;
    if (piece.length > max) {
      if (cur) out.push(cur);
      cur = "";
      out.push(...next(piece));
      continue;
    }
    const merged = cur ? cur + sep + piece : piece;
    if (merged.length <= max) cur = merged;
    else {
      if (cur) out.push(cur);
      cur = piece;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Câu dài hơn cả mắt xích → cắt ở khoảng trắng cuối cùng trước max, bí quá thì cắt cứng.
function hardWrap(s: string, max: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    const cut = rest.slice(0, max).lastIndexOf(" ");
    const at = cut > max / 2 ? cut : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// Giữ xuống dòng đơn (bài của Thanh hay viết mỗi ý 1 dòng) nên cắt theo bậc: đoạn → dòng → câu.
function chunk(text: string, max: number): string[] {
  return pack(text.split(/\n{2,}/), "\n\n", max, (para) =>
    pack(para.split("\n"), "\n", max, (line) =>
      pack(line.split(SENTENCE_END), " ", max, (sent) => hardWrap(sent, max))
    )
  );
}

export function splitThreads(text: string, max = THREADS_MAX): string[] {
  const full = (text || "").trim();
  if (!full) return [];

  const out: string[] = [];
  // Dòng chỉ có "---" = chỗ ép ngắt tay, phần còn lại để bộ cắt tự lo.
  for (const block of full.split(MANUAL_BREAK)) {
    const b = block.trim();
    if (!b) continue;
    if (b.length <= max) out.push(b);
    else out.push(...chunk(b, max));
  }
  return out.length ? out : [full.slice(0, max)];
}
