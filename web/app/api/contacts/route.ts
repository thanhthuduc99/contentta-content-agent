import { NextRequest, NextResponse } from "next/server";
import { listContacts, createContact } from "@/lib/zernio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const data = await listContacts({
      search: sp.get("search") || undefined,
      tag: sp.get("tag") || undefined,
    });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      profileId: string;
      name: string;
      email?: string;
      tags?: string[];
      notes?: string;
    };
    if (!body.profileId || !body.name?.trim()) {
      return NextResponse.json({ error: "thiếu profileId/name" }, { status: 400 });
    }
    const data = await createContact({
      profileId: body.profileId,
      name: body.name,
      email: body.email,
      tags: body.tags,
      notes: body.notes,
    });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
