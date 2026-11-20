"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Cable, FolderKanban, LogOut, Menu, Shield, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

type AppShellProps = {
  children: React.ReactNode;
  user: { name: string; email: string };
  isPlatformAdmin?: boolean;
};

function initials(name: string, email: string) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function AppShell({ children, user, isPlatformAdmin }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = [
    { href: "/app", label: "Projects", icon: FolderKanban },
    ...(isPlatformAdmin ? [{ href: "/app/admin", label: "Admin", icon: Shield }] : []),
  ];

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/";
  }

  const avatar = initials(user.name, user.email);

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)] transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-1 w-full bg-[var(--accent-line)]" aria-hidden />
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          <Link
            href="/app"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-wide"
            onClick={() => setOpen(false)}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-[2px] bg-[var(--accent)] text-white">
              <Cable className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span>
              RackPatch
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--sidebar-muted)]">
                Cable Ops
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-[var(--radius)] p-2 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sidebar-muted)]">
            Navigation
          </p>
          {nav.map((item) => {
            const active =
              item.href === "/app"
                ? pathname === "/app" ||
                  pathname.startsWith("/app/projects") ||
                  pathname.startsWith("/app/workspaces")
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[40px] items-center gap-3 border-l-[3px] px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-l-[var(--accent-line)] bg-[var(--sidebar-mid)] text-white"
                    : "border-l-transparent text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 bg-[var(--chrome)] p-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-[var(--accent)] text-xs font-semibold text-white"
              aria-hidden
            >
              {avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">
                {user.name || user.email}
              </p>
              <p className="truncate text-[11px] text-[var(--sidebar-muted)]">{user.email}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-start border border-white/10 bg-transparent text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-white"
            onClick={() => void signOut()}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </Button>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-label="Close overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="no-print hidden h-9 items-center justify-between border-b border-[var(--border)] bg-[var(--chrome)] px-4 text-[11px] text-[var(--sidebar-muted)] lg:flex">
          <span className="font-medium uppercase tracking-[0.1em] text-white/80">
            RackPatch Console
          </span>
          <span className="rp-mono text-white/50">Community Edition</span>
        </div>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-[var(--border)] bg-white px-4 lg:hidden">
          <button
            type="button"
            className="rounded-[var(--radius)] border border-[var(--border)] p-2"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">RackPatch</span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
