import { NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const fromDate = sp.get("from") || undefined;
    const toDate = sp.get("to") || undefined;
    const platform = sp.get("platform") || undefined;
    const dashboard = await getDashboard({ fromDate, toDate, platform });
    return NextResponse.json(dashboard);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
