// Keyword comment-to-DM cho video daily-news. Dùng chung server (edit.ts) và client
// (form /edit/daily-news prefill) nên file này phải thuần, không import node:*.
//
// Keyword phải chốt TRƯỚC khi render vì nó hiện trên màn hình trong scene CTA
// (v15-follow-comment) và phải khớp đúng chữ dùng làm rule Zernio lúc đăng.

// .headline.xl của template đo thật 22 ký tự/dòng, headline v15 là "Comment " + keyword.
export const KEYWORD_MAX = 14;
const KEYWORD_RE = new RegExp(`^[a-z0-9]{2,${KEYWORD_MAX}}$`);

export function isValidKeyword(k: string): boolean {
  return KEYWORD_RE.test(k);
}

const GITHUB_RE = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/i;

export function extractGithubLink(topic: string): string {
  const m = (topic || "").match(GITHUB_RE);
  return m ? m[0].replace(/[.,)]+$/, "") : "";
}

// Gợi ý keyword từ tên repo: 2 segment đầu ghép liền, bỏ gạch.
// gods-eye-view -> godseye · Pixelle-Video -> pixellevideo · hyperframes -> hyperframes
export function deriveKeyword(topic: string): string {
  const link = extractGithubLink(topic);
  if (!link) return "";
  const repo = (link.split("/").filter(Boolean).pop() || "").replace(/\.git$/i, "");
  const parts = repo.split(/[-_.]+/).filter(Boolean).map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (!parts.length) return "";
  const two = parts.slice(0, 2).join("");
  const picked = two.length <= KEYWORD_MAX ? two : parts[0];
  return picked.slice(0, KEYWORD_MAX);
}
