import Link from "next/link";
import type { SwapFixPlaybook } from "@/lib/verify/fix-playbook";
import { Card } from "@/components/ui";

export function SwapFixPlaybookList({
  projectId,
  playbooks,
}: {
  projectId: string;
  playbooks: SwapFixPlaybook[];
}) {
  if (playbooks.length === 0) return null;

  return (
    <div className="space-y-4">
      {playbooks.map((pb) => (
        <Card
          key={pb.pairKey}
          title={`Fix playbook · ${pb.cableIds[0]} ↔ ${pb.cableIds[1]}`}
        >
          <p className="mb-3 text-sm text-[var(--muted-fg)]">{pb.summary}</p>
          <ol className="space-y-3">
            {pb.steps.map((step) => (
              <li key={step.order} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                  {step.order}
                </span>
                <div>
                  <p className="font-semibold text-[var(--foreground)]">{step.title}</p>
                  <p className="mt-0.5 text-[var(--muted-fg)]">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {pb.linkIds.map((linkId, i) => (
              <Link
                key={linkId}
                href={`/app/projects/${projectId}/cables/${linkId}`}
                className="font-medium text-[var(--accent)] hover:underline"
              >
                Open {pb.cableIds[i]}
              </Link>
            ))}
            <Link
              href={`/app/projects/${projectId}/lldp`}
              className="font-medium text-[var(--accent)] hover:underline"
            >
              Re-import evidence →
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
