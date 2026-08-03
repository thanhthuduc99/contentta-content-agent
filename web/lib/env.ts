import { config } from "dotenv";
import path from "node:path";

// web/ nằm trong repo Content Agent. Mặc định đọc secrets từ .env ở repo root.
// web/.env.local có thể override khi cần cấu hình riêng cho Next.js.
const REPO_ROOT = process.env.CONTENT_AGENT_ROOT
  ? path.resolve(process.env.CONTENT_AGENT_ROOT)
  : path.resolve(process.cwd(), "..");

let loaded = false;
export function loadEnv() {
  if (loaded) return;
  config({ path: path.join(REPO_ROOT, ".env") });
  config({ path: path.join(REPO_ROOT, "web", ".env.local"), override: true });
  loaded = true;
}

loadEnv();
