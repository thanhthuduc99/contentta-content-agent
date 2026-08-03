import { NextRequest, NextResponse } from "next/server";
import { automationLogs } from "@/lib/zernio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "thiếu id" }, { status: 400 });
    }
    const data = await automationLogs(id);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
