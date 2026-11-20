# Railway / production environment variables

Names match the running application (`src/lib/env.ts`, `src/lib/auth.ts`).

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Session signing secret (long random) |
| `BETTER_AUTH_URL` | Yes | Canonical public app URL (`https://…`) |
| `NEXT_PUBLIC_APP_URL` | Recommended | Same as auth URL for client links |
| `NODE_ENV` | Yes (prod) | `production` |
| `PORT` | Auto | Set by Railway; app binds `0.0.0.0` |
| `ENABLE_DEV_LOGIN` | Must be off in prod | Dev email/password login |
| `HOSTED_SAAS` | No | `true` enables PILOT/PAID mutation gate |
| `RESEND_API_KEY` | No | Magic-link email |
| `EMAIL_FROM` | No | From address when using Resend |
| `PLATFORM_ADMIN_EMAILS` | No | Comma-separated platform admins |
| `PILOT_NOTIFY_EMAIL` | No | Pilot request notifications |
| `SEED_DEMO` | No | Opt-in synthetic seed only |

Never commit real secret values. Copy from `.env.example` locally.
