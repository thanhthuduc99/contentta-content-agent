import { NextResponse } from "next/server";
import { listYoutubePlaylists } from "@/lib/zernio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ playlists: await listYoutubePlaylists() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, playlists: [] }, { status: 500 });
  }
}
