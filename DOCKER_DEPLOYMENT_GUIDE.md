# Docker deployment guide

## Postgres only (local dev)

```powershell
docker compose up -d
copy .env.example .env
# set BETTER_AUTH_SECRET to 32+ random chars
npm ci
npx prisma migrate deploy
npm run dev
```

## Full stack profile

```powershell
$env:BETTER_AUTH_SECRET = (openssl rand -base64 32)
docker compose --profile full up -d --build
```

Health: `http://localhost:3000/api/ready`

Do not publish Postgres port on internet-facing hosts.
