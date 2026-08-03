import { NextResponse } from "next/server";
import { getKey, setKey } from "@/lib/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ zernio: !!getKey("ZERNIO_API_KEY") });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { zernioKey?: string };
    if (typeof body.zernioKey === "string" && body.zernioKey.trim()) {
      setKey("ZERNIO_API_KEY", body.zernioKey);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
