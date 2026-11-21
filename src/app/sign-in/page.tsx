import Link from "next/link";
import { isDevLoginEnabled } from "@/lib/env";
import { isBootstrapRequired } from "@/lib/bootstrap";
import { BrandMark } from "@/components/brand-mark";
import { SignInForm } from "@/components/sign-in-form";
import { BootstrapForm } from "@/components/bootstrap-form";
import { Card } from "@/components/ui";

// Needs live DB for first-run bootstrap detection — never prerender at image build.
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const bootstrapRequired = await isBootstrapRequired();
  const devLoginEnabled = isDevLoginEnabled();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <div className="h-1 w-full bg-[var(--accent-line)]" aria-hidden />
      <header className="border-b border-[var(--border)] bg-[var(--chrome)] px-4 py-3">
        <Link
          href="/"
          className="mx-auto flex max-w-md items-center gap-2.5 text-sm font-semibold text-white"
        >
          <BrandMark size={28} />
          <span>
            RackPatch
            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-white/50">
              {bootstrapRequired ? "Initial setup" : "Sign in"}
            </span>
          </span>
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {bootstrapRequired ? (
            <Card
              title="Create administrator"
              description="First-run setup for this RackPatch instance. Choose a strong password."
            >
              <BootstrapForm />
            </Card>
          ) : (
            <Card
              title="Operator sign-in"
              description="Use your work email. Sessions last 14 days."
            >
              <SignInForm
                devLoginEnabled={devLoginEnabled}
                bootstrapRequired={false}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
