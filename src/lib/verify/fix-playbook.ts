/**
 * Build ordered swap-fix playbooks from open WRONG_ENDPOINT / mismatch findings.
 * Pairs cables that mutually (or one-way) reference each other via relatedCableId.
 */

export type PlaybookFindingInput = {
  cableId: string;
  relatedCableId: string | null;
  findingType: string;
  state: string;
  expectedSummary: string;
  observedSummary: string | null;
  aRack: string;
  zRack: string;
  aDevice: string;
  aPort: string;
  zDevice: string;
  zPort: string;
  plannedLinkId: string;
};

export type FixStep = {
  order: number;
  title: string;
  detail: string;
};

export type SwapFixPlaybook = {
  pairKey: string;
  cableIds: [string, string];
  linkIds: string[];
  racks: string[];
  steps: FixStep[];
  summary: string;
};

function isSwapCandidate(f: PlaybookFindingInput): boolean {
  if (f.state !== "MISMATCH" && f.state !== "NEEDS_REVIEW") return false;
  return (
    f.findingType === "WRONG_ENDPOINT" ||
    f.findingType === "PHYSICAL_MISMATCH" ||
    Boolean(f.relatedCableId)
  );
}

/**
 * Group open mismatch findings into de-duplicated swap pairs with fix steps.
 */
export function buildSwapFixPlaybooks(
  findings: PlaybookFindingInput[],
): SwapFixPlaybook[] {
  const byCable = new Map(findings.map((f) => [f.cableId, f]));
  const candidates = findings.filter(isSwapCandidate);
  const used = new Set<string>();
  const playbooks: SwapFixPlaybook[] = [];

  for (const f of candidates) {
    if (used.has(f.cableId)) continue;
    const partnerId = f.relatedCableId;
    if (!partnerId || !byCable.has(partnerId)) continue;

    const partner = byCable.get(partnerId)!;
    // Prefer mutual pairs; still emit if only one side points at the other
    const mutual =
      partner.relatedCableId === f.cableId || partner.relatedCableId === null;

    if (!mutual && partner.relatedCableId && partner.relatedCableId !== f.cableId) {
      continue;
    }

    used.add(f.cableId);
    used.add(partnerId);

    const [first, second] =
      f.cableId < partnerId ? [f, partner] : [partner, f];

    const racks = Array.from(
      new Set([first.aRack, first.zRack, second.aRack, second.zRack]),
    ).sort((a, b) => a.localeCompare(b));

    const steps: FixStep[] = [
      {
        order: 1,
        title: `Uncable ${first.cableId}`,
        detail: `Pull both ends: ${first.aDevice} ${first.aPort} ↔ ${first.zDevice} ${first.zPort} (racks ${first.aRack} / ${first.zRack}).`,
      },
      {
        order: 2,
        title: `Uncable ${second.cableId}`,
        detail: `Pull both ends: ${second.aDevice} ${second.aPort} ↔ ${second.zDevice} ${second.zPort} (racks ${second.aRack} / ${second.zRack}).`,
      },
      {
        order: 3,
        title: `Recable ${first.cableId} to design`,
        detail: `Connect ${first.expectedSummary}.`,
      },
      {
        order: 4,
        title: `Recable ${second.cableId} to design`,
        detail: `Connect ${second.expectedSummary}.`,
      },
      {
        order: 5,
        title: "Re-import neighbor evidence",
        detail:
          "Paste fresh LLDP/CDP from the leaf (or both devices), then confirm exceptions clear.",
      },
    ];

    playbooks.push({
      pairKey: `${first.cableId}|${second.cableId}`,
      cableIds: [first.cableId, second.cableId],
      linkIds: [first.plannedLinkId, second.plannedLinkId],
      racks,
      steps,
      summary: `Swap pair ${first.cableId} ↔ ${second.cableId}: walk racks ${racks.join(", ")}, then re-import evidence.`,
    });
  }

  return playbooks.sort((a, b) => a.cableIds[0].localeCompare(b.cableIds[0]));
}
