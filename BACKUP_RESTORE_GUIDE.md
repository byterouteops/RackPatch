# Backup and restore guide (v1)

RackPatch v1 stores durable state in **PostgreSQL only**.

## Backup (PowerShell)

```powershell
docker compose up -d postgres
.\scripts\backup-postgres.ps1 -OutDir .\backups
```

Requires Docker Compose Postgres running. Prefer `pg_dump -Fc` via the script.

## Restore (disposable only)

```powershell
.\scripts\restore-postgres.ps1 -DumpFile .\backups\rackpatch-YYYYMMDD-HHMMSS.dump -IUnderstandThisIsDestructive
npx prisma migrate deploy
```

**Never** restore over production without explicit approval and a verified pre-restore backup.

## Railway

Platform snapshots are not a substitute for application-level `pg_dump` procedures. Schedule dumps or use Railway’s documented backup options and test restores regularly.
