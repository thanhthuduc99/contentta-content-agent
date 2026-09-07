import { NextRequest, NextResponse } from "next/server";
import { loadGroups, saveGroups, relayGroupNames, type Group } from "@/lib/group-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FB_GROUP_RE = /^https:\/\/(www\.|m\.|web\.)?facebook\.com\/groups\/[^\s/?#]+/i;

// GET → danh sách group đã lưu. GET ?zalo=1 → tên group relay Zalo đang thấy (mở tunnel nếu cần).
export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("zalo")) {
      return NextResponse.json({ names: await relayGroupNames() });
    }
    return NextResponse.json({ groups: await loadGroups() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Group>;
    const platform = body.platform;
    const target = (body.target || "").trim();
    if (platform !== "fb" && platform !== "zalo") {
      return NextResponse.json({ error: "platform phải là fb hoặc zalo" }, { status: 400 });
    }
    if (!target) return NextResponse.json({ error: "thiếu target" }, { status: 400 });
    if (platform === "fb" && !FB_GROUP_RE.test(target)) {
      return NextResponse.json(
        { error: "link group Facebook phải dạng https://www.facebook.com/groups/<id>" },
        { status: 400 }
      );
    }
    const group: Group = {
      id: crypto.randomUUID(),
      platform,
      target,
      label: body.label?.trim() || undefined,
      enabled: body.enabled !== false,
    };
    const groups = await loadGroups();
    groups.push(group);
    await saveGroups(groups);
    return NextResponse.json({ group });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { id: string } & Partial<Group>;
    if (!body.id) return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    const { id, ...partial } = body;
    const groups = await loadGroups();
    const idx = groups.findIndex((g) => g.id === id);
    if (idx === -1) return NextResponse.json({ error: "không tìm thấy group" }, { status: 404 });
    groups[idx] = { ...groups[idx], ...partial, id };
    await saveGroups(groups);
    return NextResponse.json({ group: groups[idx] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    const groups = await loadGroups();
    await saveGroups(groups.filter((g) => g.id !== id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
