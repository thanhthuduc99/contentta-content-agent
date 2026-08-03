import { NextRequest, NextResponse } from "next/server";
import { researchLink, saveResearch } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { url, text } = (await req.json()) as { url?: string; text?: string };
    if (!url?.trim() && !text?.trim()) {
      return NextResponse.json({ error: "thiếu link hoặc nội dung" }, { status: 400 });
    }
    const { title, source, markdown } = await researchLink({ url, text });
    const rel = await saveResearch(markdown, title, { title, source });
    return NextResponse.json({ title, source, markdown, rel });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
