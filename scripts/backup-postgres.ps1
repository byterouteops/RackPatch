# Backup RackPatch PostgreSQL to a timestamped dump (local/dev).
# Usage: .\scripts\backup-postgres.ps1 [-OutDir .\backups]
param(
  [string]$OutDir = ".\backups",
  [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
  $DatabaseUrl = "postgresql://rackpatch:rackpatch@localhost:5432/rackpatch"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $OutDir "rackpatch-$stamp.dump"

Write-Host "Writing $out"
docker compose exec -T postgres pg_dump -U rackpatch -d rackpatch -Fc | Set-Content -AsByteStream -Path $out
Write-Host "Done. Verify restore in a disposable database before relying on this file."
