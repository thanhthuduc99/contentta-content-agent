import "./env";
import fs from "node:fs/promises";

// Gen ảnh 1080x1080 bằng Gemini (tái dùng GEMINI_API_KEY trong app/.env).
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";

export function isConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || "").trim());
}

export async function generateImage(prompt: string, outFile: string): Promise<string> {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) throw new Error("GEMINI_API_KEY chưa cấu hình");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 400)}`);

  const data = (await r.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error("Gemini không trả về ảnh");
  await fs.writeFile(outFile, Buffer.from(b64, "base64"));
  return outFile;
}
