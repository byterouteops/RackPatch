# Resend setup (production magic links)

Password sign-in works for the first administrator. Magic links for other operators need Resend.

## Steps

1. Sign in at https://resend.com/api-keys (GitHub/Google).
2. Create an API key.
3. On Railway → **RackPatch** → **web** → Variables, set:

```text
RESEND_API_KEY=<your key>
EMAIL_FROM=RackPatch <onboarding@resend.dev>
```

Use your verified domain in `EMAIL_FROM` once DNS is configured. Until then, Resend’s `onboarding@resend.dev` works for testing to your own mailbox.

4. Redeploy the web service (or wait for the next deploy).
5. On `/sign-in`, use **Magic link** with your admin email and confirm delivery.

`EMAIL_FROM` is already set on the live smoke project; `RESEND_API_KEY` is still missing until you paste the key.
