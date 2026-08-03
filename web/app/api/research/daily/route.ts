import { NextResponse } from "next/server";
import { runDaily } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

async function handler(force: boolean) {
  try {
    const r = await runDaily({ force });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// GET = timer/catch-up nội bộ (skip nếu đã chạy hôm nay). POST = bấm tay "Chạy daily ngay" (force).
export const GET = () => handler(false);
export const POST = () => handler(true);
