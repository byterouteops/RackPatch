import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileBarChart,
  Link2,
  Lock,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  UserCheck,
  Wrench,
} from "lucide-react";
import type { Prisma, VerificationState } from "@prisma/client";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { evidenceScope } from "@/lib/evidence/scope";
import { requireSessionUser } from "@/lib/session";
import { ProjectPageHeader } from "@/components/project-page-header";
import { ProjectStrip, StripFact } from "@/components/project-strip";
import { VerificationBadge } from "@/components/status-badges";
import { Button, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const RESULT_FILTERS: Array<{ id: string; label: string; states?: VerificationState[] }> = [
  { id: "all", label: "All Results" },
  { id: "match", label: "Match", states: ["VERIFIED_LLDP", "VERIFIED_PHYSICAL"] },
  { id: "mismatch", label: "Mismatch", states: ["MISMATCH"] },
  { id: "review", label: "Needs review", states: ["NEEDS_REVIEW"] },
  { id: "pending", label: "Pending", states: ["AWAITING"] },
];
const PAGE_SIZE = 25;

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "0%";
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ cable?: string; result?: string; page?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" />;
  }
  const project = access.project;
  const rev = project.activeRevisionId;
  const base = `/app/projects/${projectId}/verify`;
  const filter = RESULT_FILTERS.find((f) => f.id === sp.result) ?? RESULT_FILTERS[0];
  const page = Math.max(0, Number(sp.page ?? 0) || 0);

  if (!rev) {
    return (
      <div>
        <ProjectPageHeader projectId={projectId} projectName={project.name} section="Verification" title="Verification Management" />
        <EmptyState title="No plan" description="Publish a cable plan, then import LLDP/CDP evidence to verify it." />
      </div>
    );
  }

  const stateGroups = await prisma.verificationFinding.groupBy({
    by: ["state"],
    where: { revisionId: rev },
    _count: { _all: true },
  });
  const [total, openExceptions, ackExceptions, swaps, lastImport, physicalCount, handoverCount] = await Promise.all([
    prisma.plannedLink.count({ where: { revisionId: rev } }),
    prisma.verificationFinding.count({
      where: { revisionId: rev, state: { in: ["MISMATCH", "NEEDS_REVIEW"] }, exceptionStatus: "OPEN" },
    }),
    prisma.verificationFinding.count({
      where: { revisionId: rev, state: { in: ["MISMATCH", "NEEDS_REVIEW"] }, exceptionStatus: "ACKNOWLEDGED" },
    }),
    prisma.verificationFinding.count({ where: { revisionId: rev, relatedCableId: { not: null }, exceptionStatus: { not: "CLOSED" } } }),
    prisma.evidenceImport.findFirst({ where: evidenceScope(project), orderBy: { uploadedAt: "desc" }, select: { uploadedAt: true, sourceDevice: true } }),
    prisma.physicalVerification.count({ where: { revisionId: rev } }),
    prisma.handoverSnapshot.count({ where: { projectId } }),
  ]);
  const count = (s: VerificationState) => stateGroups.find((g) => g.state === s)?._count._all ?? 0;
  const verified = count("VERIFIED_LLDP") + count("VERIFIED_PHYSICAL");
  const withFinding = stateGroups.reduce((n, g) => n + g._count._all, 0);
  const pending = count("AWAITING") + Math.max(0, total - withFinding);

  const where: Prisma.PlannedLinkWhereInput = filter.states
    ? filter.states.includes("AWAITING")
      ? { revisionId: rev, OR: [{ findings: { none: { revisionId: rev } } }, { findings: { some: { revisionId: rev, state: "AWAITING" } } }] }
      : { revisionId: rev, findings: { some: { revisionId: rev, state: { in: filter.states } } } }
    : { revisionId: rev };

  const [filteredCount, rows] = await Promise.all([
    prisma.plannedLink.count({ where }),
    prisma.plannedLink.findMany({
      where,
      orderBy: { cableId: "asc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        cableId: true,
        aDevice: true,
        aPort: true,
        zDevice: true,
        zPort: true,
        findings: {
          where: { revisionId: rev },
          take: 1,
          select: { state: true, observedSummary: true, expectedSummary: true, relatedCableId: true, exceptionStatus: true, nextAction: true, evidenceSource: true },
        },
      },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  const selectedId = sp.cable ?? rows.find((r) => r.findings[0]?.state === "MISMATCH" || r.findings[0]?.state === "NEEDS_REVIEW")?.id ?? rows[0]?.id;
  const selected = selectedId
    ? await prisma.plannedLink.findUnique({
        where: { id: selectedId },
        select: {
          id: true,
          cableId: true,
          aDevice: true,
          aPort: true,
          aDeviceNorm: true,
          aPortNorm: true,
          zDevice: true,
          zPort: true,
          zDeviceNorm: true,
          zPortNorm: true,
          revisionId: true,
          findings: { where: { revisionId: rev }, take: 1 },
        },
      })
    : null;
  const neighbors =
    selected && selected.revisionId === rev
      ? await prisma.observation.findMany({
          where: {
            evidenceImport: { projectId },
            OR: [
              { evidenceImport: { sourceDeviceNorm: selected.aDeviceNorm }, localInterfaceNorm: selected.aPortNorm },
              { evidenceImport: { sourceDeviceNorm: selected.zDeviceNorm }, localInterfaceNorm: selected.zPortNorm },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: {
            id: true,
            localInterface: true,
            remoteSystemName: true,
            remotePortId: true,
            evidenceImport: { select: { sourceDevice: true, uploadedAt: true } },
          },
        })
      : [];
  const sf = selected?.findings[0];
  const problem = sf && (sf.state === "MISMATCH" || sf.state === "NEEDS_REVIEW");

  const steps = [
    { label: "Collect LLDP/CDP", done: Boolean(lastImport) },
    { label: "Compare with Plan", done: withFinding > 0 },
    { label: "Resolve Exceptions", done: withFinding > 0 && openExceptions === 0 },
    { label: "Independent Verify", done: physicalCount > 0 },
    { label: "Approve Handover", done: handoverCount > 0 },
  ];
  const current = steps.findIndex((s) => !s.done);

  function qs(next: { cable?: string; result?: string; page?: number }) {
    const p = new URLSearchParams();
    const result = next.result ?? filter.id;
    if (result !== "all") p.set("result", result);
    const pg = next.page ?? page;
    if (pg > 0) p.set("page", String(pg));
    const c = next.cable ?? (next.result || next.page !== undefined ? undefined : selectedId);
    if (c) p.set("cable", c);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  }

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Verification"
        title="Verification Management"
        description="Collect LLDP/CDP data, compare with cable plan, detect swaps, and approve for handover."
        actions={
          <>
            <Button href={`/app/projects/${projectId}/lldp`} size="sm">
              <Play className="h-4 w-4" aria-hidden />
              Run Verification
            </Button>
            <Button href={`/app/projects/${projectId}/collection`} size="sm" variant="secondary">
              <RefreshCw className="h-4 w-4" aria-hidden />
              Collect via SSH
            </Button>
            <Button href={`/app/projects/${projectId}/reports`} size="sm" variant="secondary">
              <FileBarChart className="h-4 w-4" aria-hidden />
              Verification Report
            </Button>
          </>
        }
      />

      <ProjectStrip
        name={project.name}
        phase={verified >= total && total > 0 ? "Verified" : "In Progress"}
        phaseTone={verified >= total && total > 0 ? "success" : "info"}
        meta={[`Site: ${project.site}`, `Planned links: ${total.toLocaleString("en-US")}`]}
        progressLabel="Verification Progress"
        progressValue={verified}
        progressMax={total}
        aside={
          <StripFact
            icon={<Calendar />}
            label="Last evidence import"
            value={lastImport ? `${lastImport.uploadedAt.toISOString().slice(0, 16).replace("T", " ")} · ${lastImport.sourceDevice}` : "None yet"}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Planned Links" value={total} icon={<Link2 aria-hidden />} tone="info" />
        <StatCard label="Verified" value={verified} hint={pct(verified, total)} icon={<CheckCircle2 aria-hidden />} tone="success" />
        <StatCard label="Pending" value={pending} hint={pct(pending, total)} icon={<Clock aria-hidden />} tone="warning" />
        <StatCard
          label="Exceptions"
          value={openExceptions}
          hint={pct(openExceptions, total)}
          icon={<AlertTriangle aria-hidden />}
          tone={openExceptions ? "danger" : "neutral"}
          href={`/app/projects/${projectId}/exceptions`}
        />
        <StatCard label="Potential Swaps" value={swaps} icon={<ArrowLeftRight aria-hidden />} tone={swaps ? "warning" : "neutral"} />
        <StatCard label="Acknowledged" value={ackExceptions} icon={<ShieldCheck aria-hidden />} tone="neutral" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="rp-card overflow-hidden" aria-label="Verification results">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[15px] font-bold">Verification Results ({filteredCount.toLocaleString("en-US")})</h2>
            <div className="flex flex-wrap gap-1">
              {RESULT_FILTERS.map((f) => (
                <Link
                  key={f.id}
                  href={qs({ result: f.id, page: 0 })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-semibold",
                    filter.id === f.id
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border)] text-[var(--muted-fg)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Cable ID</th>
                  <th className="px-2 py-2">Plan (Expected)</th>
                  <th className="px-2 py-2">Observed (LLDP/CDP)</th>
                  <th className="px-2 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const f = r.findings[0];
                  const sel = r.id === selectedId;
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-b border-[var(--border)] last:border-0",
                        sel ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60",
                      )}
                    >
                      <td className="px-4 py-2">
                        <Link href={qs({ cable: r.id })} scroll={false} className="rp-mono font-bold text-[var(--accent)] hover:underline">
                          {r.cableId}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <Link href={qs({ cable: r.id })} scroll={false} className="block">
                          {r.aDevice}/{r.aPort} {"\u2194"} {r.zDevice}/{r.zPort}
                        </Link>
                      </td>
                      <td className={cn("px-2 py-2", f && (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW") ? "font-medium text-[var(--danger)]" : "text-[var(--muted-fg)]")}>
                        {f?.observedSummary ?? "\u2014 (no neighbor yet)"}
                      </td>
                      <td className="px-2 py-2">
                        <VerificationBadge state={f?.state ?? "AWAITING"} compact />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted-fg)]">
            <span>
              Showing {filteredCount === 0 ? 0 : page * PAGE_SIZE + 1}
              {"\u2013"}
              {Math.min(filteredCount, (page + 1) * PAGE_SIZE)} of {filteredCount.toLocaleString("en-US")} links
            </span>
            <div className="flex items-center gap-1">
              <PageLink href={qs({ page: page - 1 })} disabled={page === 0} label="Previous page">
                <ChevronLeft className="h-3.5 w-3.5" />
              </PageLink>
              <span className="px-2 font-semibold text-[var(--foreground)]">
                {page + 1} / {pageCount}
              </span>
              <PageLink href={qs({ page: page + 1 })} disabled={page >= pageCount - 1} label="Next page">
                <ChevronRight className="h-3.5 w-3.5" />
              </PageLink>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rp-card" aria-label="Connection comparison">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display text-[15px] font-bold">
                Connection Comparison {selected && <>{"\u2014"} <span className="rp-mono">{selected.cableId}</span></>}
              </h2>
              {sf && <VerificationBadge state={sf.state} compact />}
            </div>
            {selected ? (
              <div className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <EndpointBox
                    tone="info"
                    title="Expected (Cable Plan)"
                    a={`${selected.aDevice}`}
                    ap={selected.aPort}
                    z={selected.zDevice}
                    zp={selected.zPort}
                  />
                  <div className={cn("rounded-lg border p-3", problem ? "border-red-200 bg-[var(--danger-soft)]" : "border-emerald-200 bg-[var(--success-soft)]")}>
                    <p className={cn("mb-2 text-xs font-bold", problem ? "text-[var(--danger)]" : "text-[var(--success-ink)]")}>Observed (LLDP/CDP)</p>
                    <p className="text-[13px] font-semibold">{sf?.observedSummary ?? "No neighbor evidence yet"}</p>
                    {sf?.evidenceSource && <p className="mt-1 text-[11px] text-[var(--muted-fg)]">Source: {sf.evidenceSource}</p>}
                  </div>
                </div>
                {sf?.nextAction && (
                  <p className="rounded-md bg-[var(--muted)] px-3 py-2 text-xs">
                    <span className="font-semibold">Next action:</span> {sf.nextAction}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button href={`/app/projects/${projectId}/cables/${selected.id}`} size="sm">
                    Open cable record
                  </Button>
                  {problem && (
                    <Button href={`/app/projects/${projectId}/exceptions`} size="sm" variant="secondary">
                      Resolve exception
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="p-4 text-sm text-[var(--muted-fg)]">Select a link to compare expected and observed.</p>
            )}
          </section>

          <section className="rp-card overflow-hidden" aria-label="LLDP / CDP neighbor details">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display text-[15px] font-bold">LLDP / CDP Neighbor Details</h2>
            </div>
            {neighbors.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted-fg)]">
                No neighbor observations recorded for these ports.{" "}
                <Link href={`/app/projects/${projectId}/lldp`} className="font-semibold text-[var(--accent)]">
                  Import evidence
                </Link>
              </p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Device</th>
                    <th className="px-2 py-2">Interface</th>
                    <th className="px-2 py-2">Neighbor</th>
                    <th className="px-2 py-2">Neighbor Interface</th>
                  </tr>
                </thead>
                <tbody>
                  {neighbors.map((n) => (
                    <tr key={n.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2 font-semibold">
                        <Server className="mr-1.5 inline h-3.5 w-3.5 text-[var(--muted-fg)]" aria-hidden />
                        {n.evidenceImport.sourceDevice}
                      </td>
                      <td className="rp-mono px-2 py-2">{n.localInterface}</td>
                      <td className="px-2 py-2 font-semibold">{n.remoteSystemName ?? "\u2014"}</td>
                      <td className="rp-mono px-2 py-2">{n.remotePortId ?? "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>

      <section className="rp-card mt-4 p-4" aria-label="Verification workflow">
        <h2 className="rp-display mb-4 flex items-center gap-2 text-[15px] font-bold">
          <Wrench className="h-4 w-4" aria-hidden />
          Verification Workflow
        </h2>
        <ol className="flex items-start">
          {steps.map((s, i) => {
            const isCurrent = i === current;
            return (
              <li key={s.label} className="relative flex flex-1 flex-col items-center text-center">
                {i > 0 && (
                  <span
                    className={cn("absolute right-1/2 top-4 h-0.5 w-full", steps[i - 1].done ? "bg-[var(--success)]" : "bg-[var(--border)]")}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold",
                    s.done
                      ? "border-[var(--success)] bg-[var(--success)] text-white"
                      : isCurrent
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] bg-white text-[var(--muted-fg)]",
                  )}
                >
                  {s.done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className={cn("mt-2 text-xs", isCurrent ? "font-bold text-[var(--accent)]" : "font-medium")}>{s.label}</span>
                {i === 3 && (
                  <Link href={`/app/projects/${projectId}/qc`} className="mt-0.5 text-[11px] text-[var(--accent)]">
                    <UserCheck className="mr-0.5 inline h-3 w-3" aria-hidden />
                    QC queue
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function EndpointBox({ tone, title, a, ap, z, zp }: { tone: "info"; title: string; a: string; ap: string; z: string; zp: string }) {
  return (
    <div className={cn("rounded-lg border p-3", tone === "info" && "border-blue-200 bg-[var(--accent-soft)]")}>
      <p className="mb-2 text-xs font-bold text-[var(--accent)]">{title}</p>
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <div>
          <p className="font-bold">{a}</p>
          <p className="rp-mono text-xs text-[var(--muted-fg)]">{ap}</p>
        </div>
        <ArrowLeftRight className="h-4 w-4 text-[var(--muted-fg)]" aria-hidden />
        <div className="text-right">
          <p className="font-bold">{z}</p>
          <p className="rp-mono text-xs text-[var(--muted-fg)]">{zp}</p>
        </div>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="rounded-md border border-[var(--border)] p-1.5 opacity-40" aria-hidden>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} className="rounded-md border border-[var(--border)] p-1.5 hover:bg-[var(--muted)]" aria-label={label}>
      {children}
    </Link>
  );
}
