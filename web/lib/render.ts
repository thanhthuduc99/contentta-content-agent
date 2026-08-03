import "./env";
import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { CONTENT_DIR } from "./paths";

// ---- Fonts (Bricolage display + Be Vietnam Pro body) ----
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
function font(name: string) {
  return fs.readFileSync(path.join(FONT_DIR, name));
}
function fontIf(name: string) {
  try { return font(name); } catch { return null; }
}
type SatoriFont = { name: string; data: Buffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" };
const FONTS: SatoriFont[] = [
  { name: "BeVietnamPro", data: font("BeVietnamPro-Regular.ttf"), weight: 400, style: "normal" },
  { name: "BeVietnamPro", data: font("BeVietnamPro-SemiBold.ttf"), weight: 600, style: "normal" },
  { name: "BeVietnamPro", data: font("BeVietnamPro-ExtraBold.ttf"), weight: 800, style: "normal" },
];
for (const [file, weight] of [
  ["Bricolage-latin-800.woff", 800], ["Bricolage-vietnamese-800.woff", 800],
  ["Bricolage-latin-700.woff", 700], ["Bricolage-vietnamese-700.woff", 700],
] as const) {
  const data = fontIf(file);
  if (data) FONTS.push({ name: "Bricolage", data, weight, style: "normal" });
}
const HAS_BRICOLAGE = FONTS.some((f) => f.name === "Bricolage");
const DISPLAY = HAS_BRICOLAGE ? "Bricolage" : "BeVietnamPro";

// ---- Brand Lumen ----
const IVORY = "#FAF6EF";
const INK = "#17130D";
const MUTED = "#8A8073";
const LINE = "rgba(23,19,13,0.14)";
const PLUM = "#4A3AE0";
const GRAD = "linear-gradient(105deg, #4A3AE0 0%, #7B6CFF 40%, #FFB39C 95%)";

const BRAND_PERSON_NAME = (process.env.BRAND_PERSON_NAME || "Tên của bạn").trim();
const BRAND_NAME = (process.env.BRAND_NAME || "Content Agent").trim();
const BRAND_DOMAIN = (process.env.BRAND_DOMAIN || "localhost:8502").trim();
const FACE_LUMEN = path.join(CONTENT_DIR, "_assets", "profile-cutout.png");
const FACE_OLD = path.join(CONTENT_DIR, "_assets", "profile.png");
const FACE = fs.existsSync(FACE_LUMEN) ? FACE_LUMEN : FACE_OLD;

// ---- VNode helper ----
type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string;
function h(type: string, style: Record<string, unknown>, ...children: Child[]): Node {
  const kids = children
    .filter((c) => c !== null && c !== undefined && c !== "")
    .map((c) => (typeof c === "string" ? c.normalize("NFC") : c));
  return { type, props: { style, children: kids.length === 1 ? kids[0] : kids } };
}
function img(src: string, w: number, hh: number): Node {
  return { type: "img", props: { src, width: w, height: hh, style: { width: w, height: hh } } };
}
async function toPng(node: Node, width: number, height: number): Promise<Buffer> {
  const svg = await satori(node as never, { width, height, fonts: FONTS as never });
  return Buffer.from(new Resvg(svg).render().asPng());
}

function gradSvg(kind: "arrow" | "tri", color = PLUM): string {
  const svg =
    kind === "arrow"
      ? `<svg width="92" height="34" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="17" x2="84" y2="17"/><polyline points="68 5 86 17 68 29"/></g></svg>`
      : `<svg width="20" height="24" xmlns="http://www.w3.org/2000/svg"><path d="M3 2 L18 12 L3 22 Z" fill="${color}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Header: tên trái + brand phải + hairline.
function header(): Node {
  return h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", gap: 18 },
    h(
      "div",
      { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
      h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 24, fontWeight: 600, color: INK, letterSpacing: 0.3 }, BRAND_PERSON_NAME),
      h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 24, fontWeight: 600, color: MUTED, letterSpacing: 0.3 }, BRAND_NAME)
    ),
    h("div", { display: "flex", width: "100%", height: 1, background: LINE })
  );
}
function footer(): Node {
  return h(
    "div",
    { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
    h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 22, fontWeight: 600, color: MUTED, letterSpacing: 0.5 }, BRAND_DOMAIN),
    img(gradSvg("arrow"), 92, 34)
  );
}

// Tách title thành runs ink/accent; gradient tô NGUYÊN CỤM accent.
function titleParts(title: string, accent?: string): { w: string; a: boolean }[] {
  const words = title.split(/\s+/).filter(Boolean);
  if (accent && accent.trim()) {
    const acc = accent.trim().split(/\s+/).map((w) => w.toLowerCase().replace(/[.,!?]/g, ""));
    const lw = words.map((w) => w.toLowerCase().replace(/[.,!?]/g, ""));
    for (let i = 0; i + acc.length <= words.length; i++) {
      if (acc.every((a, j) => lw[i + j] === a || lw[i + j].includes(a) || a.includes(lw[i + j]))) {
        return words.map((w, idx) => ({ w, a: idx >= i && idx < i + acc.length }));
      }
    }
  }
  return words.map((w, idx) => ({ w, a: idx === words.length - 1 })); // fallback: từ cuối
}
function headline(parts: { w: string; a: boolean }[], size: number, lh = 1.02): Node {
  const runs: { a: boolean; words: string[] }[] = [];
  for (const p of parts) {
    const last = runs[runs.length - 1];
    if (last && last.a === p.a) last.words.push(p.w);
    else runs.push({ a: p.a, words: [p.w] });
  }
  const base = { display: "flex", fontFamily: DISPLAY, fontSize: size, fontWeight: 800, lineHeight: lh };
  const children: Node[] = [];
  for (const run of runs) {
    if (run.a) children.push(h("div", { ...base, backgroundImage: GRAD, backgroundClip: "text", color: "transparent" }, run.words.join(" ")));
    else for (const w of run.words) children.push(h("div", { ...base, color: INK }, w));
  }
  return h("div", { display: "flex", flexWrap: "wrap", alignItems: "flex-start", columnGap: Math.round(size * 0.27), rowGap: Math.round(size * 0.14) }, ...children);
}

const W = 1080, H = 1080, PAD = 72;

// ================= THUMBNAIL (YouTube, có mặt) =================
export type ThumbSpec = { badge?: string; line1: string; accentWord: string; line2?: string; sub?: string };
export async function renderThumbnail(spec: ThumbSpec): Promise<Buffer> {
  const TW = 1280, TH = 720;
  const left = h(
    "div",
    { display: "flex", flexDirection: "column", width: 700, height: TH, padding: "56px 0 56px 64px", justifyContent: "center", gap: 16 },
    header(),
    spec.badge ? h("div", { display: "flex", alignSelf: "flex-start", background: INK, color: "#fff", fontFamily: "BeVietnamPro", fontSize: 22, fontWeight: 600, padding: "8px 18px", borderRadius: 24, marginTop: 8 }, spec.badge) : "",
    h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 78, fontWeight: 800, color: INK, lineHeight: 1.0, marginTop: 8 }, spec.line1),
    h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 92, fontWeight: 800, lineHeight: 1.0, backgroundImage: GRAD, backgroundClip: "text", color: "transparent" }, spec.accentWord),
    spec.line2 ? h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 78, fontWeight: 800, color: INK, lineHeight: 1.0 }, spec.line2) : "",
    spec.sub ? h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 32, fontWeight: 500, color: MUTED, marginTop: 10 }, spec.sub) : ""
  );
  const root = h("div", { display: "flex", width: TW, height: TH, background: IVORY }, left);
  const base = await toPng(root, TW, TH);
  if (!fs.existsSync(FACE)) return base;
  const faceH = 700;
  const faceBuf = await sharp(FACE).resize({ height: faceH }).png().toBuffer();
  const fMeta = await sharp(faceBuf).metadata();
  const fLeft = TW - (fMeta.width || 540) - 20;
  const fTop = TH - faceH + 18;
  return sharp(base).composite([{ input: faceBuf, left: fLeft, top: fTop }]).png().toBuffer();
}

// ================= SINGLE (nhan-tai-lieu) =================
export type SingleSpec = { title: string; subtitle?: string; keyword: string; cta?: string };
export async function renderSingle(spec: SingleSpec): Promise<Buffer> {
  const SW = 1080, SH = 1350;
  const root = h(
    "div",
    { display: "flex", flexDirection: "column", width: SW, height: SH, background: IVORY, padding: PAD, justifyContent: "space-between" },
    header(),
    h(
      "div",
      { display: "flex", flexDirection: "column", gap: 24 },
      headline(titleParts(spec.title), 78, 1.05),
      spec.subtitle ? h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 36, fontWeight: 500, color: MUTED, lineHeight: 1.35 }, spec.subtitle) : ""
    ),
    h(
      "div",
      { display: "flex", flexDirection: "column", backgroundImage: GRAD, borderRadius: 26, padding: "32px 38px", gap: 8 },
      h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.85)" }, "Nhận tài liệu miễn phí"),
      h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 42, fontWeight: 800, color: "#fff", lineHeight: 1.15 }, spec.cta || `Comment "${spec.keyword}" + follow để mình gửi`)
    )
  );
  return toPng(root, SW, SH);
}

// ================= CAROUSEL =================
export type Slide = { kind: "cover" | "point" | "cta"; title: string; body?: string; accent?: string };

export async function renderSlide(slide: Slide, index: number, total: number): Promise<Buffer> {
  if (slide.kind === "cover") {
    const node = h(
      "div",
      { display: "flex", flexDirection: "column", width: W, height: H, background: IVORY, padding: `${PAD}px ${PAD}px 0 ${PAD}px` },
      header(),
      h(
        "div",
        { display: "flex", flexDirection: "column", gap: 22, marginTop: 64 },
        headline(titleParts(slide.title, slide.accent), 92, 1.0),
        slide.body ? h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 30, fontWeight: 500, color: MUTED, lineHeight: 1.35, marginTop: 6, maxWidth: 780 }, slide.body) : ""
      )
    );
    const base = await toPng(node, W, H);
    if (!fs.existsSync(FACE)) return base;
    const faceH = 540;
    const faceBuf = await sharp(FACE).resize({ height: faceH }).png().toBuffer();
    const m = await sharp(faceBuf).metadata();
    const left = Math.round((W - (m.width || 400)) / 2);
    return sharp(base).composite([{ input: faceBuf, left, top: H - faceH }]).png().toBuffer();
  }

  if (slide.kind === "cta") {
    const node = h(
      "div",
      { display: "flex", flexDirection: "column", width: W, height: H, background: IVORY, padding: PAD, justifyContent: "space-between" },
      header(),
      h(
        "div",
        { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 26 },
        headline(titleParts(slide.title, slide.accent), 78, 1.04),
        h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 32, fontWeight: 500, color: MUTED, lineHeight: 1.35, marginTop: 4 }, slide.body || "Mình mổ xẻ chi tiết bên trong Contentta."),
        h("div", { display: "flex", alignSelf: "flex-start", backgroundImage: GRAD, color: "#fff", fontFamily: "BeVietnamPro", fontSize: 28, fontWeight: 600, padding: "18px 34px", borderRadius: 999, marginTop: 14 }, "Link ngay dưới comment.")
      ),
      footer()
    );
    return toPng(node, W, H);
  }

  // point: số lớn gradient + title + body
  const pointNum = String(index - 1).padStart(2, "0");
  const node = h(
    "div",
    { display: "flex", flexDirection: "column", width: W, height: H, background: IVORY, padding: PAD, justifyContent: "space-between" },
    header(),
    h(
      "div",
      { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 18 },
      h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 150, fontWeight: 800, lineHeight: 1.0, backgroundImage: GRAD, backgroundClip: "text", color: "transparent", marginBottom: -8 }, pointNum),
      h("div", { display: "flex", fontFamily: DISPLAY, fontSize: 70, fontWeight: 800, color: INK, lineHeight: 1.05 }, slide.title),
      slide.body ? h("div", { display: "flex", alignItems: "flex-start", gap: 20, marginTop: 8 }, h("div", { display: "flex", marginTop: 12 }, img(gradSvg("tri"), 20, 24)), h("div", { display: "flex", fontFamily: "BeVietnamPro", fontSize: 34, fontWeight: 500, color: INK, lineHeight: 1.3, maxWidth: 820 }, slide.body)) : ""
    ),
    footer()
  );
  return toPng(node, W, H);
}
