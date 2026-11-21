"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, FolderKanban, HelpCircle, LogOut, Menu, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { BrandMark } from "@/components/brand-mark";
import { FieldHints } from "@/components/field-hints";
import { PageGuide } from "@/components/page-guide";
import {
  SIDEBAR_PRIMARY,
  SIDEBAR_SECONDARY,
  WORKFLOW_STEPS,
  adminNavItems,
  projectScopedHref,
  type AppNavItem,
} from "@/lib/navigation";

const GlobalSearchDialog = dynamic(
  () =>
    import("@/components/global-search-dialog").then((m) => m.GlobalSearchDialog),
  { ssr: false, loading: () => <div className="hidden h-9 w-9 lg:block" /> },
);
const NotificationCenter = dynamic(
  () =>
    import("@/components/notification-center").then((m) => m.NotificationCenter),
  { ssr: false, loading: () => <div className="h-9 w-9" /> },
);

type ShellProject = { id: string; name: string; workspaceId: string };

type AppShellProps = {
  children: React.ReactNode;
  user: { name: string; email: string };
  isPlatformAdmin?: boolean;
  projects: ShellProject[];
};

const LAST_PROJECT_KEY = "rp:lastProject";

function initials(name: string, email: string) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function extractProjectId(pathname: string): string | null {
  const m = /^\/app\/projects\/([^/]+)/.exec(pathname);
  return m?.[1] ?? null;
}

function itemActive(
  pathname: string,
  item: AppNavItem,
  urlProjectId: string | null,
) {
  if (item.active === "exact") return pathname === "/app";
  if (item.active === "projects") {
    return (
      pathname === "/app/projects" ||
      (urlProjectId !== null && pathname === `/app/projects/${urlProjectId}`)
    );
  }
  if (item.active === "sites") {
    return /^\/app\/workspaces\/[^/]+\/sites/.test(pathname);
  }
  if (item.active === "project-path" && item.projectPath && urlProjectId) {
    const base = `/app/projects/${urlProjectId}${item.projectPath}`;
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  if (item.active === "prefix") {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return false;
}

function SidebarLink({
  item,
  href,
  active,
  onNavigate,
}: {
  item: AppNavItem;
  href: string;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={href}
      prefetch
      onClick={onNavigate}
      className={cn(
        "flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-[15px] font-medium leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--cyan)]",
        active
          ? "bg-gradient-to-r from-[#005ff8] to-[#0076d5] font-semibold text-white shadow-[0_4px_12px_rgba(0,95,248,0.3)]"
          : "text-[#dbe7f5] hover:bg-white/[0.08] hover:text-white",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

/** Same sub-route under a different project (drops nested ids like /cables/[linkId]). */
function switchProjectPath(pathname: string, fromId: string | null, toId: string) {
  if (fromId) {
    const rest = pathname.slice(`/app/projects/${fromId}`.length);
    const firstSegment = rest.split("/").filter(Boolean)[0];
    return `/app/projects/${toId}${firstSegment ? `/${firstSegment}` : ""}`;
  }
  return `/app/projects/${toId}`;
}

export function AppShell({ children, user, isPlatformAdmin, projects }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);
  const urlProjectId = extractProjectId(pathname);

  useEffect(() => {
    if (urlProjectId) {
      window.localStorage.setItem(LAST_PROJECT_KEY, urlProjectId);
      setLastProjectId(urlProjectId);
      return;
    }
    const stored = window.localStorage.getItem(LAST_PROJECT_KEY);
    if (stored && projects.some((p) => p.id === stored)) setLastProjectId(stored);
  }, [urlProjectId, projects]);

  const projectId =
    urlProjectId ??
    (lastProjectId && projects.some((p) => p.id === lastProjectId) ? lastProjectId : null) ??
    projects[0]?.id ??
    null;
  const activeProject = projects.find((p) => p.id === projectId) ?? null;

  const avatar = initials(user.name, user.email);
  const close = () => setOpen(false);
  const secondary = [...SIDEBAR_SECONDARY, ...adminNavItems(!!isPlatformAdmin)];

  function hrefFor(item: AppNavItem) {
    if (item.active === "sites") {
      return activeProject ? `/app/workspaces/${activeProject.workspaceId}/sites` : "/app/settings";
    }
    return projectScopedHref(projectId, item, "/app/projects");
  }

  function renderLinks(items: AppNavItem[]) {
    return items.map((item) => (
      <SidebarLink
        key={item.label}
        item={item}
        href={hrefFor(item)}
        active={itemActive(pathname, item, urlProjectId)}
        onNavigate={close}
      />
    ));
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col bg-[var(--sidebar)] text-[var(--sidebar-fg)] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 px-4">
          <BrandMark size={32} />
          <div className="min-w-0">
            <p className="rp-display truncate text-[19px] font-bold leading-tight text-white">
              RackPatch<sup className="ml-0.5 text-[8px] font-semibold">®</sup>
            </p>
            <p className="truncate text-[10px] font-medium text-[var(--sidebar-muted)]">
              Data Center Cabling Management
            </p>
          </div>
          <button
            type="button"
            className="ml-auto rounded p-1.5 text-slate-300 hover:bg-white/10 lg:hidden"
            onClick={close}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-label="Primary">
          <div className="space-y-1">{renderLinks(SIDEBAR_PRIMARY)}</div>
          <div className="space-y-1 border-t border-white/10 pt-4">{renderLinks(secondary)}</div>
        </nav>

        <div className="px-3 pb-3 pt-2">
          <div className="flex items-start gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2.5">
            <span className="mt-1.5 inline-flex h-2 w-2 rounded-full bg-[var(--success)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white">RackPatch Community</p>
              <p className="text-[11.5px] text-[var(--sidebar-muted)]">v0.2.0 (Apache 2.0)</p>
            </div>
            <button
              type="button"
              title="Sign out"
              aria-label="Sign out"
              className="rounded-md p-1.5 text-[var(--sidebar-muted)] hover:bg-white/10 hover:text-white"
              onClick={() => void authClient.signOut().then(() => (window.location.href = "/"))}
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          className="no-print fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-label="Close"
          onClick={close}
        />
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-white px-4 lg:px-6">
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {projects.length > 0 ? (
            <label className="relative hidden h-10 min-w-[150px] max-w-[300px] flex-1 items-center rounded-lg border border-[var(--border)] bg-white shadow-sm hover:border-[var(--accent)] sm:flex xl:min-w-[220px]">
              <span className="sr-only">Current project</span>
              <FolderKanban className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--muted-fg)]" aria-hidden />
              <select
                className="h-full w-full cursor-pointer appearance-none truncate rounded-lg bg-transparent pl-9 pr-8 text-sm font-semibold text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                value={projectId ?? ""}
                onChange={(e) => {
                  const next = e.target.value;
                  window.localStorage.setItem(LAST_PROJECT_KEY, next);
                  setLastProjectId(next);
                  router.push(switchProjectPath(pathname, urlProjectId, next));
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-[var(--muted-fg)]" aria-hidden />
            </label>
          ) : (
            <Link
              href="/app#create"
              className="hidden h-10 items-center rounded-lg border border-dashed border-[var(--border)] px-3 text-sm font-semibold text-[var(--accent-ink)] sm:flex"
            >
              Create a project
            </Link>
          )}

          {projectId && (
            <nav className="mx-auto hidden h-16 items-stretch md:flex" aria-label="Workflow">
              {WORKFLOW_STEPS.map((step, i) => {
                const href = `/app/projects/${projectId}${step.path}`;
                const active = urlProjectId !== null && pathname.startsWith(href);
                const Icon = step.icon;
                return (
                  <Link
                    key={step.label}
                    href={href}
                    prefetch
                    className={cn(
                      "relative flex min-w-[76px] flex-col items-center justify-center gap-0.5 border-b-[3px] px-2.5 text-[13px] font-semibold transition-colors xl:min-w-[104px] xl:px-4 xl:text-[13.5px]",
                      i > 0 && "before:absolute before:left-0 before:top-1/2 before:h-8 before:-translate-y-1/2 before:border-l before:border-[var(--border)]",
                      active
                        ? "border-b-[var(--accent)] text-[var(--accent-ink)]"
                        : "border-b-transparent text-[var(--foreground)] hover:text-[var(--accent-ink)]",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    {step.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className={cn("flex items-center gap-1", !projectId && "ml-auto")}>
            <GlobalSearchDialog />
            <NotificationCenter />
            <Link
              href="/app/help"
              className="rp-focus rounded-full p-2 text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Help"
            >
              <HelpCircle className="h-5 w-5" />
            </Link>
          </div>
          <Link
            href="/app/settings"
            className="ml-1 hidden shrink-0 items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-[var(--muted)] sm:flex"
            aria-label={`Account settings for ${user.name || user.email}`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
              {avatar}
            </span>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block max-w-[140px] truncate text-sm font-semibold text-[var(--foreground)]">
                {user.name || user.email}
              </span>
              <span className="block text-[11px] text-[var(--muted-fg)]">
                {isPlatformAdmin ? "Platform Admin" : "Workspace member"}
              </span>
            </span>
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1520px] flex-1 px-4 py-6 sm:px-6">
          <PageGuide />
          {children}
        </main>
        <FieldHints />
      </div>
    </div>
  );
}
