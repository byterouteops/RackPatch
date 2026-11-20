import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { getAppUrl, isDevLoginEnabled } from "@/lib/env";

async function sendMagicLinkEmail(data: { email: string; url: string }) {
  if (process.env.RESEND_API_KEY) {
    const from = process.env.EMAIL_FROM || "RackPatch <onboarding@resend.dev>";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: data.email,
        subject: "Your RackPatch sign-in link",
        text: `Sign in to RackPatch: ${data.url}\n\nThis link expires shortly.`,
      }),
    });
    return;
  }

  // Development fallback: log the link (never log secrets beyond the one-time URL)
  console.info(`[auth] Magic link for ${data.email}: ${data.url}`);
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: getAppUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    // Password sign-in always available (first-run admin + existing credential accounts).
    // Open email/password registration only when ENABLE_DEV_LOGIN (blocked in production).
    enabled: true,
    disableSignUp: !isDevLoginEnabled(),
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ email, url });
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  trustedOrigins: [getAppUrl()],
});

export type AuthSession = typeof auth.$Infer.Session;
