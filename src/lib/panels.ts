import { CABLE_TYPE_TAXONOMY, normalizeCableType, type CableTypeCode } from "@/lib/cable-type";

/**
 * Pure patch-panel / circuit rules (Phase 16 CE). Mirrors DB unique constraints so the UI can
 * return friendly errors; the database remains the final guard.
 */

export const MAX_PANEL_PORTS = 288;

export type PanelSideCode = "A" | "Z";

export function validatePanelInput(input: {
  name: string;
  rack: string;
  portCount: number;
  rackUnit?: number | null;
}): { ok: true; value: { name: string; rack: string; portCount: number; rackUnit: number | null } } | { ok: false; error: string } {
  const name = input.name.trim();
  const rack = input.rack.trim();
  if (!name) return { ok: false, error: "Panel name is required" };
  if (!rack) return { ok: false, error: "Rack is required" };
  if (!Number.isInteger(input.portCount) || input.portCount < 1 || input.portCount > MAX_PANEL_PORTS) {
    return { ok: false, error: `Port count must be a whole number from 1 to ${MAX_PANEL_PORTS}` };
  }
  let rackUnit: number | null = null;
  if (input.rackUnit !== null && input.rackUnit !== undefined) {
    if (!Number.isInteger(input.rackUnit) || input.rackUnit < 1 || input.rackUnit > 100) {
      return { ok: false, error: "Rack unit must be a whole number from 1 to 100" };
    }
    rackUnit = input.rackUnit;
  }
  return { ok: true, value: { name, rack, portCount: input.portCount, rackUnit } };
}

/** Port indexes 1..portCount (unique by construction). */
export function buildPanelPortIndexes(portCount: number): number[] {
  return Array.from({ length: portCount }, (_, i) => i + 1);
}

/** Return port indexes that appear more than once within one panel. */
export function findDuplicatePortIndexes(ports: Array<{ portIndex: number }>): number[] {
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const p of ports) {
    if (seen.has(p.portIndex)) dupes.add(p.portIndex);
    seen.add(p.portIndex);
  }
  return Array.from(dupes).sort((a, b) => a - b);
}

export type PortState = {
  id: string;
  panelId: string;
  portIndex: number;
  side: PanelSideCode | null;
  plannedLinkId: string | null;
};

/**
 * Validate mapping a port to one end of a planned link.
 * - side is required with a link (unambiguous end)
 * - a port holds at most one link end (unmap first to change)
 * - a given (link, side) can be mapped on only one port project-wide
 */
export function validatePortMapping(opts: {
  ports: PortState[];
  portId: string;
  plannedLinkId: string;
  side: PanelSideCode | null | undefined;
}): { ok: true } | { ok: false; error: string } {
  const port = opts.ports.find((p) => p.id === opts.portId);
  if (!port) return { ok: false, error: "Port not found" };
  if (opts.side !== "A" && opts.side !== "Z") {
    return { ok: false, error: "Select which cable end (A or Z) lands on this port" };
  }
  if (port.plannedLinkId && !(port.plannedLinkId === opts.plannedLinkId && port.side === opts.side)) {
    return { ok: false, error: "Port is already mapped; unmap it first" };
  }
  const clash = opts.ports.find(
    (p) =>
      p.id !== port.id && p.plannedLinkId === opts.plannedLinkId && p.side === opts.side,
  );
  if (clash) {
    return {
      ok: false,
      error: `Cable end ${opts.side} is already mapped to panel port ${clash.portIndex}`,
    };
  }
  return { ok: true };
}

export function normalizeCircuitMedia(raw: string): CableTypeCode | null {
  const code = normalizeCableType(raw);
  return code && (CABLE_TYPE_TAXONOMY as readonly string[]).includes(code) ? code : null;
}

export type CircuitPortUse = { circuitId: string; portAId: string; portZId: string | null };

/** Validate circuit endpoints: A required, A != Z, each port in at most one circuit. */
export function validateCircuitPorts(opts: {
  portAId: string;
  portZId?: string | null;
  existing: CircuitPortUse[];
  /** Ignore this circuit when checking (edit flows). */
  ignoreCircuitId?: string;
}): { ok: true } | { ok: false; error: string } {
  if (!opts.portAId) return { ok: false, error: "Endpoint A port is required" };
  const z = opts.portZId || null;
  if (z && z === opts.portAId) return { ok: false, error: "A and Z must be different ports" };
  for (const c of opts.existing) {
    if (c.circuitId === opts.ignoreCircuitId) continue;
    const used = new Set([c.portAId, c.portZId].filter(Boolean) as string[]);
    if (used.has(opts.portAId) || (z && used.has(z))) {
      return { ok: false, error: "A selected port is already used by another circuit" };
    }
  }
  return { ok: true };
}

export function validateCircuitInput(input: {
  name: string;
  mediaType: string;
}): { ok: true; name: string; mediaType: CableTypeCode } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Circuit name is required" };
  if (name.length > 120) return { ok: false, error: "Circuit name is too long" };
  const mediaType = normalizeCircuitMedia(input.mediaType);
  if (!mediaType) return { ok: false, error: "Media type is required" };
  return { ok: true, name, mediaType };
}
