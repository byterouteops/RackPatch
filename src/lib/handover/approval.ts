export const HANDOVER_STAGES = ["INSTALLATION", "INDEPENDENT_QC", "ENGINEERING", "OWNER"] as const;
export type HandoverStage = (typeof HANDOVER_STAGES)[number];

export const STAGE_META: Record<HandoverStage, { label: string; who: string }> = {
  INSTALLATION: { label: "Installation complete", who: "Installer or lead (any non-viewer member)" },
  INDEPENDENT_QC: { label: "Independent QC", who: "Non-contractor member who did not sign the installation stage" },
  ENGINEERING: { label: "Engineering acceptance", who: "Lead or non-contractor engineer" },
  OWNER: { label: "Owner acceptance", who: "Workspace owner; blocked while unwaived critical exceptions are open" },
};

export function isStage(s: string): s is HandoverStage {
  return (HANDOVER_STAGES as readonly string[]).includes(s);
}

export type ApprovalActor = {
  userId: string;
  projectRole: "LEAD" | "TECHNICIAN" | "VIEWER" | null;
  contractor: boolean;
  workspaceOwner: boolean;
};

export type ApprovalContext = {
  /** Existing approvals on this snapshot. */
  approvals: { stage: string; approverId: string }[];
  /** Open ERROR-severity findings on the active revision without an authorized waiver. */
  blockingExceptions: number;
};

/** Returns null when the actor may sign `stage` now, otherwise the reason they cannot. */
export function approvalBlocker(stage: HandoverStage, actor: ApprovalActor, ctx: ApprovalContext): string | null {
  const signed = new Map(ctx.approvals.map((a) => [a.stage, a.approverId]));
  if (signed.has(stage)) return "This stage is already signed.";
  const idx = HANDOVER_STAGES.indexOf(stage);
  const missing = HANDOVER_STAGES.slice(0, idx).find((s) => !signed.has(s));
  if (missing) return `Sign ${STAGE_META[missing].label} first.`;

  const member = actor.workspaceOwner || (actor.projectRole !== null && actor.projectRole !== "VIEWER");
  if (!member) return "Read-only members cannot sign handover stages.";

  switch (stage) {
    case "INSTALLATION":
      return null;
    case "INDEPENDENT_QC":
      if (actor.contractor) return "Contractors cannot perform independent QC.";
      if (signed.get("INSTALLATION") === actor.userId) return "QC must be independent: you signed the installation stage.";
      return null;
    case "ENGINEERING":
      if (actor.contractor) return "Contractors cannot sign engineering acceptance.";
      return null;
    case "OWNER":
      if (!actor.workspaceOwner) return "Only the workspace owner can sign owner acceptance.";
      if (ctx.blockingExceptions > 0)
        return `${ctx.blockingExceptions} critical exception(s) are open without an authorized waiver.`;
      return null;
  }
}
