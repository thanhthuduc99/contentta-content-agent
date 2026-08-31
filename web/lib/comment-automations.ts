import {
  listAccountsAll,
  zernioKeys,
  zfetchWith,
  type MappedAccount,
} from "./zernio";

export type NativeAutomation = {
  id: string;
  accountId: string;
  platform?: string;
  name?: string;
  keywords: string[];
  matchMode?: string;
  dmMessage: string;
  commentReply?: string;
  platformPostId?: string;
  postId?: string;
  postTitle?: string;
  isActive: boolean;
  stats?: Record<string, number>;
  createdAt?: string;
  updatedAt?: string;
  /** Internal workspace key; never serialized to the browser. */
  _key?: string;
};

type NativeAutomationResponse = { automations?: NativeAutomation[] };
type NativePostResponse = {
  post?: {
    _id?: string;
    platforms?: Array<{
      platform?: string;
      platformPostId?: string;
      status?: string;
      platformPostUrl?: string;
    }>;
  };
};

export type CreateNativeAutomationInput = {
  accountId: string;
  platform?: string;
  platformPostId?: string;
  postId?: string;
  postTitle?: string;
  name?: string;
  keywords: string[];
  dmMessage: string;
  commentReply?: string;
};

function platformOf(account: MappedAccount): string {
  return account.platform.toLowerCase();
}

async function accountFor(accountId: string): Promise<MappedAccount> {
  const account = (await listAccountsAll()).find((a) => a.accountId === accountId);
  if (!account) throw new Error("Không tìm thấy account trong Zernio");
  return account;
}

async function keyForAutomation(id: string, accountId?: string): Promise<string> {
  if (accountId) return (await accountFor(accountId)).key;
  const all = await listNativeAutomations();
  const found = all.find((a) => a.id === id);
  if (!found?._key) throw new Error("Không tìm thấy workspace của automation");
  return found._key;
}

export async function listNativeAutomations(): Promise<NativeAutomation[]> {
  const out: NativeAutomation[] = [];
  const keys = zernioKeys();
  if (!keys.length) throw new Error("ZERNIO_API_KEY chưa cấu hình");
  let succeeded = 0;
  let firstError: Error | null = null;
  await Promise.all(
    keys.map(async (key) => {
      try {
        const data = await zfetchWith<NativeAutomationResponse>(key, "GET", "/comment-automations");
        for (const automation of data.automations || []) out.push({ ...automation, _key: key });
        succeeded++;
      } catch (e) {
        if (!firstError) firstError = e as Error;
      }
    })
  );
  if (!succeeded && firstError) throw firstError;
  return out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function createNativeAutomation(input: CreateNativeAutomationInput) {
  const account = await accountFor(input.accountId);
  const platform = (input.platform || platformOf(account)).toLowerCase();
  if (platform !== "facebook" && platform !== "instagram") {
    throw new Error("Comment-to-DM native chỉ hỗ trợ Facebook và Instagram");
  }
  if (!account.profileId) throw new Error("Account Zernio chưa có profileId");
  if (input.platformPostId && !input.postId) {
    throw new Error("Rule theo post cần cả Zernio post ID và platform post ID");
  }
  if (!input.dmMessage.trim()) throw new Error("Thiếu nội dung DM");

  const body: Record<string, unknown> = {
    profileId: account.profileId,
    accountId: account.accountId,
    name: input.name || `Comment to DM · ${platform}`,
    keywords: input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
    matchMode: "contains",
    dmMessage: input.dmMessage.trim(),
  };
  if (input.commentReply?.trim()) body.commentReply = input.commentReply.trim();
  if (input.platformPostId) body.platformPostId = input.platformPostId;
  if (input.postId) body.postId = input.postId;
  if (input.postTitle?.trim()) body.postTitle = input.postTitle.trim().slice(0, 160);

  const data = await zfetchWith<{ automation?: NativeAutomation }>(account.key, "POST", "/comment-automations", { body });
  return data.automation || data;
}

export async function updateNativeAutomation(
  id: string,
  accountId: string | undefined,
  body: Partial<Pick<NativeAutomation, "name" | "keywords" | "matchMode" | "dmMessage" | "commentReply" | "isActive">>
) {
  const key = await keyForAutomation(id, accountId);
  return zfetchWith<{ automation?: NativeAutomation }>(
    key,
    "PATCH",
    `/comment-automations/${encodeURIComponent(id)}`,
    { body }
  );
}

export async function deleteNativeAutomation(id: string, accountId?: string) {
  const key = await keyForAutomation(id, accountId);
  return zfetchWith(key, "DELETE", `/comment-automations/${encodeURIComponent(id)}`);
}

async function getPost(account: MappedAccount, postId: string) {
  return zfetchWith<NativePostResponse>(
    account.key,
    "GET",
    `/posts/${encodeURIComponent(postId)}`,
    { timeoutMs: 30_000 }
  );
}

export async function waitForPlatformPostId(
  accountId: string,
  postId: string,
  platform: string,
  initialPlatformPostId?: string
): Promise<string> {
  if (initialPlatformPostId) return initialPlatformPostId;
  const account = await accountFor(accountId);
  const wanted = platform.toLowerCase();
  const deadline = Date.now() + 60_000;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const data = await getPost(account, postId);
    const hit = data.post?.platforms?.find((p) => (p.platform || "").toLowerCase() === wanted);
    lastStatus = hit?.status || lastStatus;
    if (hit?.platformPostId) return String(hit.platformPostId);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `Zernio chưa trả platform post ID sau 60 giây${lastStatus ? ` (status: ${lastStatus})` : ""}`
  );
}
