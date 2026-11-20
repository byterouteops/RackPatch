# Template deployment guide

1. Click Deploy on Railway (URL TBD after publish).  
2. Provision Postgres + web service.  
3. Set `BETTER_AUTH_SECRET` and public URL vars.  
4. Wait for migrate + health check.  
5. Sign in / create first workspace owner via magic link (configure Resend) or temporary non-prod flow only in private labs.  
6. Optional: `SEED_DEMO` on empty DB only.

See RAILWAY_ENVIRONMENT.md and RAILWAY_TROUBLESHOOTING.md.
