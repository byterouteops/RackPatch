# Builds and/or starts the SIT production server (port 3100, isolated rackpatch_sit DB, .next-sit dist dir).
# Usage: powershell -NoProfile -File scripts/sit-server.ps1 [-Build] [-Start]
param([switch]$Build, [switch]$Start)
$ErrorActionPreference = "Stop"
$env:NEXT_DIST_DIR = ".next-sit"
$env:DATABASE_URL = "postgresql://rackpatch:rackpatch@localhost:5432/rackpatch_sit?schema=public"
$env:BETTER_AUTH_URL = "http://localhost:3100"
$env:NODE_ENV = "production"
$env:ENABLE_DEV_LOGIN = "false"
# Hosted mode so the pilot/paid commercial gate is exercised (demo projects bypass it by design).
$env:HOSTED_SAAS = "true"
$env:PLATFORM_ADMIN_EMAILS = "admin@rackpatch.local"
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
if ($Build) {
  npx next build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if ($Start) {
  npx next start -p 3100
}
