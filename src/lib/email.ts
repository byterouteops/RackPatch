/**
 * Transactional email via Resend (same env contract as magic-link sign-in).
 * Returns `skipped` when RESEND_API_KEY is not configured.
 */
export type SendEmailResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true }
  | { ok: false; error: string };

export async function sendEmail(input: {
  to: string[];
  subject: string;
  text: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`[email] RESEND_API_KEY not set; skipped "${input.subject}" to ${input.to.length} recipient(s)`);
    return { ok: true, skipped: true };
  }
  const from = process.env.EMAIL_FROM || "RackPatch <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, text: input.text }),
    });
    if (!res.ok) {
      return { ok: false, error: `Resend responded ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email send failed" };
  }
}
