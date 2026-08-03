import { NextRequest, NextResponse } from "next/server";
import {
  listAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
} from "@/lib/zernio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const data = await listAutomations({
      profileId: sp.get("profileId") || undefined,
      accountId: sp.get("accountId") || undefined,
    });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      profileId: string;
      accountId: string;
      name: string;
      dmMessage: string;
      keywords?: string[];
      matchMode?: "exact" | "contains";
      platformPostId?: string;
      commentReply?: string;
    };
    if (!body.profileId || !body.accountId || !body.name?.trim() || !body.dmMessage?.trim()) {
      return NextResponse.json(
        { error: "thiếu profileId/accountId/name/dmMessage" },
        { status: 400 }
      );
    }
    const data = await createAutomation({
      profileId: body.profileId,
      accountId: body.accountId,
      name: body.name,
      dmMessage: body.dmMessage,
      keywords: body.keywords,
      matchMode: body.matchMode,
      platformPostId: body.platformPostId,
      commentReply: body.commentReply,
    });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { id: string } & Record<string, unknown>;
    if (!body.id) {
      return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    }
    const { id, ...fields } = body;
    const data = await updateAutomation(id, fields as Parameters<typeof updateAutomation>[1]);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    }
    const data = await deleteAutomation(id);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
