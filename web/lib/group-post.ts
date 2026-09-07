import "./env";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { CONTENT_DIR, mediaDirFor } from "./paths";
import { getKey } from "./keys";
import { getItem, saveItem, type ContentItem } from "./content";

// Đăng lên group Facebook (Playwright headed, profile riêng) + group Zalo (qua zalo-relay trên VPS).
// Node chỉ điều phối: mở SSH tunnel, spawn python scripts/group_poster/publish.py, đọc JSON dòng cuối.
// Zalo KHÔNG bao giờ chạy Playwright local: Zalo chỉ giữ 1 phiên web, mở thêm là đá phiên của relay.

const SCRIPT_DIR = path.join(process.cwd(), "scripts", "group_poster");
const PROFILES_DIR = process.env.GROUP_POSTER_PROFILES || path.join(SCRIPT_DIR, "profiles");
const GROUPS_DIR = path.join(CONTENT_DIR, "_groups");
const GROUPS_FILE = path.join(GROUPS_DIR, "groups.json");
const PYTHON = process.env.PYTHON || "python";
const RELAY_URL = (process.env.ZALO_RELAY_URL || "http://127.0.0.1:3131").replace(/\/+$/, "");
const SSH_HOST = process.env.ZALO_RELAY_SSH_HOST || "";
const SSH_KEY = process.env.ZALO_RELAY_SSH_KEY || path.join(os.homedir(), ".ssh", "id_ed25519");
const SSH_BIN = process.env.SSH_BIN || "ssh";
const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];
const JOB_TIMEOUT_MS = 9 * 60_000; // client postJson bỏ cuộc ở 10 phút
// Phiên FB đo thật: 8/7→24/7, 24/7→14/8, 19/8→chết trước 4/9 (≤16 ngày). FB thu hồi phía server.
const FB_SESSION_WARN_DAYS = 14;

export type Group = {
  id: string;
  platform: "fb" | "zalo";
  target: string; // fb: URL group · zalo: TÊN group đúng như relay thấy
  label?: string;
  enabled: boolean;
};

// Danh sách group tự khai trong Settings. FB điền URL group, Zalo điền TÊN group
// đúng như relay thấy (so lowercase).
export async function loadGroups(): Promise<Group[]> {
  try {
    return JSON.parse(await fsp.readFile(GROUPS_FILE, "utf8")) as Group[];
  } catch {
    return [];
  }
}

export async function saveGroups(groups: Group[]): Promise<void> {
  await fsp.mkdir(GROUPS_DIR, { recursive: true });
  await fsp.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2), "utf8");
}

type State = {
  running: "post" | "login" | null;
  tunnel: ChildProcess | null;
  tunnelErr: string;
  lastLogin?: { at: string; ok: boolean };
  fbDead?: string; // ISO lúc job gần nhất báo "chưa đăng nhập FB"; xóa khi login lại thành công
};
// Treo lên globalThis để next dev reload module không mất lock lẫn tunnel đang mở.
const g = globalThis as typeof globalThis & { __groupPoster?: State };
const state: State = g.__groupPoster ?? (g.__groupPoster = { running: null, tunnel: null, tunnelErr: "" });

export class GroupBusyError extends Error {}

// Secret relay: ưu tiên ZALO_RELAY_SECRET (Settings / env), fallback RELAY_SECRET (tên trong .env gốc,
// cùng tên với .env của zalo-relay). Không bao giờ log giá trị.
export function relaySecret(): string {
  return getKey("ZALO_RELAY_SECRET") || getKey("RELAY_SECRET");
}

const isVideo = (f: string) => VIDEO_EXT.includes(path.extname(f).toLowerCase());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const alive = (c: ChildProcess | null): c is ChildProcess =>
  !!c && c.exitCode === null && c.signalCode === null;

type RelayHealth = { ok: boolean; loggedIn: boolean };

async function relayHealth(): Promise<RelayHealth> {
  try {
    const r = await fetch(`${RELAY_URL}/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!r.ok) return { ok: false, loggedIn: false };
    const d = (await r.json()) as { ok?: boolean; logged_in?: boolean };
    return { ok: !!d.ok, loggedIn: !!d.logged_in };
  } catch {
    return { ok: false, loggedIn: false };
  }
}

// Relay bind 127.0.0.1 trên VPS nên phải có SSH tunnel local. Tunnel mở tay sẵn cũng được
// (health pass là thôi). Child ssh sống theo vòng đời server, chết thì lần gọi sau spawn lại.
export async function ensureTunnel(): Promise<RelayHealth & { reason?: string }> {
  let h = await relayHealth();
  if (h.ok) return h;
  if (!SSH_HOST) return { ...h, reason: "thiếu ZALO_RELAY_SSH_HOST trong .env" };
  if (!fs.existsSync(SSH_KEY)) return { ...h, reason: `không thấy key ssh ${SSH_KEY}` };
  if (!alive(state.tunnel)) {
    state.tunnelErr = "";
    const child = spawn(
      SSH_BIN,
      [
        "-N",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ExitOnForwardFailure=yes",
        "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=30",
        "-i", SSH_KEY,
        "-L", "3131:127.0.0.1:3131",
        SSH_HOST,
      ],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
    );
    child.stderr?.on("data", (d) => {
      state.tunnelErr = (state.tunnelErr + d.toString()).slice(-500);
    });
    child.on("error", (e) => {
      state.tunnelErr = e.message;
      if (state.tunnel === child) state.tunnel = null;
    });
    child.on("exit", () => {
      if (state.tunnel === child) state.tunnel = null;
    });
    state.tunnel = child;
  }
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    h = await relayHealth();
    if (h.ok) return h;
    if (!alive(state.tunnel)) break;
  }
  const tail = state.tunnelErr.trim().slice(-200);
  return { ...h, reason: `không mở được tunnel tới relay${tail ? `: ${tail}` : ""}` };
}

// Không mở browser để check (tốn 30s + đụng lock). fb_state.json được ghi lại mỗi lần
// is_logged_in thấy phiên còn tốt, nên tuổi file = lần cuối biết chắc phiên sống.
function fbHealth(): { ok: boolean; reason?: string; lastOkAt?: string } {
  if (state.fbDead) {
    return {
      ok: false,
      reason: `phiên Facebook đã hết (job lúc ${state.fbDead.slice(11, 16)} báo chưa đăng nhập), bấm 'Đăng nhập lại Facebook'`,
    };
  }
  try {
    const m = fs.statSync(path.join(PROFILES_DIR, "fb_state.json")).mtime;
    const days = Math.floor((Date.now() - m.getTime()) / 86_400_000);
    if (days >= FB_SESSION_WARN_DAYS) {
      return { ok: false, reason: `phiên đã ${days} ngày, nên đăng nhập lại`, lastOkAt: m.toISOString() };
    }
    return { ok: true, lastOkAt: m.toISOString() };
  } catch {
    return { ok: false, reason: "chưa đăng nhập Facebook" };
  }
}

export async function groupHealth() {
  const z = await ensureTunnel();
  return {
    fb: fbHealth(),
    zalo: {
      ok: z.ok && z.loggedIn,
      reason: !z.ok
        ? z.reason || "không kết nối được relay"
        : !z.loggedIn
        ? "relay chưa đăng nhập Zalo, quét QR trong Telegram"
        : undefined,
    },
    busy: state.running,
    lastLogin: state.lastLogin,
  };
}

function pyEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ZALO_RELAY_URL: RELAY_URL,
    ZALO_RELAY_SECRET: relaySecret(),
    GROUP_POSTER_PROFILES: PROFILES_DIR,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
  };
}

// Giết cả cây: kill python không thì Chromium mồ côi vẫn giữ lock profile, job sau lỗi "profile in use".
function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    child.kill();
  }
}

type PyRun = { code: number | null; stdout: string; stderr: string; error?: string };

function runPython(args: string[], timeoutMs: number): Promise<PyRun> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, args, {
      cwd: SCRIPT_DIR,
      env: pyEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      killTree(child);
      resolve({ code: null, stdout: out, stderr: err, error: `quá ${Math.round(timeoutMs / 60_000)} phút, đã hủy` });
    }, timeoutMs);
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        code: null,
        stdout: out,
        stderr: err,
        error: e.message.includes("ENOENT") ? `chưa cài python hoặc sai env PYTHON (${PYTHON})` : e.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: out, stderr: err });
    });
  });
}

// publish.py in JSON theo dòng (tiến độ từng group), dòng cuối là tổng {fbgroup, zalogroup}.
function lastJson(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(lines[i]) as Record<string, unknown>;
      if (o && typeof o === "object" && ("fbgroup" in o || "zalogroup" in o)) return o;
    } catch {
      /* dòng log thường */
    }
  }
  return null;
}

// Zalo không gửi video, chỉ text + link YouTube. Link lấy từ bài: source_url (post repurpose),
// first_comment (short từ /edit/youtube để link video gốc ở đó), cuối cùng là body.
const YT_RE = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s)>\]"']+/i;
function youtubeLink(it: ContentItem | null): string {
  for (const c of [it?.source_url, it?.first_comment, it?.body]) {
    const m = (c || "").match(YT_RE);
    if (m) return m[0].replace(/[.,]+$/, "");
  }
  return "";
}

type PlatOut = { status?: string; results?: { group: string; status: string }[] };
const okTargetsOf = (p: unknown): string[] =>
  ((p as PlatOut | undefined)?.results || []).filter((r) => r.status === "ok").map((r) => r.group);

export async function groupPost(p: {
  id: string;
  caption: string;
  files: string[];
  fbTargets: string[];
  zaloTargets: string[];
}): Promise<{ result: Record<string, unknown>; item?: ContentItem }> {
  if (state.running) throw new GroupBusyError("đang có job đăng group khác, chờ xong rồi bấm lại");
  state.running = "post";
  try {
    const dir = mediaDirFor(p.id);
    const present = p.files
      .map((f) => path.join(dir, path.basename(f)))
      .filter((f) => fs.existsSync(f));
    const images = present.filter((f) => !isVideo(f));
    // Short có cả final.mp4 (bản edit) lẫn clip.mp4 (clip gốc): ưu tiên final.
    const video = present
      .filter(isVideo)
      .sort((a, b) => Number(!/final\./i.test(a)) - Number(!/final\./i.test(b)))[0];

    const result: Record<string, unknown> = {};
    let zaloTargets = p.zaloTargets;
    if (zaloTargets.length) {
      const t = await ensureTunnel();
      if (!t.ok) {
        result.zalogroup = { status: "failed", reason: t.reason };
        zaloTargets = [];
      } else if (!t.loggedIn) {
        result.zalogroup = { status: "failed", reason: "relay chưa đăng nhập Zalo, quét QR trong Telegram" };
        zaloTargets = [];
      }
    }

    if (p.fbTargets.length || zaloTargets.length) {
      await fsp.mkdir(GROUPS_DIR, { recursive: true });
      const jobPath = path.join(GROUPS_DIR, "last-job.json");
      const link = youtubeLink(await getItem(p.id));
      const job = {
        text: p.caption,
        zalo_text: link && !p.caption.includes(link) ? `${p.caption}\n\n${link}` : p.caption,
        images,
        video: video || null,
        fb_targets: p.fbTargets,
        zalo_targets: zaloTargets,
        fb_delay: 30,
        zalo_delay: 15,
      };
      await fsp.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");
      const run = await runPython(["publish.py", "--job", jobPath], JOB_TIMEOUT_MS);
      try {
        await fsp.writeFile(
          path.join(GROUPS_DIR, "last-run.log"),
          `[${new Date().toISOString()}] exit=${run.code} ${run.error || ""}\n--- stdout\n${run.stdout}\n--- stderr\n${run.stderr}`,
          "utf8"
        );
      } catch {}
      const parsed = lastJson(run.stdout);
      if (parsed) Object.assign(result, parsed);
      else result.error = run.error || run.stderr.trim().slice(-300) || `python exit ${run.code}`;
      const fbr = result.fbgroup as (PlatOut & { reason?: string }) | undefined;
      if (fbr?.status === "failed" && /chưa đăng nhập/.test(fbr.reason || "")) {
        state.fbDead = new Date().toISOString();
      }
    } else if (!Object.keys(result).length) {
      result.error = "không chọn group nào";
    }

    const plats = [result.fbgroup, result.zalogroup].filter(Boolean) as PlatOut[];
    result.status = result.error || plats.some((x) => x.status === "failed") ? "failed" : "ok";

    const okTargets = [...okTargetsOf(result.fbgroup), ...okTargetsOf(result.zalogroup)];
    let item: ContentItem | undefined;
    if (okTargets.length) {
      const it = await getItem(p.id);
      if (it) {
        it.group_posted_at = new Date().toISOString();
        it.groups = okTargets.join(";");
        await saveItem(it);
        item = it;
      }
    }
    return { result, item };
  } finally {
    state.running = null;
  }
}

// Mở Chrome headed cho user tự đăng nhập FB. Trả về ngay: user gõ mật khẩu tới 5 phút,
// giữ request không thêm gì; UI poll groupHealth() thấy busy hết là xong.
export function startFbLogin(): void {
  if (state.running) throw new GroupBusyError("đang có job đăng group khác, chờ xong rồi bấm lại");
  state.running = "login";
  let log = "";
  const done = (ok: boolean) => {
    state.lastLogin = { at: new Date().toISOString(), ok };
    if (ok) state.fbDead = undefined;
    state.running = null;
    fsp.mkdir(GROUPS_DIR, { recursive: true })
      .then(() => fsp.writeFile(path.join(GROUPS_DIR, "last-login.log"), log, "utf8"))
      .catch(() => {});
  };
  let child: ChildProcess;
  try {
    child = spawn(PYTHON, ["publish.py", "--login", "fb"], {
      cwd: SCRIPT_DIR,
      env: pyEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    log = (e as Error).message;
    done(false);
    throw e;
  }
  child.stdout?.on("data", (d) => (log += d.toString()));
  child.stderr?.on("data", (d) => (log += d.toString()));
  child.on("error", (e) => {
    log += `\n[spawn error] ${e.message}`;
    done(false);
  });
  child.on("close", (code) => done(code === 0));
}

// Tên group (lowercase) mà relay đang thấy, để user copy đúng tên vào danh sách.
export async function relayGroupNames(): Promise<string[]> {
  const t = await ensureTunnel();
  if (!t.ok) throw new Error(t.reason || "không kết nối được relay");
  const r = await fetch(`${RELAY_URL}/groups`, {
    headers: { "x-secret": relaySecret() },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (r.status === 401) throw new Error("sai hoặc thiếu ZALO_RELAY_SECRET, nhập lại trong Settings");
  if (r.status === 503) throw new Error("relay chưa đăng nhập Zalo, quét QR trong Telegram");
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean; groups?: Record<string, string>; error?: string };
  if (!r.ok || !d.ok) throw new Error(d.error || `relay HTTP ${r.status}`);
  return Object.keys(d.groups || {}).sort();
}
