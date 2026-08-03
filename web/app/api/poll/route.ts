import { NextResponse } from "next/server";
import { pollOnce } from "@/lib/poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handler() {
  const r = await pollOnce();
  return NextResponse.json(r);
}

export const GET = handler;
export const POST = handler;
