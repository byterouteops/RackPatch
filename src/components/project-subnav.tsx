"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Cable,
  ChevronDown,
  FileBarChart,
  Handshake,
  LayoutGrid,
  Network,
  Server,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; exact?: boolean; match?: string[]; icon?: LucideIcon };

/** Primary project tabs — one row, matching design mockups (not six stacked groups). */
function primaryTabs(projectId: string): Tab[] {
  const base = `/app/projects/${projectId}`;
  return [
    { href: base, label: "Overview", exact: true, icon: LayoutGrid },
    {
      href: `${base}/racks`,
      label: "Fabric",
      icon: Server,
      match: [`${base}/racks`, `${base}/fabric`, `${base}/trace`],
    },
    {
      href: `${base}/cables`,
      label: "Cable Plan",
      icon: Cable,
      match: [`${base}/cables`, `${base}/plan`],
    },
    {
      href: `${base}/work-orders`,
      label: "Installation",
      icon: Wrench,
      match: [`${base}/work-orders`, `${base}/labels`, `${base}/scan`],
    },
    {
      href: `${base}/verify`,
      label: "Verification",
      icon: ShieldCheck,
      match: [
        `${base}/verify`,
        `${base}/exceptions`,
        `${base}/lldp`,
        `${base}/qc`,
        `${base}/compliance`,
        `${base}/collection`,
      ],
    },
    {
      href: `${base}/evidence`,
      label: "Evidence",
      icon: Network,
      match: [`${base}/evidence`],
    },
    {
      href: `${base}/handover`,
      label: "Handover",
      icon: Handshake,
      match: [`${base}/handover`],
    },
    {
      href: `${base}/reports`,
      label: "Reports",
      icon: FileBarChart,
      match: [`${base}/reports`, `${base}/analytics`],
    },
  ];
}

function moreTabs(projectId: string): Tab[] {
  const base = `/app/projects/${projectId}`;
  return [
    { href: `${base}/plan`, label: "Import plan" },
    { href: `${base}/labels`, label: "Labels" },
    { href: `${base}/scan`, label: "Scan" },
    { href: `${base}/lldp`, label: "LLDP" },
    { href: `${base}/collection`, label: "Collect" },
    { href: `${base}/qc`, label: "QC" },
    { href: `${base}/compliance`, label: "Compliance" },
    { href: `${base}/inventory`, label: "Inventory" },
    { href: `${base}/capacity`, label: "Capacity" },
    { href: `${base}/panels`, label: "Panels" },
    { href: `${base}/spares`, label: "Spares" },
    { href: `${base}/twin`, label: "Twin" },
    { href: `${base}/assistant`, label: "Assist" },
    { href: `${base}/api`, label: "API" },
    { href: `${base}/integrations`, label: "Integrations" },
    { href: `${base}/analytics`, label: "Analytics" },
  ];
}

/** Contextual second strip under primary — only when inside that workflow. */
function contextTabs(projectId: string, pathname: string): Tab[] | null {
  const base = `/app/projects/${projectId}`;
  if (
    pathname.startsWith(`${base}/work-orders`) ||
    pathname.startsWith(`${base}/labels`) ||
    pathname.startsWith(`${base}/scan`)
  ) {
    return [
      { href: `${base}/work-orders`, label: "Work orders" },
      { href: `${base}/labels`, label: "Labels" },
      { href: `${base}/scan`, label: "Scan" },
    ];
  }
  if (
    pathname.startsWith(`${base}/verify`) ||
    pathname.startsWith(`${base}/exceptions`) ||
    pathname.startsWith(`${base}/lldp`) ||
    pathname.startsWith(`${base}/qc`) ||
    pathname.startsWith(`${base}/compliance`) ||
    pathname.startsWith(`${base}/collection`)
  ) {
    return [
      { href: `${base}/verify`, label: "Results" },
      { href: `${base}/lldp`, label: "LLDP" },
      { href: `${base}/exceptions`, label: "Exceptions" },
      { href: `${base}/qc`, label: "QC" },
      { href: `${base}/compliance`, label: "Compliance" },
      { href: `${base}/collection`, label: "Collect" },
    ];
  }
  if (pathname.startsWith(`${base}/racks`) || pathname.startsWith(`${base}/fabric`) || pathname.startsWith(`${base}/trace`)) {
    return [
      { href: `${base}/racks`, label: "Racks" },
      { href: `${base}/fabric`, label: "Topology", exact: true },
      { href: `${base}/fabric/fe`, label: "Front-end" },
      { href: `${base}/fabric/be`, label: "Back-end" },
      { href: `${base}/trace`, label: "Trace" },
    ];
  }
  if (pathname.startsWith(`${base}/evidence`)) {
    return [
      { href: `${base}/evidence`, label: "Evidence", exact: true },
      { href: `${base}/evidence/explorer`, label: "Explorer" },
    ];
  }
  if (pathname.startsWith(`${base}/cables`) || pathname.startsWith(`${base}/plan`)) {
    return [
      { href: `${base}/cables`, label: "Cable list" },
      { href: `${base}/plan`, label: "Import" },
    ];
  }
  return null;
}

function isActive(pathname: string, tab: Tab) {
  if (tab.exact) return pathname === tab.href;
  if (tab.match?.length) {
    return tab.match.some(
      (m) => pathname === m || pathname.startsWith(`${m}/`),
    );
  }
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function ProjectSubnav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const primary = primaryTabs(projectId);
  const more = moreTabs(projectId);
  const context = contextTabs(projectId, pathname);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const moreActive = more.some((t) => isActive(pathname, t) && !primary.some((p) => isActive(pathname, p)));

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="mb-5">
      <nav
        className="flex flex-wrap items-end gap-0 border-b border-[var(--border)]"
        aria-label="Project sections"
      >
        {primary.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative -mb-px flex min-h-[46px] items-center gap-2 whitespace-nowrap border-b-[3px] px-4 text-sm font-semibold transition-colors",
                active
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--muted-fg)] hover:text-[var(--foreground)]",
              )}
            >
              {Icon && <Icon className="h-4 w-4" aria-hidden />}
              {tab.label}
            </Link>
          );
        })}

        <div className="relative ml-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "relative -mb-px flex min-h-[46px] items-center gap-1 whitespace-nowrap border-b-[3px] px-4 text-sm font-semibold",
              moreActive || open
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted-fg)] hover:text-[var(--foreground)]",
            )}
            aria-expanded={open}
            aria-haspopup="menu"
          >
            More
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 max-h-96 w-52 overflow-y-auto rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
            >
              {more.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block px-3 py-2 text-sm hover:bg-[var(--muted)]",
                    isActive(pathname, tab)
                      ? "font-semibold text-[var(--accent)]"
                      : "text-[var(--foreground)]",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>

      {context && (
        <div className="mt-3 flex flex-wrap gap-1">
          {context.map((tab) => {
            const active = isActive(pathname, tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--muted-fg)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
