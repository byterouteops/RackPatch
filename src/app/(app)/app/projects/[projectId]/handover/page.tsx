import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock,
  FileText,
  Link2,
  Lock,
  Package,
  ShieldCheck,
} from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { HandoverActions } from "@/components/handover-actions";
import { HandoverShareButton } from "@/components/handover-share-button";
import { HandoverApprovalButton } from "@/components/handover-approval-button";
import { HANDOVER_STAGES, STAGE_META, approvalBlocker } from "@/lib/handover/approval";
import { countBlockingExceptions } from "@/lib/handover/blocking";
import { ProjectPageHeader } from "@/components/project-page-header";
import { ProjectStrip, StripFact } from "@/components/project-strip";
import { getAppUrl } from "@/lib/env";
import { AlertBanner, Badge, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const SEVERITY_LABEL = { ERROR: "Critical", WARNING: "Major", INFO: "Info" } as const;
const SEVERITY_TONE = { ERROR: "danger", WARNING: "warning", INFO: "info" } as const;

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function HandoverPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }
  const project = access.project;
  const rev = project.activeRevisionId;

  const [snapshots, total, installed, stateGroups, exceptionTotal, openList, evidenceCables, activity] = await Promise.all([
    prisma.handoverSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { createdBy: { select: { name: true, email: true } } },
    }),
    rev ? prisma.plannedLink.count({ where: { revisionId: rev } }) : Promise.resolve(0),
    rev ? prisma.plannedLink.count({ where: { revisionId: rev, runtime: { installStatus: "INSTALLED" } } }) : Promise.resolve(0),
    rev ? prisma.verificationFinding.groupBy({ by: ["state"], where: { revisionId: rev }, _count: { _all: true } }) : Promise.resolve([]),
    rev
      ? prisma.verificationFinding.count({
          where: { revisionId: rev, OR: [{ state: { in: ["MISMATCH", "NEEDS_REVIEW"] } }, { closedAt: { not: null } }] },
        })
      : Promise.resolve(0),
    rev
      ? prisma.verificationFinding.findMany({
          where: { revisionId: rev, state: { in: ["MISMATCH", "NEEDS_REVIEW"] }, exceptionStatus: { not: "CLOSED" } },
          orderBy: [{ severity: "desc" }, { computedAt: "desc" }],
          take: 6,
          select: { id: true, severity: true, findingType: true, observedSummary: true, exceptionStatus: true, plannedLink: { select: { cableId: true } } },
        })
      : Promise.resolve([]),
    rev
      ? prisma.plannedLink.count({
          where: {
            revisionId: rev,
            OR: [
              { fieldPhotos: { some: {} } },
              { physicalChecks: { some: { revisionId: rev } } },
              { findings: { some: { revisionId: rev, state: { in: ["VERIFIED_LLDP", "VERIFIED_PHYSICAL"] } } } },
            ],
          },
        })
      : Promise.resolve(0),
    prisma.auditEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, summary: true, createdAt: true },
    }),
  ]);

  const count = (s: string) => stateGroups.find((g) => g.state === s)?._count._all ?? 0;
  const verified = count("VERIFIED_LLDP") + count("VERIFIED_PHYSICAL");
  const unresolved = await (rev
    ? prisma.verificationFinding.count({
        where: { revisionId: rev, state: { in: ["MISMATCH", "NEEDS_REVIEW"] }, exceptionStatus: { not: "CLOSED" } },
      })
    : Promise.resolve(0));
  const awaiting = Math.max(0, total - verified - count("MISMATCH") - count("NEEDS_REVIEW"));
  const ratio = (n: number, d: number) => (d > 0 ? Math.min(100, (n / d) * 100) : 0);
  const latest = snapshots[0];
  const shared = snapshots.some((s) => s.shareToken);
  const [approvals, blockingExceptions] = latest
    ? await Promise.all([
        prisma.handoverApproval.findMany({
          where: { snapshotId: latest.id },
          include: { approver: { select: { name: true, email: true } } },
        }),
        rev ? countBlockingExceptions(rev) : Promise.resolve(0),
      ])
    : [[], 0];
  const actor = { userId: user.id, projectRole: access.projectRole, contractor: access.isContractor, workspaceOwner: access.isOwner };
  const approvalCtx = { approvals, blockingExceptions };

  const areas = [
    { label: "Cabling Installation", value: ratio(installed, total), href: "/work-orders" },
    { label: "LLDP / CDP & Physical Verification", value: ratio(verified, total), href: "/verify" },
    { label: "Exception Resolution", value: exceptionTotal ? ratio(exceptionTotal - unresolved, exceptionTotal) : total ? 100 : 0, href: "/exceptions" },
    { label: "Evidence Coverage", value: ratio(evidenceCables, total), href: "/evidence" },
    { label: "Handover Package", value: latest ? (latest.hasUnresolvedExceptions || latest.awaitingCount > 0 ? 50 : 100) : 0, href: "/handover" },
  ];
  const readiness = total ? areas.reduce((n, a) => n + a.value, 0) / areas.length : 0;

  const checklist = [
    { label: "Cable plan published", done: Boolean(rev) },
    { label: "All cables installed", done: total > 0 && installed === total },
    { label: "Every link verified (LLDP/CDP or physical)", done: total > 0 && verified === total },
    { label: "No unresolved exceptions", done: total > 0 && unresolved === 0 },
    { label: "Evidence attached for every cable", done: total > 0 && evidenceCables === total },
    { label: "Handover snapshot created", done: Boolean(latest) },
    { label: "Latest snapshot is clear", done: Boolean(latest && !latest.hasUnresolvedExceptions && latest.awaitingCount === 0) },
    { label: "Customer share link issued", done: shared },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;

  const steps = [
    { label: "Complete Installation", done: checklist[1].done },
    { label: "Verify & Resolve", done: checklist[2].done && checklist[3].done },
    { label: "Prepare Package", done: checklist[5].done },
    { label: "Customer Share", done: shared },
    { label: "Close Handover", done: checklistDone === checklist.length },
  ];
  const current = steps.findIndex((s) => !s.done);
  const ready = total > 0 && unresolved === 0 && awaiting === 0;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Handover"
        title="Handover Management"
        description="Finalize cabling, review verification, resolve exceptions, and generate the handover package."
      />

      <ProjectStrip
        name={project.name}
        phase={ready ? "Ready for handover" : "Handover in progress"}
        phaseTone={ready ? "success" : "info"}
        meta={[`Site: ${project.site}`, project.customerName ? `Customer: ${project.customerName}` : ""]}
        progressLabel="Handover Readiness"
        progressValue={Math.round(readiness * 10) / 10}
        progressMax={100}
        aside={<StripFact icon={<Package />} label="Latest snapshot" value={latest ? fmt(latest.createdAt) : "None yet"} />}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Links" value={total} icon={<Link2 aria-hidden />} tone="info" />
        <StatCard label="Verified" value={verified} hint={`${ratio(verified, total).toFixed(1)}%`} icon={<CheckCircle2 aria-hidden />} tone="success" />
        <StatCard label="Pending" value={awaiting} hint={`${ratio(awaiting, total).toFixed(1)}%`} icon={<Clock aria-hidden />} tone="warning" />
        <StatCard label="Exceptions" value={unresolved} icon={<AlertTriangle aria-hidden />} tone={unresolved ? "danger" : "neutral"} href={`/app/projects/${projectId}/exceptions`} />
        <StatCard label="Readiness" value={`${readiness.toFixed(1)}%`} icon={<ShieldCheck aria-hidden />} tone="success" />
        <StatCard label="Snapshots" value={snapshots.length} icon={<Package aria-hidden />} tone="neutral" />
      </div>

      {!ready && total > 0 && (
        <div className="mb-4">
          <AlertBanner tone="warning" title="Handover not clear">
            {unresolved > 0 && <span>{unresolved} unresolved exception(s). </span>}
            {awaiting > 0 && <span>{awaiting} link(s) awaiting verification. </span>}
            Fix mismatches or complete verification before customer sign-off. Acknowledgment keeps discrepancies visible.
          </AlertBanner>
        </div>
      )}

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <section className="rp-card p-4" aria-label="Handover readiness by area">
          <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
            <BarChart3 className="h-4 w-4" aria-hidden />
            Handover Readiness by Area
          </h2>
          <table className="w-full text-[13px]">
            <tbody>
              {areas.map((a) => (
                <tr key={a.label} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 pr-2">
                    <Link href={`/app/projects/${projectId}${a.href}`} className="hover:text-[var(--accent)]">
                      {a.label}
                    </Link>
                  </td>
                  <td className="w-24 py-2">
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                      <div className={cn("h-full rounded-full", a.value >= 100 ? "bg-[var(--success)]" : "bg-amber-400")} style={{ width: `${a.value}%` }} />
                    </div>
                  </td>
                  <td className="w-12 py-2 text-right text-xs font-semibold">{Math.round(a.value)}%</td>
                  <td className="w-24 py-2 text-right">
                    <Badge tone={a.value >= 100 ? "success" : a.value > 0 ? "warning" : "neutral"}>
                      {a.value >= 100 ? "Completed" : a.value > 0 ? "In progress" : "Not started"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rp-card overflow-hidden" aria-label="Open exceptions">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Open Exceptions ({unresolved})
            </h2>
            <Link href={`/app/projects/${projectId}/exceptions`} className="text-xs font-semibold text-[var(--accent)]">
              View all {"\u2192"}
            </Link>
          </div>
          {openList.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No unresolved exceptions.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Cable</th>
                  <th className="px-2 py-2">Observed</th>
                  <th className="px-2 py-2">Severity</th>
                </tr>
              </thead>
              <tbody>
                {openList.map((f) => (
                  <tr key={f.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/app/projects/${projectId}/exceptions?ex=${f.id}`} className="rp-mono font-semibold text-[var(--accent)]">
                        {f.plannedLink.cableId}
                      </Link>
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-2 text-xs">{f.observedSummary ?? "No neighbor"}</td>
                    <td className="px-2 py-2">
                      <Badge tone={SEVERITY_TONE[f.severity]}>{SEVERITY_LABEL[f.severity]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rp-card p-4" aria-label="Acceptance checklist">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
              <ClipboardCheck className="h-4 w-4" aria-hidden />
              Acceptance Checklist
            </h2>
            <span className="rounded-md bg-[var(--muted)] px-2 py-0.5 text-xs font-bold">
              {checklistDone} / {checklist.length}
            </span>
          </div>
          <ul className="space-y-1.5 text-[13px]">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                {c.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-[var(--muted-fg)]" aria-hidden />
                )}
                <span className={c.done ? "" : "text-[var(--muted-fg)]"}>{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-[var(--muted-fg)]">Checks are computed from live project data.</p>
        </section>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="rp-card p-4" aria-label="Handover workflow">
          <h2 className="rp-display mb-4 text-[15px] font-bold">Handover Workflow</h2>
          <ol className="flex items-start">
            {steps.map((s, i) => (
              <li key={s.label} className="relative flex flex-1 flex-col items-center text-center">
                {i > 0 && (
                  <span className={cn("absolute right-1/2 top-4 h-0.5 w-full", steps[i - 1].done ? "bg-[var(--success)]" : "bg-[var(--border)]")} aria-hidden />
                )}
                <span
                  className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold",
                    s.done
                      ? "border-[var(--success)] bg-[var(--success)] text-white"
                      : i === current
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] bg-white text-[var(--muted-fg)]",
                  )}
                >
                  {s.done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className={cn("mt-2 text-xs", i === current ? "font-bold text-[var(--accent)]" : "font-medium")}>{s.label}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rp-card p-4" aria-label="Handover package">
          <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
            <Package className="h-4 w-4" aria-hidden />
            Handover Package
          </h2>
          {!access.canExport ? (
            <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Export not allowed" description="Requires lead role and activated project." />
          ) : (
            <>
              <p className="mb-3 text-xs text-[var(--muted-fg)]">
                Download the CSV export, or freeze the current state as a snapshot with a printable report and customer share link.
              </p>
              <HandoverActions projectId={projectId} snapshotsEnabled />
            </>
          )}
        </section>
      </div>

      <section className="rp-card mb-4 p-4" aria-label="Staged approvals">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Staged Approvals
          </h2>
          <span className="text-xs text-[var(--muted-fg)]">
            {latest ? `Signing against snapshot "${latest.title || latest.id}"` : "Create a handover snapshot to start sign-off"}
          </span>
        </div>
        {latest && blockingExceptions > 0 && (
          <div className="mb-3">
            <AlertBanner tone="danger" title="Owner acceptance blocked">
              {blockingExceptions} critical exception(s) are open without an authorized waiver.{" "}
              <Link href={`/app/projects/${projectId}/exceptions`} className="font-semibold underline">
                Resolve or waive them
              </Link>
              .
            </AlertBanner>
          </div>
        )}
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {HANDOVER_STAGES.map((stage, i) => {
            const signed = approvals.find((a) => a.stage === stage);
            const blocker = latest ? approvalBlocker(stage, actor, approvalCtx) : "No snapshot yet.";
            return (
              <li
                key={stage}
                className={cn(
                  "flex flex-col rounded-[var(--radius)] border p-3",
                  signed ? "border-[var(--success)] bg-[var(--success-soft)]" : "border-[var(--border)]",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">Stage {i + 1}</p>
                <p className="text-sm font-bold">{STAGE_META[stage].label}</p>
                <p className="mb-2 text-[11px] text-[var(--muted-fg)]">{STAGE_META[stage].who}</p>
                {signed ? (
                  <p className="mt-auto text-xs">
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-[var(--success)]" aria-hidden />
                    {signed.approver.name || signed.approver.email} · {fmt(signed.createdAt)}
                    {signed.note && <span className="mt-1 block text-[var(--muted-fg)]">{signed.note}</span>}
                  </p>
                ) : blocker || !latest ? (
                  <p className="mt-auto text-xs text-[var(--muted-fg)]">{blocker}</p>
                ) : (
                  <div className="mt-auto">
                    <HandoverApprovalButton projectId={projectId} snapshotId={latest.id} stage={stage} label={STAGE_META[stage].label} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rp-card overflow-hidden" aria-label="Snapshots and sharing">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
              <FileText className="h-4 w-4" aria-hidden />
              Snapshots &amp; Customer Sharing
            </h2>
          </div>
          {snapshots.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No snapshots yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Snapshot</th>
                    <th className="px-2 py-2">Created</th>
                    <th className="px-2 py-2">State</th>
                    <th className="px-4 py-2 text-right">Report &amp; sharing</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--border)] align-top last:border-0">
                      <td className="px-4 py-2 font-medium">{s.title || s.id}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-[var(--muted-fg)]">
                        {fmt(s.createdAt)}
                        <span className="block">{s.createdBy.name || s.createdBy.email}</span>
                      </td>
                      <td className="px-2 py-2">
                        {s.hasUnresolvedExceptions ? <Badge tone="warning">Unresolved exceptions</Badge> : <Badge tone="success">Clear</Badge>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/app/projects/${projectId}/handover/${s.id}`} className="font-semibold text-[var(--accent)] hover:underline">
                          Print report {"\u2192"}
                        </Link>
                        {access.canExport && (
                          <HandoverShareButton
                            projectId={projectId}
                            snapshotId={s.id}
                            existingUrl={s.shareToken ? `${getAppUrl()}/share/handover/${s.shareToken}` : null}
                            expiresAt={s.shareExpiresAt?.toISOString() ?? null}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rp-card p-4" aria-label="Recent activity">
          <h2 className="rp-display mb-3 text-[15px] font-bold">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No project activity yet.</p>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" aria-hidden />
                  <span className="min-w-0 flex-1">{a.summary}</span>
                  <span className="whitespace-nowrap text-[11px] text-[var(--muted-fg)]">{fmt(a.createdAt).slice(5)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
