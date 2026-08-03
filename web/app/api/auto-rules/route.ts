import { NextRequest, NextResponse } from "next/server";
import { loadRules, saveRules, type AutoRule } from "@/lib/auto-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rules = await loadRules();
    return NextResponse.json({ rules });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Omit<AutoRule, "id">;
    const rule: AutoRule = {
      id: crypto.randomUUID(),
      accountId: body.accountId,
      platform: body.platform,
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      message: body.message || "",
      commentReply: body.commentReply?.trim() || undefined,
      postIds:
        Array.isArray(body.postIds) && body.postIds.length ? body.postIds : undefined,
      react: !!body.react,
      enabled: body.enabled !== false,
    };
    const rules = await loadRules();
    rules.push(rule);
    await saveRules(rules);
    return NextResponse.json({ rule });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { id: string } & Partial<AutoRule>;
    if (!body.id) {
      return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    }
    const { id, ...partial } = body;
    const rules = await loadRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "không tìm thấy rule" }, { status: 404 });
    }
    rules[idx] = { ...rules[idx], ...partial, id };
    await saveRules(rules);
    return NextResponse.json({ rule: rules[idx] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    }
    const rules = await loadRules();
    await saveRules(rules.filter((r) => r.id !== id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
