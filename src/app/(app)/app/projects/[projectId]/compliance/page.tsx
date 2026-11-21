import Link from "next/link";
import { AlertTriangle, Bell, CalendarClock, CheckCircle2, Clock, Link2, ListChecks, Lock, Mail, PieChart, ShieldCheck, Terminal, XCircle } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import { requireSessionUser } from "@/lib/session";
import { computeEvidenceStaleness } from "@/lib/evidence-staleness";
import { collectablePlannedDevices, evidenceAsOf, evidenceScope } from "@/lib/evidence/scope";
import { DonutWithLegend, Panel } from "@/components/charts";
import { CompliancePolicyForm } from "@/components/compliance-policy-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

type Status = "Compliant" | "Non-compliant" | "Needs review";
type Rule = {
  id: string;
  name: string;
  type: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  scheduled: boolean;
  affected: string[];
  failStatus: Exclude<Status, "Compliant">;
  href: string;
};
const SEV_TONE = { Critical: "danger", High: "warning", Medium: "info", Low: "neutral" } as const;
const STATUS_TONE = { Compliant: "success", "Non-compliant": "danger", "Needs review": "warning" } as const;

export default async function CompliancePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ rule?: string; filter?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }
  const rev = access.project.activeRevisionId;

  const [policy, runs, links, imports, photoLinks, asOf] = await Promise.all([
    prisma.compliancePolicy.findUnique({ where: { projectId } }),
    prisma.complianceRun.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10 }),
    rev
      ? prisma.plannedLink.findMany({
          where: { revisionId: rev },
          orderBy: { cableId: "asc" },
          select: {
            id: true,
            cableId: true,
            aDevice: true,
            zDevice: true,
            cableType: true,
            runtime: { select: { installStatus: true } },
            findings: { take: 1, select: { state: true, exceptionStatus: true } },
          },
        })
      : Promise.resolve([]),
    prisma.evidenceImport.findMany({
      where: { ...evidenceScope(access.project), kind: "NEIGHBOR" },
      select: { sourceDevice: true, sourceDeviceNorm: true, uploadedAt: true, captureTime: true, parseFailed: true },
      orderBy: { uploadedAt: "desc" },
      take: 1000,
    }),
    prisma.fieldPhoto.findMany({ where: { projectId, plannedLinkId: { not: null } }, select: { plannedLinkId: true }, distinct: ["plannedLinkId"] }),
    evidenceAsOf(access.project),
  ]);

  const maxAge = policy?.maxEvidenceAgeDays ?? 7;
  const staleness = computeEvidenceStaleness({
    imports,
    plannedDevices: await collectablePlannedDevices(projectId, Array.from(new Set(links.flatMap((l) => [l.aDevice, l.zDevice])))),
    maxAgeDays: maxAge,
    now: asOf,
  });
  const open = (l: (typeof links)[number], state: string) => l.findings[0]?.state === state && l.findings[0]?.exceptionStatus !== "CLOSED";
  const withPhoto = new Set(photoLinks.map((p) => p.plannedLinkId));
  const base = `/app/projects/${projectId}`;

  const rules: Rule[] = [
    { id: "match", name: "Cabling matches plan (LLDP/CDP)", type: "Verification", severity: "Critical", scheduled: true, affected: links.filter((l) => open(l, "MISMATCH")).map((l) => l.cableId), failStatus: "Non-compliant", href: `${base}/lldp` },
    { id: "review", name: "Ambiguous evidence reviewed", type: "Verification", severity: "High", scheduled: true, affected: links.filter((l) => open(l, "NEEDS_REVIEW")).map((l) => l.cableId), failStatus: "Needs review", href: `${base}/exceptions` },
    { id: "fresh", name: `Neighbor evidence fresher than ${maxAge} days`, type: "Evidence", severity: "High", scheduled: true, affected: staleness.stale.map((d) => `${d.sourceDevice} (${Math.floor(d.ageDays)}d)`), failStatus: "Non-compliant", href: `${base}/lldp` },
    { id: "coverage", name: "Every planned device has evidence", type: "Evidence", severity: "Medium", scheduled: true, affected: staleness.neverImported, failStatus: "Needs review", href: `${base}/collection` },
    { id: "photo", name: "Installed cables have a photo", type: "Installation", severity: "Medium", scheduled: false, affected: links.filter((l) => l.runtime?.installStatus === "INSTALLED" && !withPhoto.has(l.id)).map((l) => l.cableId), failStatus: "Needs review", href: `${base}/evidence` },
    { id: "type", name: "Cable type set on every link", type: "Data quality", severity: "Low", scheduled: false, affected: links.filter((l) => !l.cableType).map((l) => l.cableId), failStatus: "Needs review", href: `${base}/cables` },
    { id: "blocked", name: "No blocked installs", type: "Installation", severity: "Medium", scheduled: false, affected: links.filter((l) => l.runtime?.installStatus === "BLOCKED").map((l) => l.cableId), failStatus: "Non-compliant", href: `${base}/cables?status=BLOCKED` },
  ];
  const statusOf = (r: Rule): Status => (r.affected.length ? r.failStatus : "Compliant");
  const counts = { Compliant: 0, "Non-compliant": 0, "Needs review": 0 } as Record<Status, number>;
  for (const r of rules) counts[statusOf(r)] += 1;
  const filtered = rules.filter((r) => !sp.filter || statusOf(r) === sp.filter);
  const selected = rules.find((r) => r.id === sp.rule) ?? rules.find((r) => r.affected.length) ?? rules[0];

  const badLinks = links.filter((l) => open(l, "MISMATCH")).length;
  const reviewLinks = links.filter((l) => open(l, "NEEDS_REVIEW")).length;
  const okLinks = links.length - badLinks - reviewLinks;
  const lastRun = runs[0];
  const cronConfigured = Boolean(process.env.COMPLIANCE_CRON_SECRET?.trim());
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const appUrl = getAppUrl();
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ rule: sp.rule, filter: sp.filter, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `${base}/compliance${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Compliance"
        title="Compliance Policies & Notifications"
        description="Live cabling compliance rules, scheduled evidence checks, and email alerts via Resend with an external cron."
        actions={
          <>
            <Badge tone={cronConfigured ? "success" : "warning"}>Cron {cronConfigured ? "configured" : "not configured"}</Badge>
            <Badge tone={emailConfigured ? "success" : "neutral"}>Email {emailConfigured ? "configured" : "not configured"}</Badge>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 min-[1600px]:grid-cols-6">
        <StatCard label="Rules" value={rules.length} icon={<ShieldCheck aria-hidden />} tone="info" />
        <StatCard label="Compliant" value={counts.Compliant} icon={<CheckCircle2 aria-hidden />} tone="success" />
        <StatCard label="Non-compliant" value={counts["Non-compliant"]} icon={<XCircle aria-hidden />} tone={counts["Non-compliant"] ? "danger" : "neutral"} />
        <StatCard label="Needs Review" value={counts["Needs review"]} icon={<AlertTriangle aria-hidden />} tone={counts["Needs review"] ? "warning" : "neutral"} />
        <StatCard label="Links Checked" value={links.length} icon={<Link2 aria-hidden />} tone="neutral" />
        <StatCard label="Last Check Run" value={lastRun ? lastRun.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never"} icon={<CalendarClock aria-hidden />} tone="neutral" />
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title={`Compliance Rules (${rules.length})`}
          icon={ListChecks}
          flush
          action={
            <div className="flex gap-1">
              {(["", "Compliant", "Non-compliant", "Needs review"] as const).map((f) => (
                <Link
                  key={f || "all"}
                  href={href({ filter: f || undefined })}
                  scroll={false}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", (sp.filter ?? "") === f ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--muted)]")}
                >
                  {f || "All"}
                </Link>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Rule</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Severity</th>
                  <th className="px-2 py-2 text-right">Affected</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const st = statusOf(r);
                  return (
                    <tr key={r.id} className={cn("border-b border-[var(--border)] last:border-0", selected.id === r.id ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                      <td className="px-4 py-2">
                        <Link href={href({ rule: r.id })} scroll={false} className="font-semibold text-[var(--accent-ink)] hover:underline">
                          {r.name}
                        </Link>
                        <span className="block text-[11px] text-[var(--muted-fg)]">{r.scheduled ? "Scheduled check + email" : "Live check (this page)"}</span>
                      </td>
                      <td className="px-2 py-2 text-xs">{r.type}</td>
                      <td className="px-2 py-2">
                        <Badge tone={SEV_TONE[r.severity]}>{r.severity}</Badge>
                      </td>
                      <td className="rp-mono px-2 py-2 text-right">{r.affected.length}</td>
                      <td className="px-4 py-2">
                        <Badge tone={STATUS_TONE[st]}>{st}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Link Result Summary" icon={PieChart}>
            <DonutWithLegend
              total={links.length}
              label="links"
              segments={[
                { label: "Compliant", value: okLinks, color: "#16a34a" },
                { label: "Mismatch", value: badLinks, color: "#ef4444" },
                { label: "Needs review", value: reviewLinks, color: "#f59e0b" },
              ]}
            />
          </Panel>
          <Panel title={`Affected \u2014 ${selected.name}`} icon={AlertTriangle} action={<Link href={selected.href} className="text-xs font-semibold text-[var(--accent-ink)]">Fix {"\u2192"}</Link>}>
            {selected.affected.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-[var(--success-ink)]">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Nothing affected.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {selected.affected.slice(0, 24).map((a) => (
                  <li key={a} className="rp-mono rounded border border-[var(--border)] bg-[var(--muted)]/60 px-1.5 py-0.5 text-xs">
                    {a}
                  </li>
                ))}
                {selected.affected.length > 24 && <li className="text-xs text-[var(--muted-fg)]">+{selected.affected.length - 24} more</li>}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="External Cron (Required)" icon={Terminal}>
          <p className="mb-2 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent-ink)]">Scheduled checks need an external cron; RackPatch does not run a scheduler itself.</p>
          <pre tabIndex={0} className="rp-mono mb-3 overflow-x-auto rounded-md bg-slate-900 p-2.5 text-[11px] leading-relaxed text-slate-100">
            {`*/30 * * * * curl -X POST \\\n  -H "x-compliance-secret: $SECRET" \\\n  ${appUrl}/api/internal/compliance-check`}
          </pre>
          <ul className="space-y-1.5 text-[13px]">
            <li className="flex items-center gap-2">
              {cronConfigured ? <CheckCircle2 className="h-4 w-4 text-[var(--success-ink)]" aria-hidden /> : <XCircle className="h-4 w-4 text-[var(--warning-ink)]" aria-hidden />}
              COMPLIANCE_CRON_SECRET {cronConfigured ? "set" : "not set"}
            </li>
            <li className="flex items-center gap-2">
              {policy?.enabled ? <CheckCircle2 className="h-4 w-4 text-[var(--success-ink)]" aria-hidden /> : <XCircle className="h-4 w-4 text-[var(--warning-ink)]" aria-hidden />}
              Policy {policy ? (policy.enabled ? "enabled for this project" : "disabled") : "not saved yet"}
            </li>
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--muted-fg)]" aria-hidden />
              Recommended: every 30{"\u2013"}60 minutes
            </li>
          </ul>
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Notification Settings (Resend)" icon={Bell} action={<Badge tone={emailConfigured ? "success" : "neutral"}>{emailConfigured ? "Configured" : "RESEND_API_KEY not set"}</Badge>}>
          <CompliancePolicyForm
            projectId={projectId}
            hasPolicy={Boolean(policy)}
            canEdit={access.canManageProject}
            initial={{
              enabled: policy?.enabled ?? true,
              maxEvidenceAgeDays: policy?.maxEvidenceAgeDays ?? 7,
              notifyEmails: (policy?.notifyEmails ?? []).join(", "),
              recomputeFindings: policy?.recomputeFindings ?? false,
            }}
          />
          <p className="mt-3 text-xs text-[var(--muted-fg)]">Emails are sent only when issues exist and the issue set changed, or 24 hours passed since the last alert.</p>
        </Panel>

        <Panel title="Check & Delivery History" icon={Mail} flush>
          {runs.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No compliance runs yet. Save the policy and use Run check now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">When</th>
                    <th className="px-2 py-2">Trigger</th>
                    <th className="px-2 py-2">Result</th>
                    <th className="px-2 py-2">Summary</th>
                    <th className="px-4 py-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border)] align-top last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-xs">{r.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-2 py-2 text-xs capitalize">{r.trigger}</td>
                      <td className="px-2 py-2">
                        <Badge tone={r.status === "OK" ? "success" : r.status === "ERROR" ? "danger" : "warning"}>{r.status}</Badge>
                      </td>
                      <td className="max-w-[260px] px-2 py-2 text-xs">
                        <span className="line-clamp-2">{r.summary}</span>
                      </td>
                      <td className="px-4 py-2">
                        {r.notifyError ? <Badge tone="danger">Failed</Badge> : r.notified ? <Badge tone="success">Delivered</Badge> : <Badge tone="neutral">Not sent</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
