import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import "@/lib/env";
import { REPO_ROOT } from "@/lib/paths";
import { downloadTiktok } from "@/lib/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const DEST = (process.env.DOWNLOAD_DIR || "").trim()
  ? path.resolve(process.env.DOWNLOAD_DIR!)
  : path.join(REPO_ROOT, "downloads");

// winget cài yt-dlp rồi thêm vào PATH, nhưng process đang chạy không thấy PATH mới
// tới khi logon lại → thử đường dẫn winget trước, không có thì tin vào PATH.
const WINGET_YTDLP = path.join(
  process.env.LOCALAPPDATA || "",
  "Microsoft/WinGet/Packages/yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe/yt-dlp.exe"
);
const YTDLP = (process.env.YT_DLP_PATH || "").trim() ||
  (existsSync(WINGET_YTDLP)
    ? WINGET_YTDLP
    : process.platform === "win32"
      ? "yt-dlp.exe"
      : "yt-dlp");

// Chỉ nhận link 4 nền tảng này — không đưa string tuỳ ý vào command line.
const ALLOWED = [
  "facebook.com",
  "fb.watch",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
];

function allowed(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return ALLOWED.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

type Result = { url: string; ok: boolean; file?: string; size?: number; error?: string; via?: string };

const isTiktok = (u: string) => /(^|\.)tiktok\.com$/i.test(new URL(u).hostname.replace(/^www\./, ""));

// Chỉ lấy %(id)s (luôn ASCII) rồi tự tìm file theo id trong DEST. Đọc đường dẫn từ
// stdout không dùng được: tiêu đề tiếng Việt bị méo theo codepage console của Windows.
function ytdlp(url: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, [
      "--no-playlist",
      "--no-warnings",
      "--print",
      "after_move:id",
      "-o",
      `${DEST}/%(title).100B [%(id)s].%(ext)s`,
      url,
    ]);
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: "quá 10 phút, đã hủy" });
    }, 600_000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message.includes("ENOENT") ? "chưa cài yt-dlp" : e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const id = out.trim().split("\n").filter(Boolean).pop();
      if (code === 0 && id) resolve({ ok: true, id });
      else resolve({ ok: false, error: (err.trim() || `yt-dlp exit ${code}`).slice(-300) });
    });
  });
}

// Tên file luôn có "[<id>]" theo output template → tìm ngược từ id, khỏi phụ thuộc encoding.
async function findById(id: string): Promise<string | undefined> {
  try {
    const names = await fs.readdir(DEST);
    const hit = names.filter((n) => n.includes(`[${id}]`));
    if (!hit.length) return undefined;
    const stats = await Promise.all(
      hit.map(async (n) => ({ n, m: (await fs.stat(path.join(DEST, n))).mtimeMs }))
    );
    return stats.sort((a, b) => b.m - a.m)[0].n;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { urls } = (await req.json()) as { urls?: string[] };
    const list = (urls || []).map((u) => u.trim()).filter(Boolean);
    if (!list.length) return NextResponse.json({ error: "chưa có link nào" }, { status: 400 });

    await fs.mkdir(DEST, { recursive: true });

    const results: Result[] = [];
    for (const url of list) {
      if (!allowed(url)) {
        results.push({ url, ok: false, error: "chỉ nhận link Facebook / Instagram / TikTok / YouTube" });
        continue;
      }
      const via = isTiktok(url) ? "apify" : "yt-dlp";
      let name: string | undefined;
      let error: string | undefined;
      if (via === "apify") {
        const r = await downloadTiktok(url, DEST);
        if (r.ok && r.path) name = path.basename(r.path);
        else error = r.error;
      } else {
        const r = await ytdlp(url);
        if (r.ok && r.id) {
          name = await findById(r.id);
          if (!name) error = "tải xong nhưng không tìm thấy file trong " + DEST;
        } else error = r.error;
      }
      if (!name) {
        results.push({ url, ok: false, error, via });
        continue;
      }
      let size: number | undefined;
      try {
        size = (await fs.stat(path.join(DEST, name))).size;
      } catch {
        /* stat lỗi → bỏ size, file vẫn có */
      }
      results.push({ url, ok: true, file: name, size, via });
    }
    return NextResponse.json({ dest: DEST, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
