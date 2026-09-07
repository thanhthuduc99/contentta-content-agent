#!/usr/bin/env bash
set -euo pipefail

WITH_VIDEO=0
for arg in "$@"; do
  [ "$arg" = "--with-video" ] && WITH_VIDEO=1
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

command -v node >/dev/null 2>&1 || { echo "Node.js is missing. Install Node.js 20.9+ and run this script again." >&2; exit 1; }

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)' \
  || { echo "Node.js is too old. This app requires Node.js 20.9 or newer." >&2; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

mkdir -p content/scripts content/posts content/shorts content/_media research/daily web/data downloads

npm ci --prefix web

if [ "$WITH_VIDEO" = "1" ]; then
  echo
  echo "Installing video build sandboxes..."
  for sb in edit-agent/sandbox/contentta-daily-ai-news edit-agent/sandbox/contentta-yt-summary; do
    [ -d "$sb" ] || continue
    npm ci --prefix "$sb"
    if [ ! -f "$sb/.env" ] && [ -f "$sb/.env.example" ]; then
      cp "$sb/.env.example" "$sb/.env"
      echo "Created $sb/.env"
    fi
  done
  echo "Set DAILY_NEWS_BUILD_ENABLED=1 and OPENAI_API_KEY in .env to enable video builds."
fi

echo
echo "Setup complete. Run: npm run dev"
echo "Open: http://localhost:8502"

command -v claude >/dev/null 2>&1 || echo "Warning: Claude Code was not found. The app still opens, but AI writing and research are unavailable."
for tool in ffmpeg yt-dlp; do
  command -v "$tool" >/dev/null 2>&1 || echo "Warning: $tool was not found. Video build and downloads need it."
done
