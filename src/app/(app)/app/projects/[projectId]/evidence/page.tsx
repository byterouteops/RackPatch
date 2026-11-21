import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileBarChart,
  FileText,
  Filter,
  ImageIcon,
  Lock,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { evidenceScope } from "@/lib/evidence/scope";
import { requireSessionUser } from "@/lib/session";
import { ProjectPageHeader } from "@/components/project-page-header";
import { ProjectStrip, StripFact } from "@/components/project-strip";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

type Kind = "photo" | "lldp" | "physical";
type Item = {
  key: string;
  kind: Kind;
  name: string;
  cableId: string | null;
  linkId: string | null;
  rack: string | null;
  at: Date;
  by: string;
  status: { label: string; tone: "success" | "warning" | "danger" | "neutral" };
};

const TABS: Array<{ id: "all" | Kind; label: string; icon: typeof Camera }> = [
  { id: "all", label: "All Evidence", icon: ImageIcon },
  { id: "photo", label: "Photos", icon: Camera },
  { id: "lldp", label: "LLDP / CDP Logs", icon: FileText },
  { id: "physical", label: "Physical Checks", icon: ShieldCheck },
];
const KIND_ICON: Record<Kind, typeof Camera> = { photo: ImageIcon, lldp: FileText, physical: ShieldCheck };
const PAGE_SIZE = 15;

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function EvidenceLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ type?: string; item?: string; q?: string; page?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return (
      <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />
    );
  }
  const project = access.project;
  const rev = project.activeRevisionId;
  const base = `/app/projects/${projectId}/evidence`;
  const tab = TABS.find((t) => t.id === sp.type)?.id ?? "all";
  const q = (sp.q ?? "").trim();
  const page = Math.max(0, Number(sp.page ?? 0) || 0);

  const [photos, imports, physical, totalCables, photoCables, lldpVerified, physicalCables, anyEvidence, activity] = await Promise.all([
    prisma.fieldPhoto.findMany({
      where: { projectId },
      orderBy: { capturedAt: "desc" },
      take: 200,
      select: {
        id: true,
        note: true,
        source: true,
        capturedAt: true,
        mimeType: true,
        byteSize: true,
        uploadedById: true,
        plannedLink: { select: { id: true, cableId: true, aRack: true, aDevice: true, aPort: true, zDevice: true, zPort: true } },
      },
    }),
    prisma.evidenceImport.findMany({
      where: evidenceScope(project),
      orderBy: { uploadedAt: "desc" },
      take: 200,
      select: {
        id: true,
        sourceDevice: true,
        filename: true,
        uploadedAt: true,
        captureTime: true,
        uploadedById: true,
        parseFailed: true,
        parseError: true,
        parseWarnings: true,
        _count: { select: { observations: true } },
      },
    }),
    rev
      ? prisma.physicalVerification.findMany({
          where: { revisionId: rev },
          orderBy: { verifiedAt: "desc" },
          take: 200,
          select: {
            id: true,
            verifiedAt: true,
            note: true,
            aConfirmed: true,
            zConfirmed: true,
            verifierId: true,
            plannedLink: { select: { id: true, cableId: true, aRack: true, aDevice: true, aPort: true, zDevice: true, zPort: true } },
          },
        })
      : Promise.resolve([]),
    rev ? prisma.plannedLink.count({ where: { revisionId: rev } }) : Promise.resolve(0),
    rev ? prisma.plannedLink.count({ where: { revisionId: rev, fieldPhotos: { some: {} } } }) : Promise.resolve(0),
    rev ? prisma.verificationFinding.count({ where: { revisionId: rev, state: "VERIFIED_LLDP" } }) : Promise.resolve(0),
    rev ? prisma.plannedLink.count({ where: { revisionId: rev, physicalChecks: { some: { revisionId: rev } } } }) : Promise.resolve(0),
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
      where: {
        projectId,
        OR: [{ action: { startsWith: "evidence" } }, { action: { startsWith: "field_photo" } }, { action: { startsWith: "verify" } }],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, action: true, summary: true, createdAt: true },
    }),
  ]);

  const userIds = [...new Set([...photos.map((p) => p.uploadedById), ...imports.map((i) => i.uploadedById), ...physical.map((p) => p.verifierId)])];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const who = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? u.name || u.email : "Unknown";
  };

  const items: Item[] = [
    ...photos.map<Item>((p) => ({
      key: `photo:${p.id}`,
      kind: "photo",
      name: p.note?.slice(0, 40) || `${p.plannedLink?.cableId ?? "photo"}.${p.mimeType.split("/")[1] ?? "img"}`,
      cableId: p.plannedLink?.cableId ?? null,
      linkId: p.plannedLink?.id ?? null,
      rack: p.plannedLink?.aRack ?? null,
      at: p.capturedAt,
      by: who(p.uploadedById),
      status: p.plannedLink ? { label: "Linked", tone: "success" } : { label: "Unlinked", tone: "warning" },
    })),
    ...imports.map<Item>((i) => ({
      key: `lldp:${i.id}`,
      kind: "lldp",
      name: i.filename || `${i.sourceDevice}_neighbors.txt`,
      cableId: null,
      linkId: null,
      rack: null,
      at: i.uploadedAt,
      by: who(i.uploadedById),
      status: i.parseFailed
        ? { label: "Parse failed", tone: "danger" }
        : i.parseWarnings.length
          ? { label: "Warnings", tone: "warning" }
          : { label: "Parsed", tone: "success" },
    })),
    ...physical.map<Item>((p) => ({
      key: `physical:${p.id}`,
      kind: "physical",
      name: `Physical check ${p.plannedLink.cableId}`,
      cableId: p.plannedLink.cableId,
      linkId: p.plannedLink.id,
      rack: p.plannedLink.aRack,
      at: p.verifiedAt,
      by: who(p.verifierId),
      status: p.aConfirmed && p.zConfirmed ? { label: "Confirmed", tone: "success" } : { label: "Partial", tone: "warning" },
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const counts = { all: items.length, photo: photos.length, lldp: imports.length, physical: physical.length };
  const needle = q.toLowerCase();
  const filtered = items.filter(
    (i) =>
      (tab === "all" || i.kind === tab) &&
      (!needle || i.name.toLowerCase().includes(needle) || (i.cableId ?? "").toLowerCase().includes(needle) || i.by.toLowerCase().includes(needle)),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selected = items.find((i) => i.key === sp.item) ?? pageItems[0] ?? null;

  const selPhoto = selected?.kind === "photo" ? photos.find((p) => `photo:${p.id}` === selected.key) : undefined;
  const selImport = selected?.kind === "lldp" ? imports.find((i) => `lldp:${i.id}` === selected.key) : undefined;
  const selPhysical = selected?.kind === "physical" ? physical.find((p) => `physical:${p.id}` === selected.key) : undefined;
  const observations = selImport
    ? await prisma.observation.findMany({
        where: { evidenceImportId: selImport.id },
        orderBy: { localInterfaceNorm: "asc" },
        take: 12,
        select: { id: true, localInterface: true, remoteSystemName: true, remotePortId: true },
      })
    : [];
  const selLink = selPhoto?.plannedLink ?? selPhysical?.plannedLink ?? null;
  const chain = selLink
    ? await prisma.plannedLink.findUnique({
        where: { id: selLink.id },
        select: {
          runtime: { select: { installStatus: true } },
          fieldPhotos: { take: 1, select: { id: true } },
          findings: { where: { revisionId: rev ?? "" }, take: 1, select: { state: true } },
          physicalChecks: { take: 1, select: { id: true } },
        },
      })
    : null;

  function qs(next: { type?: string; item?: string; page?: number }) {
    const p = new URLSearchParams();
    const t = next.type ?? tab;
    if (t !== "all") p.set("type", t);
    if (q) p.set("q", q);
    const pg = next.page ?? (next.type ? 0 : page);
    if (pg > 0) p.set("page", String(pg));
    if (next.item) p.set("item", next.item);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  }

  const feed =
    activity.length > 0
      ? activity
      : items.slice(0, 6).map((i) => ({
          id: i.key,
          summary: `${i.kind === "physical" ? "Physical check" : i.kind === "lldp" ? "LLDP/CDP import" : "Photo"} ${i.cableId ?? i.name} by ${i.by}`,
          createdAt: i.at,
        }));

  const coverage = [
    { label: "Photos", value: photoCables, icon: Camera },
    { label: "LLDP / CDP verified", value: lldpVerified, icon: Network },
    { label: "Physical checks", value: physicalCables, icon: ShieldCheck },
  ];

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Evidence"
        title="Evidence Management"
        description="Installation photos, LLDP/CDP outputs and physical verification records for this project."
        actions={
          <>
            <Button href={`/app/projects/${projectId}/scan`} size="sm">
              <Plus className="h-4 w-4" aria-hidden />
              Add Photo Evidence
            </Button>
            <Button href={`/app/projects/${projectId}/lldp`} size="sm" variant="secondary">
              <Upload className="h-4 w-4" aria-hidden />
              Import LLDP / CDP
            </Button>
            <Button href={`/app/projects/${projectId}/reports`} size="sm" variant="secondary">
              <FileBarChart className="h-4 w-4" aria-hidden />
              Evidence Report
            </Button>
          </>
        }
      />

      <ProjectStrip
        name={project.name}
        meta={[`Site: ${project.site}`, `Total evidence: ${items.length.toLocaleString("en-US")}`]}
        progressLabel="Evidence Coverage (cables with any evidence)"
        progressValue={anyEvidence}
        progressMax={totalCables}
        aside={<StripFact icon={<Camera />} label="Latest evidence" value={items[0] ? fmt(items[0].at) : "None yet"} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={qs({ type: t.id })}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors",
              tab === t.id
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label} ({counts[t.id]})
          </Link>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[230px_minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rp-card p-4" aria-label="Filters">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
              <Filter className="h-4 w-4" aria-hidden />
              Filters
            </h2>
            <Link href={base} className="text-xs font-semibold text-[var(--accent)]">
              Reset
            </Link>
          </div>
          <form action={base} className="space-y-3 text-[13px]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted-fg)]">Search</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-fg)]" aria-hidden />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Cable ID, file, uploader"
                  className="h-9 w-full rounded-md border border-[var(--border)] pl-8 pr-2 outline-none focus:border-[var(--accent)]"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted-fg)]">Evidence type</span>
              <select name="type" defaultValue={tab} className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2">
                {TABS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm" className="w-full">
              Apply
            </Button>
          </form>
        </section>

        <section className="rp-card overflow-hidden" aria-label="Evidence list">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[15px] font-bold">Evidence ({filtered.length})</h2>
          </div>
          {pageItems.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No evidence matches.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-3 py-2">Evidence</th>
                  <th className="px-2 py-2">Cable</th>
                  <th className="px-2 py-2">Uploaded</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((i) => {
                  const Icon = KIND_ICON[i.kind];
                  const sel = i.key === selected?.key;
                  return (
                    <tr
                      key={i.key}
                      className={cn(
                        "border-b border-[var(--border)] last:border-0",
                        sel ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60",
                      )}
                    >
                      <td className="max-w-[220px] px-3 py-2">
                        <Link href={qs({ item: i.key })} scroll={false} className="flex items-center gap-2 font-medium text-[var(--accent)] hover:underline">
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="truncate">{i.name}</span>
                        </Link>
                      </td>
                      <td className="rp-mono px-2 py-2 text-xs">{i.cableId ?? "\u2014"}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-[var(--muted-fg)]">{fmt(i.at)}</td>
                      <td className="px-2 py-2">
                        <Badge tone={i.status.tone}>{i.status.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted-fg)]">
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <div className="flex gap-1">
              {page > 0 ? (
                <Link href={qs({ page: page - 1 })} className="rounded-md border border-[var(--border)] p-1.5 hover:bg-[var(--muted)]" aria-label="Previous page">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {page < pageCount - 1 ? (
                <Link href={qs({ page: page + 1 })} className="rounded-md border border-[var(--border)] p-1.5 hover:bg-[var(--muted)]" aria-label="Next page">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rp-card overflow-hidden" aria-label="Evidence preview and details">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display truncate text-[15px] font-bold">{selected ? selected.name : "Preview"}</h2>
            {selected && <Badge tone={selected.status.tone}>{selected.status.label}</Badge>}
          </div>
          {!selected ? (
            <div className="p-4">
              <EmptyState icon={<Camera className="h-5 w-5" aria-hidden />} title="No evidence yet" description="Capture a photo from the scanner or import LLDP/CDP output." />
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {selPhoto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/field-photos/${selPhoto.id}`}
                  alt={selPhoto.note || "Field photo"}
                  className="max-h-[300px] w-full rounded-lg bg-[var(--sidebar)] object-contain"
                />
              )}
              {selImport && (
                <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                  <p className="border-b border-[var(--border)] bg-[var(--muted)]/60 px-3 py-2 text-xs font-semibold">
                    {selImport._count.observations} neighbor observation(s) from {selImport.sourceDevice}
                  </p>
                  {observations.length === 0 ? (
                    <p className="p-3 text-xs text-[var(--muted-fg)]">{selImport.parseError ?? "No neighbors parsed."}</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {observations.map((o) => (
                          <tr key={o.id} className="border-b border-[var(--border)] last:border-0">
                            <td className="rp-mono px-3 py-1.5">{o.localInterface}</td>
                            <td className="px-2 py-1.5 text-[var(--muted-fg)]">{"\u2192"}</td>
                            <td className="px-2 py-1.5 font-semibold">{o.remoteSystemName ?? "\u2014"}</td>
                            <td className="rp-mono px-2 py-1.5">{o.remotePortId ?? "\u2014"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-[var(--muted-fg)]">Type</dt>
                <dd>{TABS.find((t) => t.id === selected.kind)?.label}</dd>
                {selLink && (
                  <>
                    <dt className="text-[var(--muted-fg)]">Cable ID</dt>
                    <dd>
                      <Link href={`/app/projects/${projectId}/cables/${selLink.id}`} className="rp-mono font-semibold text-[var(--accent)]">
                        {selLink.cableId}
                      </Link>
                    </dd>
                    <dt className="text-[var(--muted-fg)]">A-End</dt>
                    <dd>
                      {selLink.aDevice}/{selLink.aPort}
                    </dd>
                    <dt className="text-[var(--muted-fg)]">B-End</dt>
                    <dd>
                      {selLink.zDevice}/{selLink.zPort}
                    </dd>
                    <dt className="text-[var(--muted-fg)]">Rack</dt>
                    <dd>{selLink.aRack}</dd>
                  </>
                )}
                {selImport && (
                  <>
                    <dt className="text-[var(--muted-fg)]">Device</dt>
                    <dd className="font-semibold">{selImport.sourceDevice}</dd>
                    <dt className="text-[var(--muted-fg)]">Captured</dt>
                    <dd>{selImport.captureTime ? fmt(selImport.captureTime) : "\u2014"}</dd>
                    {selImport.parseWarnings.length > 0 && (
                      <>
                        <dt className="text-[var(--muted-fg)]">Warnings</dt>
                        <dd className="text-xs text-[var(--warning-ink)]">{selImport.parseWarnings.slice(0, 3).join("; ")}</dd>
                      </>
                    )}
                  </>
                )}
                <dt className="text-[var(--muted-fg)]">{selected.kind === "physical" ? "Verified by" : "Uploaded by"}</dt>
                <dd>{selected.by}</dd>
                <dt className="text-[var(--muted-fg)]">{selected.kind === "physical" ? "Verified at" : "Uploaded at"}</dt>
                <dd>{fmt(selected.at)}</dd>
                {selPhoto && (
                  <>
                    <dt className="text-[var(--muted-fg)]">File</dt>
                    <dd>
                      {selPhoto.mimeType} {"\u00b7"} {Math.round(selPhoto.byteSize / 1024)} KB {"\u00b7"} {selPhoto.source}
                    </dd>
                  </>
                )}
                {(selPhoto?.note || selPhysical?.note) && (
                  <>
                    <dt className="text-[var(--muted-fg)]">Note</dt>
                    <dd>{selPhoto?.note || selPhysical?.note}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rp-card p-4" aria-label="Evidence coverage">
          <h2 className="rp-display mb-3 text-[15px] font-bold">Evidence Coverage</h2>
          <ul className="space-y-3 text-[13px]">
            {coverage.map((c) => {
              const pct = totalCables ? (c.value / totalCables) * 100 : 0;
              return (
                <li key={c.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <c.icon className="h-4 w-4 text-[var(--muted-fg)]" aria-hidden />
                      {c.label}
                    </span>
                    <span className="rp-mono text-xs">
                      {c.value} / {totalCables} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
            <li className="border-t border-[var(--border)] pt-2 font-bold">
              Overall: {anyEvidence} / {totalCables} cables
            </li>
          </ul>
        </section>

        <section className="rp-card p-4" aria-label="Recent activity">
          <h2 className="rp-display mb-3 text-[15px] font-bold">Recent Activity</h2>
          {feed.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No evidence activity yet.</p>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {feed.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" aria-hidden />
                  <span className="min-w-0 flex-1">{a.summary}</span>
                  <span className="whitespace-nowrap text-[11px] text-[var(--muted-fg)]">{a.createdAt.toISOString().slice(5, 16).replace("T", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rp-card p-4" aria-label="Evidence chain">
          <h2 className="rp-display mb-4 text-[15px] font-bold">
            Evidence Chain {selLink && <>{"\u2014"} <span className="rp-mono">{selLink.cableId}</span></>}
          </h2>
          {!chain ? (
            <p className="text-sm text-[var(--muted-fg)]">Select a cable-linked photo or physical check to see its evidence chain.</p>
          ) : (
            <ol className="flex items-start">
              {[
                { label: "Installed", done: chain.runtime?.installStatus === "INSTALLED" },
                { label: "Photo", done: chain.fieldPhotos.length > 0 },
                { label: "LLDP / CDP", done: chain.findings[0]?.state === "VERIFIED_LLDP" },
                { label: "Physical", done: chain.physicalChecks.length > 0 },
              ].map((s, i) => (
                <li key={s.label} className="relative flex flex-1 flex-col items-center text-center">
                  {i > 0 && <span className="absolute right-1/2 top-3.5 h-0.5 w-full bg-[var(--border)]" aria-hidden />}
                  <span className={cn("relative z-10 rounded-full bg-white", s.done ? "text-[var(--success)]" : "text-[var(--muted-fg)]")}>
                    {s.done ? <CheckCircle2 className="h-7 w-7" aria-hidden /> : <Circle className="h-7 w-7" aria-hidden />}
                  </span>
                  <span className="mt-1.5 text-xs font-semibold">{s.label}</span>
                  <span className="text-[10px] text-[var(--muted-fg)]">{s.done ? "Done" : "Pending"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
