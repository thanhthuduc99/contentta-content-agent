import { NextRequest, NextResponse } from "next/server";
import { scrapeSource, saveResearch } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KINDS = ["github-day", "github-month", "reddit"] as const;
type Kind = (typeof KINDS)[number];

export async function POST(req: NextRequest) {
  try {
    const { kind } = (await req.json()) as { kind?: string };
    if (!kind || !KINDS.includes(kind as Kind)) {
      return NextResponse.json({ error: "kind không hợp lệ" }, { status: 400 });
    }
    const { title, markdown, source } = await scrapeSource(kind as Kind);
    const rel = await saveResearch(markdown, title, { title, source });
    return NextResponse.json({ title, markdown, source, rel });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
