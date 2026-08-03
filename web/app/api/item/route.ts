import { NextRequest, NextResponse } from "next/server";
import { getItem, saveItem, type ContentItem } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "thiếu id" }, { status: 400 });
  const item = await getItem(id);
  if (!item) return NextResponse.json({ error: "không tìm thấy" }, { status: 404 });
  return NextResponse.json({ item });
}

// Lưu chỉnh sửa (body, caption, threads...) → content/ + mirror Obsidian.
export async function PUT(req: NextRequest) {
  try {
    const item = (await req.json()) as ContentItem;
    if (!item?.id) return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    const saved = await saveItem(item);
    return NextResponse.json({ item: saved });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Cập nhật 1 phần (status khi kéo Kanban, publish_at khi kéo Calendar…).
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string } & Partial<ContentItem>;
    if (!body?.id) return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    const cur = await getItem(body.id);
    if (!cur) return NextResponse.json({ error: "không tìm thấy" }, { status: 404 });
    const { id, ...partial } = body;
    const saved = await saveItem({ ...cur, ...partial, id });
    return NextResponse.json({ item: saved });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
