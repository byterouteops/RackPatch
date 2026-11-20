# First project quickstart (verified commands)

## Local

```powershell
docker compose up -d
copy .env.example .env
# Set BETTER_AUTH_SECRET to openssl rand -base64 32
npm ci
npx prisma migrate deploy
$env:SEED_DEMO="true"; npm run seed:demo
npm run dev
```

1. Open http://localhost:3000 → Sign in (dev login if `ENABLE_DEV_LOGIN=true` locally only).
2. Open seeded demo project **or** create workspace + project from `/app`.
3. Plan → import `fixtures/demo-cables.csv` if needed.
4. Mark C-201/C-202 Installed; LLDP import `fixtures/demo-lldp-leaf02.txt`.
5. Exceptions → expected vs observed; Handover snapshot.

Production: never enable `ENABLE_DEV_LOGIN`; configure Resend for magic links.
