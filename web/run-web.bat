@echo off
cd /d "%~dp0"
if not exist ".next" (
  echo [Content Agent] Build lan dau...
  call npm run build
)
echo [Content Agent] Chay tai http://localhost:8502
call npm run start
