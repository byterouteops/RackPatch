/**
 * Transactional email via Resend (same env contract as magic-link sign-in).
 * Returns `skipped` when RESEND_API_KEY is not configured.
 */
export type SendEmailResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true }
  | { ok: false; error: string };

export async function describeResendFailure(res: Response): Promise<string> {
  let message = "";
  try {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      message = typeof parsed.message === "string" ? parsed.message : body;
    } catch {
      message = body;
    }
  } catch {
    message = "";
  }
  return `HTTP ${res.status}${message ? ` ${message.slice(0, 500)}` : ""}`;
}

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
      const detail = await describeResendFailure(res);
      console.error(`[email] "${input.subject}" to ${input.to.length} recipient(s) failed: ${detail}`);
      return { ok: false, error: `Resend responded ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email send failed";
    console.error(`[email] "${input.subject}" to ${input.to.length} recipient(s) failed: ${message}`);
    return { ok: false, error: message };
  }
}
