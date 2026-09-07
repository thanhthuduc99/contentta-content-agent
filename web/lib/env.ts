import { config } from "dotenv";
import path from "node:path";

// web/ sits inside the Content Agent repo. Secrets live in app/.env (Zernio,
// Gemini, account IDs) and the root .env. Load both once, app/.env wins.
const REPO_ROOT = path.resolve(process.cwd(), "..");

let loaded = false;
export function loadEnv() {
  if (loaded) return;
  config({ path: path.join(REPO_ROOT, ".env") });
  config({ path: path.join(REPO_ROOT, "app", ".env"), override: true });
  loaded = true;
}

loadEnv();
