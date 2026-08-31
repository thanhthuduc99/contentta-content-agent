import { NextRequest, NextResponse } from "next/server";
import {
  createNativeAutomation,
  deleteNativeAutomation,
  listNativeAutomations,
  updateNativeAutomation,
} from "@/lib/comment-automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicAutomation(a: Record<string, unknown>) {
  const { _key, ...safe } = a;
  return safe;
}

export async function GET() {
  try {
    const automations = await listNativeAutomations();
    return NextResponse.json({ automations: automations.map((a) => publicAutomation(a)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      accountId?: string;
      platform?: string;
      platformPostId?: string;
      postId?: string;
      postTitle?: string;
      name?: string;
      keywords?: string[] | string;
      dmMessage?: string;
      message?: string;
      commentReply?: string;
    };
    const keywords = Array.isArray(body.keywords)
      ? body.keywords
      : typeof body.keywords === "string"
      ? body.keywords.split(",")
      : [];
    if (!body.accountId || !keywords.some((k) => k.trim())) {
      return NextResponse.json({ error: "Thiếu accountId/keyword" }, { status: 400 });
    }
    const automation = await createNativeAutomation({
      accountId: body.accountId,
      platform: body.platform,
      platformPostId: body.platformPostId,
      postId: body.postId,
      postTitle: body.postTitle,
      name: body.name,
      keywords,
      dmMessage: body.dmMessage || body.message || "",
      commentReply: body.commentReply,
    });
    return NextResponse.json({ automation });
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status === 409 ? 409 : 502 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      accountId?: string;
      name?: string;
      keywords?: string[];
      matchMode?: string;
      dmMessage?: string;
      commentReply?: string;
      isActive?: boolean;
    };
    if (!body.id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
    const { id, accountId, ...partial } = body;
    const data = await updateNativeAutomation(id, accountId, partial);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status === 404 ? 404 : 502 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const accountId = req.nextUrl.searchParams.get("accountId") || undefined;
    if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
    await deleteNativeAutomation(id, accountId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status === 404 ? 404 : 502 });
  }
}
