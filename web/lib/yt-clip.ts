import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "./paths";

// winget cài yt-dlp nhưng PATH mới chỉ có sau logon → thử đường dẫn winget trước (giống api/download).
const WINGET_YTDLP = path.join(
  process.env.LOCALAPPDATA || "",
  "Microsoft/WinGet/Packages/yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe/yt-dlp.exe"
);
const YTDLP = existsSync(WINGET_YTDLP) ? WINGET_YTDLP : "yt-dlp.exe";

// KHÔNG dùng --download-sections: m3u8 của YouTube giờ trả file rỗng (262B, PO token/SABR),
// còn DASH cắt đoạn sâu trong video thì chậm tới mức timeout (đo thật 2026-08-31).
// → Tải NGUYÊN video 1 lần vào cache theo videoId, rồi cắt local bằng ffmpeg.
// Cache dùng chung cho cả post (1 clip) lẫn build video dọc (2-3 đoạn thao tác).
export const YT_CACHE_DIR = path.join(MEDIA_DIR, "_ytcache");

function run(cmd: string, args: string[], timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${label} quá ${Math.round(timeoutMs / 60000)} phút, đã hủy`));
    }, timeoutMs);
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(e.message.includes("ENOENT") ? `chưa cài ${label}` : e.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${label}: ${(err.trim() || `exit ${code}`).slice(-400)}`));
    });
  });
}

// Tải full video ≤1080p vào cache (bỏ qua nếu đã có). Trả về đường dẫn file cache.
export async function ensureYouTubeCached(videoId: string): Promise<string> {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("videoId không hợp lệ");
  await fs.mkdir(YT_CACHE_DIR, { recursive: true });
  const cached = path.join(YT_CACHE_DIR, `${videoId}.mp4`);
  if (existsSync(cached)) return cached;

  await run(
    YTDLP,
    [
      "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b",
      "--merge-output-format", "mp4",
      "-N", "8",
      "--no-playlist", "--no-warnings", "--no-part",
      "-o", path.join(YT_CACHE_DIR, `${videoId}.%(ext)s`),
      `https://youtu.be/${videoId}`,
    ],
    20 * 60_000,
    "yt-dlp"
  );
  if (!existsSync(cached)) throw new Error("yt-dlp chạy xong nhưng không thấy file trong cache");
  return cached;
}

// Đọc duration (giây) bằng ffprobe — cắt ngoài phạm vi thì ffmpeg trả file rỗng IM LẶNG.
async function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(0));
    child.on("close", () => resolve(parseFloat(out.trim()) || 0));
  });
}

// Cắt [startSec, endSec] từ cache → <outDir>/<baseName>.mp4 (re-encode để cắt đúng frame).
export async function clipYouTube(
  videoId: string,
  startSec: number,
  endSec: number,
  outDir: string,
  baseName = "clip"
): Promise<string> {
  const src = await ensureYouTubeCached(videoId);
  const dur = await probeDuration(src);
  let start = Math.max(0, startSec);
  let end = Math.max(start + 1, endSec);
  if (dur > 0) {
    if (start >= dur) throw new Error(`đoạn cắt bắt đầu ${Math.round(start)}s vượt độ dài video ${Math.round(dur)}s`);
    end = Math.min(end, dur);
  }
  await fs.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${baseName}.mp4`);

  await run(
    "ffmpeg",
    [
      "-y",
      "-ss", start.toFixed(2),
      "-to", end.toFixed(2),
      "-i", src,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      out,
    ],
    10 * 60_000,
    "ffmpeg"
  );
  if (!existsSync(out)) throw new Error("ffmpeg chạy xong nhưng không thấy file clip");
  return out;
}
