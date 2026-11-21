"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = (projectId: string) =>
  [
    { href: `/app/projects/${projectId}`, label: "Overview", exact: true },
    { href: `/app/projects/${projectId}/cables`, label: "Cables" },
    { href: `/app/projects/${projectId}/plan`, label: "Plan" },
    { href: `/app/projects/${projectId}/lldp`, label: "Evidence" },
    { href: `/app/projects/${projectId}/exceptions`, label: "Exceptions" },
    { href: `/app/projects/${projectId}/handover`, label: "Handover" },
    { href: `/app/projects/${projectId}/labels`, label: "Labels" },
  ] as const;

export function ProjectSubnav({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="mb-5 flex gap-0 overflow-x-auto border-b border-[var(--border)] bg-white"
      aria-label="Project sections"
    >
      {tabs(projectId).map((tab) => {
        const active =
          "exact" in tab && tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative flex min-h-[40px] items-center whitespace-nowrap border-b-2 px-4 text-xs font-semibold uppercase tracking-[0.06em] transition-colors",
              active
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted-fg)] hover:text-[var(--foreground)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
