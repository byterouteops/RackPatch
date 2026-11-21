import type { LinkMatchResult } from "@/lib/verify/match";
import type { Observability } from "@/lib/verify/observability";
import { normalizeSpeed } from "@/lib/lldp/interface-status";

/**
 * Turn a neighbor match plus context (observability, interface state, staleness, parse failures)
 * into the stored verification outcome. Pure and unit-tested.
 */

export type Outcome = {
  state: "AWAITING" | "VERIFIED_LLDP" | "MISMATCH" | "NEEDS_REVIEW";
  findingType:
    | "EXACT_MATCH"
    | "WRONG_NEIGHBOR"
    | "WRONG_PORT"
    | "AMBIGUOUS"
    | "AMBIGUOUS_IDENTITY"
    | "CONFLICTING_OBSERVATIONS"
    | "NO_OBSERVATION"
    | "MISSING_NEIGHBOR"
    | "STALE_EVIDENCE"
    | "UNOBSERVABLE"
    | "PARSER_ERROR"
    | "LINK_DOWN"
    | "SPEED_MISMATCH";
  severity: "INFO" | "WARNING" | "ERROR";
  nextAction: string;
  observedSummary: string | null;
};

export type EndpointContext = {
  observable: boolean;
  /** A successful neighbor import exists for this endpoint's device. */
  hasNeighborEvidence: boolean;
  /** Only failed imports exist for this endpoint's device. */
  parseFailedOnly: boolean;
  /** From `show interface status`, when available. */
  interfaceState?: { operState: string; speed: string | null } | null;
  label: string;
};

export type EvaluateInput = {
  match: LinkMatchResult;
  observability: Observability | null;
  observabilityReason: string | null;
  plannedSpeed: string | null;
  a: EndpointContext;
  z: EndpointContext;
  /** Evidence older than this is stale. Null disables staleness (no compliance policy). */
  staleBefore: Date | null;
};

export function evaluateLink(input: EvaluateInput): Outcome {
  const { match, a, z } = input;
  const observedSummary = match.observedSummary;
  const stale =
    input.staleBefore && match.oldestCaptureTime && match.oldestCaptureTime.getTime() < input.staleBefore.getTime();

  if (match.kind !== "no_observation" && stale) {
    return {
      state: "NEEDS_REVIEW",
      findingType: "STALE_EVIDENCE",
      severity: "WARNING",
      nextAction: `Evidence captured ${match.oldestCaptureTime!.toISOString().slice(0, 16)} is older than the policy limit; re-collect neighbors`,
      observedSummary,
    };
  }

  switch (match.detail) {
    case "match": {
      const planned = normalizeSpeed(input.plannedSpeed);
      if (planned) {
        for (const ep of [a, z]) {
          const st = ep.interfaceState;
          if (st && st.operState === "up" && st.speed && normalizeSpeed(st.speed) !== planned) {
            return {
              state: "NEEDS_REVIEW",
              findingType: "SPEED_MISMATCH",
              severity: "WARNING",
              nextAction: `${ep.label} reports ${st.speed} (interface status), plan expects ${planned}; check optic/cable`,
              observedSummary,
            };
          }
        }
      }
      return { state: "VERIFIED_LLDP", findingType: "EXACT_MATCH", severity: "INFO", nextAction: match.nextAction, observedSummary };
    }
    case "wrong_port":
      return { state: "MISMATCH", findingType: "WRONG_PORT", severity: "ERROR", nextAction: match.nextAction, observedSummary };
    case "wrong_neighbor":
      return { state: "MISMATCH", findingType: "WRONG_NEIGHBOR", severity: "ERROR", nextAction: match.nextAction, observedSummary };
    case "conflicting":
      return { state: "NEEDS_REVIEW", findingType: "CONFLICTING_OBSERVATIONS", severity: "ERROR", nextAction: match.nextAction, observedSummary };
    case "ambiguous_identity":
      return { state: "NEEDS_REVIEW", findingType: "AMBIGUOUS_IDENTITY", severity: "WARNING", nextAction: match.nextAction, observedSummary };
    case "ambiguous_fields":
      return { state: "NEEDS_REVIEW", findingType: "AMBIGUOUS", severity: "WARNING", nextAction: match.nextAction, observedSummary };
    case "no_observation":
    default:
      break;
  }

  if (input.observability === "NOT_APPLICABLE" || input.observability === "NEITHER_ENDPOINT_OBSERVABLE") {
    return {
      state: "AWAITING",
      findingType: "UNOBSERVABLE",
      severity: "INFO",
      nextAction: `Not observable via LLDP/CDP (${input.observabilityReason ?? "no discovery"}); requires independent physical verification`,
      observedSummary: null,
    };
  }

  const observable = [a, z].filter((e) => e.observable);
  const down = observable.find((e) => e.interfaceState && e.interfaceState.operState !== "up");
  if (down) {
    return {
      state: "AWAITING",
      findingType: "LINK_DOWN",
      severity: "WARNING",
      nextAction: `${down.label} is ${down.interfaceState!.operState} (interface status); check cable seating and optics`,
      observedSummary: `${down.label}: ${down.interfaceState!.operState}`,
    };
  }
  if (observable.length && observable.every((e) => e.parseFailedOnly)) {
    return {
      state: "NEEDS_REVIEW",
      findingType: "PARSER_ERROR",
      severity: "WARNING",
      nextAction: "Latest evidence for this device failed to parse; re-import with a supported command",
      observedSummary: null,
    };
  }
  const silent = observable.filter((e) => e.hasNeighborEvidence);
  if (silent.length) {
    return {
      state: "AWAITING",
      findingType: "MISSING_NEIGHBOR",
      severity: "WARNING",
      nextAction: `${silent.map((e) => e.label).join(" and ")} reported no neighbor; check the cable is patched and LLDP is enabled`,
      observedSummary: null,
    };
  }
  return { state: "AWAITING", findingType: "NO_OBSERVATION", severity: "INFO", nextAction: match.nextAction, observedSummary: null };
}

/** Human labels for every finding type (UI + docs). */
export const FINDING_LABELS: Record<string, { label: string; explain: string }> = {
  EXACT_MATCH: { label: "Match", explain: "Observed neighbor equals the planned far end." },
  WRONG_ENDPOINT: { label: "Wrong endpoint", explain: "Observed neighbor differs from the plan." },
  WRONG_NEIGHBOR: { label: "Wrong neighbor", explain: "A different device is connected than planned." },
  WRONG_PORT: { label: "Wrong port", explain: "Right device, but a different port than planned." },
  AMBIGUOUS: { label: "Ambiguous", explain: "Neighbor entry lacks a usable remote name or port." },
  AMBIGUOUS_IDENTITY: { label: "Ambiguous identity", explain: "Remote identity is unknown or reported on several ports." },
  CONFLICTING_OBSERVATIONS: { label: "Conflicting", explain: "Several different neighbors seen on one port." },
  NO_OBSERVATION: { label: "No evidence", explain: "No neighbor evidence imported for either end yet." },
  MISSING_NEIGHBOR: { label: "Missing neighbor", explain: "Evidence exists for the device but this port reports no neighbor." },
  STALE_EVIDENCE: { label: "Stale evidence", explain: "Evidence is older than the compliance policy allows." },
  UNOBSERVABLE: { label: "Unobservable", explain: "Neither end can be observed by LLDP/CDP; needs physical verification." },
  PARSER_ERROR: { label: "Parser error", explain: "Latest evidence for the device could not be parsed." },
  LINK_DOWN: { label: "Link down", explain: "Interface status reports the port down." },
  SPEED_MISMATCH: { label: "Speed mismatch", explain: "Interface status speed differs from the planned speed." },
  PHYSICAL_MISMATCH: { label: "Physical conflict", explain: "LLDP evidence conflicts with a physical verification." },
  AWAITING: { label: "Awaiting", explain: "Not yet evaluated." },
};
