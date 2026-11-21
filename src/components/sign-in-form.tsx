"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, ErrorBanner, Input } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function SignInForm({
  devLoginEnabled,
  bootstrapRequired,
}: {
  devLoginEnabled: boolean;
  bootstrapRequired?: boolean;
}) {
  const [mode, setMode] = useState<"magic" | "password">(
    bootstrapRequired ? "password" : "magic",
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const email = String(new FormData(e.currentTarget).get("email") || "");
    try {
      const { error: err } = await authClient.signIn.magicLink({
        email,
        callbackURL: "/app",
      });
      if (err) throw new Error(err.message);
      setMessage(
        "Check your email for a sign-in link. In local dev without Resend, see the server console.",
      );
    } catch (err) {
      setError(actionErrorMessage(err, "Could not send magic link"));
    } finally {
      setPending(false);
    }
  }

  async function submitPassword(action: "signin" | "register", form: HTMLFormElement) {
    setPending(true);
    setError(null);
    setMessage(null);
    const fd = new FormData(form);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    const name = String(fd.get("name") || email.split("@")[0] || "User");
    try {
      if (action === "register") {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (err) throw new Error(err.message);
        setMessage("Account created. Signing you in…");
      }
      const { error: err } = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/app",
      });
      if (err) throw new Error(err.message);
      window.location.href = "/app";
    } catch (err) {
      setError(actionErrorMessage(err, "Sign-in failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex border border-[var(--border)] bg-[var(--muted)] p-0.5">
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] ${
            mode === "magic"
              ? "bg-white text-[var(--accent-ink)] shadow-sm"
              : "text-[var(--muted-fg)] hover:text-[var(--foreground)]"
          }`}
          onClick={() => setMode("magic")}
        >
          Magic link
        </button>
        <button
          type="button"
          className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] ${
            mode === "password"
              ? "bg-white text-[var(--accent-ink)] shadow-sm"
              : "text-[var(--muted-fg)] hover:text-[var(--foreground)]"
          }`}
          onClick={() => setMode("password")}
        >
          Password
        </button>
      </div>

      {error && <ErrorBanner message={error} />}
      {message && (
        <div className="border border-[var(--border)] border-l-4 border-l-[var(--accent)] bg-[var(--info-soft)] px-4 py-3 text-sm text-[#036a91]">
          {message}
        </div>
      )}

      {mode === "magic" ? (
        <form onSubmit={onMagicLink} className="space-y-4">
          <label className="block text-sm font-medium">
            Work email
            <Input name="email" type="email" required className="mt-1" autoComplete="email" />
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPassword("signin", e.currentTarget);
          }}
        >
          {devLoginEnabled && (
            <p className="border border-[var(--border)] border-l-4 border-l-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">
              Development registration enabled. Disabled in production.
            </p>
          )}
          {devLoginEnabled && (
            <label className="block text-sm font-medium">
              Name (register)
              <Input name="name" type="text" className="mt-1" autoComplete="name" />
            </label>
          )}
          <label className="block text-sm font-medium">
            Email
            <Input name="email" type="email" required className="mt-1" autoComplete="email" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1"
              autoComplete="current-password"
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "Working…" : "Sign in"}
            </Button>
            {devLoginEnabled && (
              <Button
                type="button"
                size="lg"
                variant="secondary"
                className="w-full"
                disabled={pending}
                onClick={(e) => {
                  const form = e.currentTarget.closest("form");
                  if (form) void submitPassword("register", form);
                }}
              >
                Register
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
