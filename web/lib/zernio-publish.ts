import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import { zfetchWith, getAccountMap, accountsById } from "./zernio";
import { splitThreads, THREADS_MAX } from "./threads-chain";

export type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "linkedin" | "threads";

// Giới hạn media/text theo openapi Zernio. Vượt là cả call POST /posts fail (kéo theo
// platform khác cùng key), nên cắt sẵn bằng customMedia/customContent thay vì để lỗi.
const MAX_MEDIA: Record<Platform, number> = {
  facebook: 10,
  instagram: 10,
  threads: 10,
  linkedin: 20,
  tiktok: 1,
  youtube: 1,
};
// Nền tảng nhận platformSpecificData.firstComment (Zernio tự comment sau khi đăng, chạy được
// cả bài hẹn lịch). TikTok không có field này. Threads thì câu comment thành mắt xích cuối chuỗi.
const NATIVE_COMMENT: Platform[] = ["facebook", "instagram", "linkedin", "youtube"];

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
};
const mimeOf = (p: string) => MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
const isVideo = (p: string) => mimeOf(p).startsWith("video/");

// Video nặng upload chậm, nhưng phải có trần để lỗi nổi lên thay vì treo request Next.
const PUT_TIMEOUT = 10 * 60_000;
// POST /posts với publishNow đẩy lên nhiều nền tảng trong 1 call nên lâu hơn API thường.
const POST_TIMEOUT = 5 * 60_000;

const PENDING_PLATFORM_STATUSES = new Set([
  "pending",
  "scheduled",
  "queued",
  "publishing",
  "processing",
]);

// Presign → PUT bytes → publicUrl. Media upload vào workspace của key sẽ đăng.
async function presignUpload(key: string, file: string): Promise<{ url: string; type: "image" | "video" }> {
  const bytes = await fs.readFile(file);
  const name = path.basename(file);
  const mb = (bytes.length / 1024 / 1024).toFixed(1);
  const r = await zfetchWith<{ uploadUrl: string; publicUrl: string }>(key, "POST", "/media/presign", {
    body: { filename: name, contentType: mimeOf(file), size: bytes.length },
  });
  const t0 = Date.now();
  console.log(`[publish] upload ${name} (${mb}MB) key ...${key.slice(-6)}`);
  let put: Response;
  try {
    put = await fetch(r.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeOf(file) },
      body: bytes,
      signal: AbortSignal.timeout(PUT_TIMEOUT),
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") {
      throw new Error(`PUT ${name} (${mb}MB) quá 10 phút không xong`);
    }
    throw new Error(`PUT ${name} đứt kết nối: ${(e as Error).message}`);
  }
  if (!put.ok) throw new Error(`PUT media ${put.status}`);
  console.log(`[publish] upload ${name} xong sau ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return { url: r.publicUrl, type: isVideo(file) ? "video" : "image" };
}

type PublishResult = { status: string; [k: string]: unknown };

type ZPlatform = {
  platform: string;
  accountId?: string;
  status: string;
  platformPostUrl?: string;
  platformPostId?: string;
  error?: string;
};

// 1 account = 1 target. slot là key trong result: account ĐẦU của mỗi platform giữ tên trần
// ("instagram"), account thứ 2 trở đi thành "instagram2" — để code cũ đọc result["instagram"]
// (automation daily-news, comment-to-DM) vẫn trúng account chính.
type Target = {
  slot: string;
  platform: Platform;
  accountId: string;
  key: string;
  label: string;
};

function assignSlots(rows: Omit<Target, "slot">[]): Target[] {
  const seen: Record<string, number> = {};
  return rows.map((r) => {
    const n = (seen[r.platform] = (seen[r.platform] || 0) + 1);
    return { ...r, slot: n === 1 ? r.platform : `${r.platform}${n}` };
  });
}

// Response Zernio trả platform, không chắc có accountId. Khớp bằng accountId khi có, không thì
// lấy entry chưa dùng đầu tiên của đúng platform (cùng thứ tự đã gửi lên).
function matchEntry(rp: ZPlatform[], t: Target, used: Set<number>): ZPlatform | undefined {
  let i = rp.findIndex(
    (x, idx) => !used.has(idx) && x.platform === t.platform && !!x.accountId && x.accountId === t.accountId
  );
  if (i < 0) i = rp.findIndex((x, idx) => !used.has(idx) && x.platform === t.platform);
  if (i < 0) return undefined;
  used.add(i);
  return rp[i];
}

function entryFor(hit: ZPlatform | undefined, t: Target, zernioPostId?: string): PublishResult {
  if (!hit) {
    return {
      status: "failed",
      account: t.label,
      zernioPostId,
      reason: `Zernio không trả trạng thái đăng ${t.slot}`,
    };
  }
  const raw = (hit.status || "").toLowerCase();
  const status =
    raw === "published" || raw === "success"
      ? "ok"
      : PENDING_PLATFORM_STATUSES.has(raw)
      ? "pending"
      : "failed";
  return {
    status,
    account: t.label,
    url: hit.platformPostUrl,
    platformPostId: hit.platformPostId,
    zernioPostId,
    reason:
      hit.error ||
      (status === "pending"
        ? `Zernio đang xử lý (${raw})`
        : status === "failed"
        ? `Zernio trả trạng thái không xác nhận được: ${raw || "trống"}`
        : undefined),
  };
}

// Instagram upload video bất đồng bộ: POST /posts trả về khi container mới tạo, Zernio
// finalize sau ~1 phút. Không poll lại thì kết quả hiện "pending" trông như lỗi dù bài lên bình thường.
const SETTLE_TIMEOUT = 180_000;
const SETTLE_INTERVAL = 5_000;

async function settlePending(
  key: string,
  postId: string,
  targets: Target[],
  result: Record<string, unknown>
): Promise<void> {
  const deadline = Date.now() + SETTLE_TIMEOUT;
  const isPending = (t: Target) => (result[t.slot] as PublishResult | undefined)?.status === "pending";
  while (targets.some(isPending) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SETTLE_INTERVAL));
    let rp: ZPlatform[];
    try {
      const resp = await zfetchWith<{ post?: { platforms?: ZPlatform[] } }>(
        key,
        "GET",
        `/posts/${postId}`,
        { timeoutMs: 30_000 }
      );
      rp = resp.post?.platforms || [];
    } catch (e) {
      console.error(`[publish] poll ${postId} lỗi: ${(e as Error).message}`);
      continue;
    }
    // Duyệt HẾT target theo đúng thứ tự đã gửi, để entry của target đã chốt xong không bị
    // gán nhầm sang target còn pending cùng platform.
    const used = new Set<number>();
    for (const t of targets) {
      const hit = matchEntry(rp, t, used);
      // Không thấy platform trong response thì giữ pending và poll tiếp, đừng vội báo fail.
      if (hit && isPending(t)) result[t.slot] = entryFor(hit, t, postId);
    }
  }
}

export type PublishInput = {
  mediaPaths: string[];
  caption: string;
  platforms?: Platform[];
  accountIds?: string[]; // chọn theo account (nhiều account cùng platform); ưu tiên hơn platforms
  scheduledTime?: string; // ISO
  youtube?: { playlistId?: string; title?: string };
  threadsCaption?: string; // bản riêng cho Threads (trống thì lấy caption, tự chia chuỗi)
  firstComment?: string; // tự comment vào bài ngay sau khi đăng (chỗ để link)
};

// Đăng qua Zernio. Group target theo key (workspace), mỗi key 1 call POST /v1/posts.
export async function zernioPublish(input: PublishInput): Promise<Record<string, unknown>> {
  const { mediaPaths, caption, platforms, accountIds, scheduledTime, youtube } = input;
  const commentText = (input.firstComment || "").trim();
  // Threads tối đa 500 ký tự/post → chia bài thành chuỗi reply nối tiếp thay vì cắt cụt.
  // Câu comment tự động thành mắt xích cuối (Threads không có field firstComment).
  const chain = splitThreads(input.threadsCaption?.trim() || caption);
  if (commentText) chain.push(...splitThreads(commentText));

  const result: Record<string, unknown> = { status: "ok" };
  const slots: string[] = []; // mọi key đã ghi vào result, dùng để chốt status cuối
  let targets: Target[];

  if (accountIds && accountIds.length) {
    let accs: Awaited<ReturnType<typeof accountsById>>;
    try {
      accs = await accountsById(accountIds);
    } catch (e) {
      return { status: "failed", reason: `Không lấy được account Zernio: ${(e as Error).message}` };
    }
    const byId = new Map(accs.map((a) => [a.accountId, a]));
    const rows: Omit<Target, "slot">[] = [];
    for (const id of accountIds) {
      const a = byId.get(id);
      if (!a) {
        // User đã tick account thì không được coi "không tìm thấy" là thành công.
        result[id] = { status: "failed", reason: "account không còn trong Zernio" };
        slots.push(id);
        continue;
      }
      rows.push({
        platform: a.platform as Platform,
        accountId: a.accountId,
        key: a.key,
        label: a.displayName || a.platform,
      });
    }
    targets = assignSlots(rows);
  } else {
    // Đường cũ theo platform (daily-news, caller không biết accountId): account chính mỗi platform.
    const wanted =
      platforms && platforms.length
        ? platforms
        : (["facebook", "instagram", "tiktok", "youtube", "linkedin"] as Platform[]);
    let accMap: Record<string, { key: string; accountId: string; displayName: string }>;
    try {
      accMap = await getAccountMap();
    } catch (e) {
      return { status: "failed", reason: `Không lấy được account Zernio: ${(e as Error).message}` };
    }
    const rows: Omit<Target, "slot">[] = [];
    for (const p of wanted) {
      const acc = accMap[p];
      if (!acc) {
        // User đã tick platform thì không được coi "chưa kết nối" là thành công.
        result[p] = { status: "failed", reason: `chưa kết nối ${p} trong Zernio` };
        slots.push(p);
        continue;
      }
      rows.push({ platform: p, accountId: acc.accountId, key: acc.key, label: acc.displayName || p });
    }
    targets = assignSlots(rows);
  }
  slots.push(...targets.map((t) => t.slot));

  // Bài hẹn lịch thì pending là đúng trạng thái, không có gì để chờ chốt.
  const scheduleFuture = !!(scheduledTime && new Date(scheduledTime).getTime() > Date.now() + 60_000);
  const toSettle: { key: string; postId: string; targets: Target[] }[] = [];

  // Group target theo key (workspace).
  const byKey = new Map<string, Target[]>();
  for (const t of targets) byKey.set(t.key, [...(byKey.get(t.key) || []), t]);

  for (const [key, tgts] of byKey) {
    const names = tgts.map((t) => t.slot).join(",");
    let mediaItems: { type: string; url: string }[] = [];
    try {
      mediaItems = await Promise.all(mediaPaths.map((f) => presignUpload(key, f)));
    } catch (e) {
      console.error(`[publish] upload media lỗi (${names}): ${(e as Error).message}`);
      for (const t of tgts) {
        result[t.slot] = {
          status: "failed",
          account: t.label,
          reason: `upload media lỗi: ${(e as Error).message}`,
        };
      }
      continue;
    }

    const hasTiktok = tgts.some((t) => t.platform === "tiktok");
    // Không nền tảng nào nhận lẫn ảnh + video trong cùng 1 bài, có video thì chỉ đăng video đầu.
    const vids = mediaItems.filter((m) => m.type === "video");
    const baseMedia = vids.length ? [vids[0]] : mediaItems;
    const mediaFor = (p: Platform) => baseMedia.slice(0, MAX_MEDIA[p]);

    // Setting riêng từng nền tảng đi trong platforms[].platformSpecificData. Root-level chỉ
    // có tiktokSettings/facebookSettings trong schema Zernio — youtubeSettings ở root bị bỏ qua.
    const platformTarget = (tg: Target): Record<string, unknown> => {
      const p = tg.platform;
      const t: Record<string, unknown> = { platform: p, accountId: tg.accountId };
      const psd: Record<string, unknown> = {};

      if (p === "threads") {
        // Zernio check 500 ký tự trên content/customContent KỂ CẢ khi đã có threadItems, nên
        // luôn phải gửi customContent = mắt xích đầu. Có threadItems thì Zernio chỉ dùng nó để
        // hiển thị, bài đăng thật lấy từ threadItems (spec: "content is NOT published").
        t.customContent = (chain[0] || caption).slice(0, THREADS_MAX);
        if (chain.length > 1) {
          // Media đi theo mắt xích đầu, không gửi customMedia nữa.
          psd.threadItems = chain.map((content, i) =>
            i === 0 && mediaFor(p).length ? { content, mediaItems: mediaFor(p) } : { content }
          );
        } else if (mediaFor(p).length !== mediaItems.length) {
          t.customMedia = mediaFor(p);
        }
      } else if (mediaFor(p).length !== mediaItems.length) {
        t.customMedia = mediaFor(p);
      }

      if (p === "youtube") {
        psd.title = (youtube?.title || caption.split("\n", 1)[0] || "Video").trim().slice(0, 95);
        if (youtube?.playlistId) psd.playlistId = youtube.playlistId;
      }
      if (commentText && NATIVE_COMMENT.includes(p)) psd.firstComment = commentText;

      if (Object.keys(psd).length) t.platformSpecificData = psd;
      return t;
    };

    const body: Record<string, unknown> = {
      content: caption,
      mediaItems,
      platforms: tgts.map(platformTarget),
      timezone: "Asia/Bangkok",
    };
    // Zernio: nếu KHÔNG có scheduledFor/publishNow thì post mặc định thành DRAFT (không đăng lên page).
    // scheduledTime ở tương lai → hẹn lịch; còn lại (rỗng/quá khứ/gần bây giờ) → đăng ngay.
    if (scheduleFuture) {
      body.scheduledFor = scheduledTime;
    } else {
      body.publishNow = true;
    }
    if (hasTiktok) {
      body.tiktokSettings = {
        privacyLevel: "PUBLIC_TO_EVERYONE",
        allowComment: true,
        contentPreviewConfirmed: true,
        expressConsentGiven: true,
      };
    }

    try {
      console.log(`[publish] POST /posts ${names} key ...${key.slice(-6)}`);
      const resp = await zfetchWith<{
        post?: { _id?: string; id?: string; platforms?: ZPlatform[] };
      }>(
        key,
        "POST",
        "/posts",
        { body, timeoutMs: POST_TIMEOUT }
      );
      const rp = resp.post?.platforms || [];
      const zernioPostId = (resp.post?._id || resp.post?.id)
        ? String(resp.post._id || resp.post?.id)
        : undefined;
      // platformPostId để scope rule Comment-to-DM đúng bài. Chỉ có khi đăng ngay;
      // bài hẹn lịch chưa lên nền tảng nên Zernio không trả id.
      const used = new Set<number>();
      for (const t of tgts) result[t.slot] = entryFor(matchEntry(rp, t, used), t, zernioPostId);
      if (
        !scheduleFuture &&
        zernioPostId &&
        tgts.some((t) => (result[t.slot] as PublishResult).status === "pending")
      ) {
        toSettle.push({ key, postId: zernioPostId, targets: tgts });
      }
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[publish] ${names} lỗi: ${msg}`);
      for (const t of tgts) {
        result[t.slot] = { status: "failed", account: t.label, reason: msg.slice(0, 200) } as PublishResult;
      }
    }
  }

  // Chờ nền tảng nào còn pending chốt xong rồi mới trả kết quả.
  await Promise.all(toSettle.map((s) => settlePending(s.key, s.postId, s.targets, result)));

  // Comment tự động do Zernio lo (firstComment / mắt xích cuối chuỗi Threads) nên chỉ
  // báo là đã gửi kèm, không có xác nhận thành công thật từ nền tảng.
  if (commentText) {
    for (const t of targets) {
      const r = result[t.slot] as PublishResult | undefined;
      if (!r || r.status !== "ok") continue;
      r.comment =
        NATIVE_COMMENT.includes(t.platform) || t.platform === "threads"
          ? { status: "sent" }
          : { status: "skipped", reason: `${t.platform} không comment tự động được` };
    }
  }

  const statuses = slots.map((s) => (result[s] as PublishResult | undefined)?.status);
  if (statuses.some((status) => status === "failed")) result.status = "failed";
  else if (statuses.some((status) => status === "pending")) result.status = "pending";

  return result;
}
