# Restore a pg_dump -Fc file into a disposable Postgres (NEVER run against production without approval).
# Usage: .\scripts\restore-postgres.ps1 -DumpFile .\backups\rackpatch-....dump
param(
  [Parameter(Mandatory = $true)][string]$DumpFile,
  [switch]$IUnderstandThisIsDestructive
)

if (-not $IUnderstandThisIsDestructive) {
  Write-Error "Refusing: pass -IUnderstandThisIsDestructive after confirming target is disposable."
  exit 1
}

if (-not (Test-Path $DumpFile)) {
  Write-Error "Dump not found: $DumpFile"
  exit 1
}

Write-Host "Restoring $DumpFile into compose postgres (destructive to that database)..."
Get-Content -AsByteStream $DumpFile | docker compose exec -T postgres pg_restore -U rackpatch -d rackpatch --clean --if-exists
Write-Host "Restore finished. Run migrations if needed: npx prisma migrate deploy"
