# Contributing to RackPatch

Thanks for your interest in improving RackPatch.

## Ground rules

- Preserve existing cabling workflow behavior unless a change is intentional and tested.
- Do not commit secrets, `.env` files, customer cabling plans, or production databases.
- Prefer small, focused pull requests with tests for parsers, authz, and verification logic.

## Development setup

```powershell
git clone <repository-url>
cd RackPatch
copy .env.example .env
docker compose up -d
npm ci
npx prisma migrate deploy
npm run seed:demo   # optional; requires SEED_DEMO=true
npm run dev
```

## Checks before opening a PR

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## Security issues

Do **not** file public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
