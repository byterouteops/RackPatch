"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { markAllAsRead, markNotificationAsRead } from "@/app/actions/notifications";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const feed = (await res.json()) as { unread: number; items: Item[] };
      setUnread(feed.unread);
      setItems(feed.items);
    } catch {
      /* offline / session edge */
    }
  }, []);

  useEffect(() => {
    // Plain GET (not a server action) so it never queues behind navigations.
    const start = setTimeout(refresh, 1500);
    const t = setInterval(refresh, 120_000);
    return () => {
      clearTimeout(start);
      clearInterval(t);
    };
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl sm:w-96">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <p className="text-sm font-semibold">Notifications</p>
              <button
                type="button"
                disabled={pending || unread === 0}
                className="text-xs font-semibold text-[var(--accent)] disabled:opacity-40"
                onClick={() =>
                  startTransition(async () => {
                    await markAllAsRead();
                    await refresh();
                  })
                }
              >
                Mark all read
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-3 py-8 text-center text-sm text-[var(--muted-fg)]">
                  No notifications yet.
                </li>
              )}
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "border-b border-[var(--border)] last:border-0",
                    !n.readAt && "bg-[var(--accent-soft)]",
                  )}
                >
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="block px-3 py-2.5 hover:bg-[var(--muted)]"
                      onClick={() => {
                        void markNotificationAsRead({ id: n.id });
                        setOpen(false);
                      }}
                    >
                      <ItemBody n={n} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="block w-full px-3 py-2.5 text-left hover:bg-[var(--muted)]"
                      onClick={() => {
                        void markNotificationAsRead({ id: n.id }).then(refresh);
                      }}
                    >
                      <ItemBody n={n} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t border-[var(--border)] px-3 py-2 text-center">
              <Link
                href="/app/notifications"
                className="text-xs font-semibold text-[var(--accent)] hover:underline"
                onClick={() => setOpen(false)}
              >
                View all activity
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ItemBody({ n }: { n: Item }) {
  return (
    <>
      <p className="text-sm font-semibold text-[var(--foreground)]">{n.title}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted-fg)]">{n.body}</p>
      <p className="mt-1 text-[10px] text-[var(--muted-fg)]">
        {n.kind} · {new Date(n.createdAt).toLocaleString()}
      </p>
    </>
  );
}
