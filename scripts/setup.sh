#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v node >/dev/null 2>&1; then
  echo "Chưa có Node.js. Cài Node.js LTS 20.9+ rồi chạy lại." >&2
  exit 1
fi

if ! node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)"; then
  echo "Node.js quá cũ. App cần Node.js 20.9 trở lên." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Đã tạo .env từ .env.example"
fi

mkdir -p content/scripts content/posts content/shorts content/_media research/daily web/data downloads
npm ci --prefix web

echo
echo "Cài xong. Chạy: npm run dev"
echo "Mở: http://localhost:8502"
if ! command -v claude >/dev/null 2>&1; then
  echo "Lưu ý: chưa thấy Claude Code; AI viết/research chưa hoạt động."
fi
