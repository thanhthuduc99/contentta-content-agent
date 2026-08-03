import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { saveItem, newId, type ContentItem } from "@/lib/content";
import { CONTENT_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// CSV parser (RFC4180-ish: hỗ trợ field có dấu ngoặc kép, phẩy, xuống dòng).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// schedule_time → ISO giờ VN. Chấp nhận ISO sẵn, hoặc "YYYY-MM-DD HH:mm".
function toIso(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) return v; // đã có timezone
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}:00+07:00`;
  const d = v.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (d) return `${d[1]}T09:00:00+07:00`;
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const { csv } = (await req.json()) as { csv?: string };
    if (!csv?.trim()) {
      return NextResponse.json({ error: "thiếu nội dung CSV" }, { status: 400 });
    }
    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return NextResponse.json({ error: "CSV cần header + ít nhất 1 dòng" }, { status: 400 });
    }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const ci = {
      content: col("post_content"),
      platforms: col("platforms"),
      schedule: col("schedule_time"),
    };
    if (ci.content === -1) {
      return NextResponse.json(
        { error: "CSV thiếu cột bắt buộc: post_content" },
        { status: 400 }
      );
    }

    const date = new Date().toISOString().slice(0, 10);
    const results: Array<{ row: number; ok: boolean; id?: string; error?: string }> = [];

    // Đảm bảo id duy nhất (tránh ghi đè dòng trùng dòng-đầu + cùng ngày).
    const used = new Set<string>();
    const full = (rid: string) => path.join(CONTENT_DIR, ...rid.split("/"));
    const uniqueId = (base: string): string => {
      let candidate = base;
      let n = 2;
      while (used.has(candidate) || existsSync(full(candidate))) {
        candidate = base.replace(/\.md$/, `-${n}.md`);
        n++;
      }
      used.add(candidate);
      return candidate;
    };

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const body = (r[ci.content] || "").trim();
      if (!body) {
        results.push({ row: i, ok: false, error: "post_content trống" });
        continue;
      }
      const platforms =
        ci.platforms > -1
          ? (r[ci.platforms] || "")
              .split(/[;|]/)
              .map((p) => p.trim().toLowerCase())
              .filter(Boolean)
          : [];
      const publish_at = ci.schedule > -1 ? toIso(r[ci.schedule] || "") : null;
      const topic = body.split("\n")[0].slice(0, 60) || "bulk csv";

      const item: ContentItem = {
        id: uniqueId(newId("post", topic, date)),
        type: "post",
        content_type: "chia-se-kien-thuc",
        platform: platforms[0] || "facebook",
        date,
        topic,
        status: publish_at ? "scheduled" : "draft",
        publish_at,
        posted: false,
        posted_at: null,
        parent: null,
        body,
      };
      try {
        await saveItem(item);
        results.push({ row: i, ok: true, id: item.id });
      } catch (e) {
        results.push({ row: i, ok: false, error: (e as Error).message });
      }
    }

    const created = results.filter((r) => r.ok).length;
    return NextResponse.json({ created, total: rows.length - 1, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
