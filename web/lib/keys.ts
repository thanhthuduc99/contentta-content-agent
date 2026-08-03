import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./env";

// Khách nhập key qua Settings → lưu vào data/app-keys.json (ưu tiên hơn .env).
const STORE = path.join(process.cwd(), "data", "app-keys.json");

function readStore(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function getKey(name: string): string {
  loadEnv();
  const store = readStore();
  if (store[name]) return store[name];
  return process.env[name] || "";
}

export function setKey(name: string, val: string): void {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  const store = readStore();
  store[name] = (val || "").trim();
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
}

export function hasKey(name: string): boolean {
  return !!getKey(name);
}
