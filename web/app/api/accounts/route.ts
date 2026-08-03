import { NextResponse } from "next/server";
import { listAccountsAll } from "@/lib/zernio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accs = await listAccountsAll();
    const accounts = accs.map((a) => ({
      id: a.accountId,
      platform: a.platform,
      name: a.displayName,
    }));
    return NextResponse.json({ accounts, profileId: accs[0]?.profileId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
