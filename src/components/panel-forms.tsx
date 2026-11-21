"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCircuit,
  createPatchPanel,
  deleteCircuit,
  mapPanelPort,
  unmapPanelPort,
} from "@/app/actions/panels";
import { Button, ErrorBanner, Input, Select } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

type Option = { id: string; label: string };

function useRunner() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(actionErrorMessage(e, "Action failed"));
      }
    });
  }
  return { error, pending, run };
}

export function PanelCreateForm({ projectId }: { projectId: string }) {
  const { error, pending, run } = useRunner();
  return (
    <form
      className="grid grid-cols-2 gap-3"
      action={(fd) =>
        run(() =>
          createPatchPanel({
            projectId,
            name: String(fd.get("name") || ""),
            rack: String(fd.get("rack") || ""),
            rackUnit: fd.get("rackUnit") ? Number(fd.get("rackUnit")) : null,
            portCount: Number(fd.get("portCount") || 0),
          }),
        )
      }
    >
      {error && (
        <div className="col-span-2">
          <ErrorBanner message={error} />
        </div>
      )}
      <Input name="name" required placeholder="Panel name (e.g. ODF-A1)" className="col-span-2" />
      <Input name="rack" required placeholder="Rack" />
      <Input name="rackUnit" type="number" min={1} placeholder="Rack U (optional)" />
      <Input name="portCount" type="number" min={1} max={288} required placeholder="Ports" className="col-span-2" />
      <Button type="submit" className="col-span-2" disabled={pending}>
        Create panel
      </Button>
    </form>
  );
}

export function PortMapForm({
  projectId,
  freePorts,
  links,
}: {
  projectId: string;
  freePorts: Option[];
  links: Option[];
}) {
  const { error, pending, run } = useRunner();
  if (freePorts.length === 0 || links.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-fg)]">
        {freePorts.length === 0
          ? "No unmapped panel ports. Create a panel first."
          : "Publish a plan to map ports to cables."}
      </p>
    );
  }
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      action={(fd) =>
        run(() =>
          mapPanelPort({
            projectId,
            portId: String(fd.get("portId")),
            plannedLinkId: String(fd.get("plannedLinkId")),
            side: String(fd.get("side")) as "A" | "Z",
          }),
        )
      }
    >
      {error && (
        <div className="sm:col-span-4">
          <ErrorBanner message={error} />
        </div>
      )}
      <Select name="portId" aria-label="Panel port" required defaultValue={freePorts[0].id}>
        {freePorts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
      <Select name="plannedLinkId" aria-label="Planned cable" required defaultValue={links[0].id}>
        {links.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </Select>
      <Select name="side" aria-label="Panel side" defaultValue="A">
        <option value="A">Cable end A</option>
        <option value="Z">Cable end Z</option>
      </Select>
      <Button type="submit" disabled={pending}>
        Map port
      </Button>
    </form>
  );
}

export function CircuitForm({
  projectId,
  ports,
  mediaTypes,
}: {
  projectId: string;
  ports: Option[];
  mediaTypes: string[];
}) {
  const { error, pending, run } = useRunner();
  if (ports.length < 1) {
    return <p className="text-sm text-[var(--muted-fg)]">No free panel ports for a circuit.</p>;
  }
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      action={(fd) =>
        run(() =>
          createCircuit({
            projectId,
            name: String(fd.get("name") || ""),
            mediaType: String(fd.get("mediaType") || ""),
            panelPortAId: String(fd.get("panelPortAId") || ""),
            panelPortZId: String(fd.get("panelPortZId") || "") || null,
          }),
        )
      }
    >
      {error && (
        <div className="sm:col-span-3">
          <ErrorBanner message={error} />
        </div>
      )}
      <Input name="name" required placeholder="Circuit name" />
      <Select name="mediaType" aria-label="Media type" defaultValue={mediaTypes[0]}>
        {mediaTypes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>
      <span />
      <Select name="panelPortAId" aria-label="Panel port A" required defaultValue={ports[0].id}>
        {ports.map((p) => (
          <option key={p.id} value={p.id}>
            A: {p.label}
          </option>
        ))}
      </Select>
      <Select name="panelPortZId" aria-label="Panel port Z" defaultValue="">
        <option value="">Z: (none)</option>
        {ports.map((p) => (
          <option key={p.id} value={p.id}>
            Z: {p.label}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={pending}>
        Create circuit
      </Button>
    </form>
  );
}

export function UnmapPortButton({ projectId, portId }: { projectId: string; portId: string }) {
  const { error, pending, run } = useRunner();
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-[var(--danger-ink)]">{error}</span>}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => unmapPanelPort({ projectId, portId }))}
      >
        Unmap
      </Button>
    </span>
  );
}

export function DeleteCircuitButton({
  projectId,
  circuitId,
}: {
  projectId: string;
  circuitId: string;
}) {
  const { error, pending, run } = useRunner();
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-[var(--danger-ink)]">{error}</span>}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => deleteCircuit({ projectId, circuitId }))}
      >
        Delete
      </Button>
    </span>
  );
}
