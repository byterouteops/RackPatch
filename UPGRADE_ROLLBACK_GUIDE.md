# Upgrade and rollback

1. Take `pg_dump` backup.
2. Deploy new image / `git` revision.
3. Run `npx prisma migrate deploy` (Railway pre-deploy does this).
4. Verify `/api/ready`.

**Rollback:** redeploy previous image. DB migrations are often **not** reversible — restore from backup into a disposable env and validate before any production restore.
