# Railway troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Deploy fails: ENABLE_DEV_LOGIN | Dev login left on | Unset variable; redeploy |
| 503 `/api/health` | DB unreachable or safety assert | Check `DATABASE_URL` reference; logs |
| Tables missing | Migrations not run | Ensure pre-deploy `prisma migrate deploy` |
| Magic links fail | No email provider | Set Resend vars or use console only in non-prod |
| Can't mutate project | `HOSTED_SAAS=true` and status NONE | Activate project or unset hosted flag |
| Auth redirects wrong host | `BETTER_AUTH_URL` mismatch | Set to public HTTPS domain |

Logs: Railway service → Deployments → View logs. Never paste secrets into issues.
