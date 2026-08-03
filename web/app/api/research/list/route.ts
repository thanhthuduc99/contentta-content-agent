import { NextRequest, NextResponse } from "next/server";
import { listResearch, readResearch } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const content = await readResearch(id);
      if (content == null) return NextResponse.json({ error: "không tìm thấy" }, { status: 404 });
      return NextResponse.json({ content });
    }
    const items = await listResearch();
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
