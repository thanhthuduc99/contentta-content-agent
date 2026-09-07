import { NextRequest, NextResponse } from "next/server";
import { groupHealth, groupPost, loadGroups, GroupBusyError } from "@/lib/group-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

// GET → sức khỏe: phiên FB, relay Zalo (tự mở tunnel), có job đang chạy không.
export async function GET() {
  try {
    return NextResponse.json(await groupHealth());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST { id, caption, files, groupIds } → đăng đồng bộ, trả { result, item? }.
// Lỗi từng group nằm TRONG result (HTTP 200), giống /api/publish. 409 khi đang có job khác.
export async function POST(req: NextRequest) {
  try {
    const { id, caption, files, groupIds } = (await req.json()) as {
      id: string;
      caption: string;
      files?: string[];
      groupIds?: string[];
    };
    if (!id) return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    if (!caption?.trim()) return NextResponse.json({ error: "thiếu caption" }, { status: 400 });
    if (!Array.isArray(groupIds) || !groupIds.length) {
      return NextResponse.json({ error: "chưa chọn group nào" }, { status: 400 });
    }
    const groups = (await loadGroups()).filter((g) => g.enabled && groupIds.includes(g.id));
    const out = await groupPost({
      id,
      caption,
      files: Array.isArray(files) ? files : [],
      fbTargets: groups.filter((g) => g.platform === "fb").map((g) => g.target),
      zaloTargets: groups.filter((g) => g.platform === "zalo").map((g) => g.target),
    });
    return NextResponse.json(out);
  } catch (e) {
    const status = e instanceof GroupBusyError ? 409 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
