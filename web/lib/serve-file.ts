import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import fsSync from "node:fs";

// Trả file kèm Range: thiếu Accept-Ranges là <video> không tua được, chỉ phát từ đầu.
export async function serveFile(
  req: NextRequest,
  file: string,
  contentType: string
): Promise<NextResponse> {
  const size = fsSync.statSync(file).size;
  const buf = await fs.readFile(file);
  const range = req.headers.get("range");
  const m = range?.match(/bytes=(\d+)-(\d*)/);
  if (m) {
    const start = Math.min(parseInt(m[1], 10), size - 1);
    const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    return new NextResponse(new Uint8Array(buf.subarray(start, end + 1)), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: { "Content-Type": contentType, "Content-Length": String(size), "Accept-Ranges": "bytes" },
  });
}
