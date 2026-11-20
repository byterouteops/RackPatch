import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { acceptInvitation } from "@/app/actions/workspace";
import { Button, Card, EmptyState } from "@/components/ui";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getSessionUser();

  if (!user) {
    redirect(`/sign-in?next=/invite/${encodeURIComponent(token)}`);
  }

  let result: Awaited<ReturnType<typeof acceptInvitation>> | null = null;
  let error: string | null = null;

  try {
    result = await acceptInvitation(token);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not accept invitation";
  }

  if (result) {
    redirect(`/app/projects/${result.projectId}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <Card title="Invitation" className="w-full max-w-md">
        {error ? (
          <>
            <EmptyState title="Unable to accept" description={error} />
            <Button href="/app" variant="secondary" className="mt-4 w-full">
              Go to app
            </Button>
          </>
        ) : (
          <p className="text-sm text-[var(--muted-fg)]">Processing…</p>
        )}
      </Card>
    </div>
  );
}