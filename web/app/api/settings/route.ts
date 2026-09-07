import { NextResponse } from "next/server";
import { getKey, setKey } from "@/lib/keys";
import { relaySecret } from "@/lib/group-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    zernio: !!getKey("ZERNIO_API_KEY"),
    zaloRelay: !!relaySecret(),
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { zernioKey?: string; zaloRelaySecret?: string };
    if (typeof body.zernioKey === "string" && body.zernioKey.trim()) {
      setKey("ZERNIO_API_KEY", body.zernioKey);
    }
    if (typeof body.zaloRelaySecret === "string" && body.zaloRelaySecret.trim()) {
      setKey("ZALO_RELAY_SECRET", body.zaloRelaySecret);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
