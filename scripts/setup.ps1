param([switch]$WithVideo)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is missing. Install Node.js 20.9+ and run this script again."
}

node -e 'const [major, minor] = process.versions.node.split(String.fromCharCode(46)).map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)'
if ($LASTEXITCODE -ne 0) {
  throw "Node.js is too old. This app requires Node.js 20.9 or newer."
}

if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  Write-Host "Created .env from .env.example"
}

foreach ($dir in @("content/scripts", "content/posts", "content/shorts", "content/_media", "research/daily", "web/data", "downloads")) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

npm ci --prefix web

if ($WithVideo) {
  Write-Host ""
  Write-Host "Installing video build sandboxes..."
  foreach ($sb in @("edit-agent/sandbox/contentta-daily-ai-news", "edit-agent/sandbox/contentta-yt-summary")) {
    if (Test-Path -LiteralPath $sb) {
      npm ci --prefix $sb
      $sbEnv = Join-Path $sb ".env"
      $sbExample = Join-Path $sb ".env.example"
      if ((-not (Test-Path -LiteralPath $sbEnv)) -and (Test-Path -LiteralPath $sbExample)) {
        Copy-Item -LiteralPath $sbExample -Destination $sbEnv
        Write-Host "Created $sbEnv"
      }
    }
  }
  Write-Host "Set DAILY_NEWS_BUILD_ENABLED=1 and OPENAI_API_KEY in .env to enable video builds."
}

Write-Host ""
Write-Host "Setup complete. Run: npm run dev"
Write-Host "Open: http://localhost:8502"

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Warning "Claude Code was not found. The app still opens, but AI writing and research are unavailable."
}
foreach ($tool in @("ffmpeg", "yt-dlp")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Warning "$tool was not found. Video build and downloads need it."
  }
}
