import Link from "next/link";
import { Bell } from "lucide-react";
import { requireSessionUser } from "@/lib/session";
import { listNotifications } from "@/lib/notifications";
import { MarkAllReadButton } from "@/components/mark-all-read-button";
import { PageHeader, EmptyState, Badge } from "@/components/ui";

export default async function NotificationsPage() {
  const user = await requireSessionUser();
  const items = await listNotifications(user.id, 100);

  return (
    <div>
      <PageHeader
        title="Notifications & activity"
        description="Assignments, plan applies, and project alerts for your account."
        actions={<MarkAllReadButton />}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" aria-hidden />}
          title="Inbox clear"
          description="You will see work-order assignments and integration alerts here."
        />
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {items.map((n) => (
            <li key={n.id} className={!n.readAt ? "bg-[var(--accent-soft)]" : undefined}>
              {n.href ? (
                <Link href={n.href} className="block px-4 py-3 hover:bg-[var(--muted)]">
                  <Row n={n} />
                </Link>
              ) : (
                <div className="px-4 py-3">
                  <Row n={n} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  n,
}: {
  n: {
    title: string;
    body: string;
    kind: string;
    createdAt: Date;
    readAt: Date | null;
  };
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">{n.title}</p>
        <p className="mt-0.5 text-sm text-[var(--muted-fg)]">{n.body}</p>
        <p className="mt-1 text-[11px] text-[var(--muted-fg)]">
          {n.kind} · {n.createdAt.toLocaleString()}
        </p>
      </div>
      {!n.readAt && <Badge tone="info">New</Badge>}
    </div>
  );
}
