// One-time YouTube OAuth consent. Chạy: node scripts/yt-oauth.mjs
// Lấy refresh_token rồi ghi vào app/.env (YOUTUBE_OAUTH_REFRESH_TOKEN).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "../../app/.env");
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

function readEnv() {
  const txt = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
function setEnv(key, val) {
  let txt = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  if (new RegExp(`^${key}=`, "m").test(txt)) txt = txt.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${val}`);
  else txt += `${txt.endsWith("\n") || txt === "" ? "" : "\n"}${key}=${val}\n`;
  fs.writeFileSync(ENV_PATH, txt, "utf8");
}

const env = readEnv();
const CLIENT_ID = env.YOUTUBE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = env.YOUTUBE_OAUTH_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Thiếu YOUTUBE_OAUTH_CLIENT_ID / SECRET trong app/.env");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get("code");
  if (!code) {
    res.writeHead(400); res.end("No code"); return;
  }
  try {
    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT, grant_type: "authorization_code",
      }),
    });
    const d = await tr.json();
    if (!d.refresh_token) {
      res.writeHead(500); res.end("Không nhận được refresh_token: " + JSON.stringify(d));
      console.error("Lỗi:", d);
      server.close(); process.exit(1);
    }
    setEnv("YOUTUBE_OAUTH_REFRESH_TOKEN", d.refresh_token);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>Xong! Đã lưu YouTube refresh token. Đóng tab này, restart app là YouTube analytics chạy.</h2>");
    console.log("OK — refresh_token đã ghi vào app/.env. Restart app (8502) để áp dụng.");
    server.close(); setTimeout(() => process.exit(0), 300);
  } catch (e) {
    res.writeHead(500); res.end(String(e)); server.close(); process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("\nMở link này trong trình duyệt (đăng nhập đúng Google có kênh YouTube):\n\n" + authUrl + "\n");
  exec(`start "" "${authUrl}"`, () => {});
});
