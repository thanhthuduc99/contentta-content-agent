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

Write-Host ""
Write-Host "Setup complete. Run: npm run dev"
Write-Host "Open: http://localhost:8502"
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Warning "Claude Code was not found. The app still opens, but AI writing and research are unavailable."
}
