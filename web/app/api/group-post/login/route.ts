import { NextResponse } from "next/server";
import { startFbLogin, GroupBusyError } from "@/lib/group-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST → mở Chrome headed để user đăng nhập lại Facebook. Trả về ngay, theo dõi qua GET /api/group-post (busy).
export async function POST() {
  try {
    startFbLogin();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof GroupBusyError ? 409 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
