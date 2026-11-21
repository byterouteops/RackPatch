/**
 * Global IA matching design reference sidebars (Dashboard mockups / poster).
 * Only real routes — project-scoped items resolve when a project is open.
 */
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Cable,
  CircleCheck,
  ClipboardList,
  FolderKanban,
  Handshake,
  HelpCircle,
  LayoutDashboard,
  Map as MapIcon,
  Network,
  Package,
  Settings,
  Shield,
  ShieldCheck,
  Upload,
  Wrench,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: "exact" | "prefix" | "projects" | "project-path" | "sites";
  /** Path suffix under /app/projects/:id when in a project */
  projectPath?: string;
};

export function projectScopedHref(
  projectId: string | null,
  item: AppNavItem,
  fallback = "/app",
): string {
  if (item.projectPath && projectId) {
    return `/app/projects/${projectId}${item.projectPath}`;
  }
  return item.href || fallback;
}

/** Top block — matches Welcome / Cable Plans mockups */
export const SIDEBAR_PRIMARY: AppNavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, active: "exact" },
  { href: "/app/projects", label: "Projects", icon: FolderKanban, active: "projects" },
  {
    href: "/app/settings",
    label: "Sites & Racks",
    icon: Boxes,
    active: "sites",
  },
  {
    href: "/app",
    label: "Cable Plans",
    icon: Cable,
    active: "project-path",
    projectPath: "/cables",
  },
  {
    href: "/app",
    label: "Installation",
    icon: ClipboardList,
    active: "project-path",
    projectPath: "/work-orders",
  },
  {
    href: "/app",
    label: "Verification",
    icon: ShieldCheck,
    active: "project-path",
    projectPath: "/exceptions",
  },
  {
    href: "/app",
    label: "Evidence",
    icon: Network,
    active: "project-path",
    projectPath: "/evidence",
  },
  {
    href: "/app",
    label: "Reports & Handover",
    icon: Handshake,
    active: "project-path",
    projectPath: "/handover",
  },
];

/** Lower block */
export const SIDEBAR_SECONDARY: AppNavItem[] = [
  {
    href: "/app",
    label: "Inventory",
    icon: Package,
    active: "project-path",
    projectPath: "/inventory",
  },
  {
    href: "/app",
    label: "LLDP / CDP",
    icon: Network,
    active: "project-path",
    projectPath: "/lldp",
  },
  {
    href: "/app",
    label: "Import / Export",
    icon: Upload,
    active: "project-path",
    projectPath: "/plan",
  },
  { href: "/app/settings", label: "Settings", icon: Settings, active: "prefix" },
  { href: "/app/help", label: "Help", icon: HelpCircle, active: "prefix" },
];

export function adminNavItems(isPlatformAdmin: boolean): AppNavItem[] {
  if (!isPlatformAdmin) return [];
  return [
    { href: "/app/admin", label: "Administration", icon: Shield, active: "prefix" },
  ];
}

export const WORKFLOW_STEPS = [
  { label: "Plan", path: "/cables", icon: MapIcon },
  { label: "Install", path: "/work-orders", icon: Wrench },
  { label: "Verify", path: "/exceptions", icon: CircleCheck },
  { label: "Handover", path: "/handover", icon: Handshake },
] as const;
