import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ProjectSubnav } from "@/components/project-subnav";

/**
 * Design-aligned project header: breadcrumb → title + actions → section tabs → KPIs.
 */
export function ProjectPageHeader({
  projectId,
  projectName,
  section,
  title,
  description,
  actions,
  hideSubnav,
  kpis,
}: {
  projectId: string;
  projectName?: string;
  section?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  hideSubnav?: boolean;
  /** Optional KPI strip under the title (cables / overview). */
  kpis?: ReactNode;
}) {
  const crumb = "text-[var(--muted-fg)] hover:text-[var(--accent)]";
  return (
    <div className="mb-5">
      <nav
        aria-label="Breadcrumb"
        className="mb-3 flex flex-wrap items-center gap-1 text-xs font-medium"
      >
        <Link href="/app/projects" className={crumb}>
          Projects
        </Link>
        {projectName && (
          <>
            <ChevronRight className="h-3 w-3 text-[var(--muted-fg)]" aria-hidden />
            {section ? (
              <Link href={`/app/projects/${projectId}`} className={crumb}>
                {projectName}
              </Link>
            ) : (
              <span className="text-[var(--foreground)]">{projectName}</span>
            )}
          </>
        )}
        {section && (
          <>
            <ChevronRight className="h-3 w-3 text-[var(--muted-fg)]" aria-hidden />
            <span className="text-[var(--foreground)]">{section}</span>
          </>
        )}
      </nav>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="rp-display text-[26px] font-extrabold leading-tight tracking-tight text-[var(--foreground)] sm:text-[30px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted-fg)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>

      {!hideSubnav && <ProjectSubnav projectId={projectId} />}

      {kpis && <div className="mt-1">{kpis}</div>}
    </div>
  );
}
