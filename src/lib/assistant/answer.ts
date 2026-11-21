/**
 * Deterministic, rule-based project assistant (Phase 18 CE).
 *
 * Every number and name in an answer comes from the `AssistantFacts` passed in — the
 * same data the Overview/Evidence/Capacity pages already show. Nothing is estimated,
 * predicted, or invented. Unknown questions get a help message, not a guess.
 */
import type { CapacitySummary } from "@/lib/capacity";
import type { SwapFixPlaybook } from "@/lib/verify/fix-playbook";

export type AssistantFinding = {
  cableId: string;
  state: string;
  findingType: string;
  expected: string;
  observed: string | null;
  relatedCableId: string | null;
  exceptionStatus: string;
  nextAction: string | null;
};

export type AssistantFacts = {
  hasActivePlan: boolean;
  counts: {
    cables: number;
    installed: number;
    verified: number;
    awaiting: number;
    mismatches: number;
    needsReview: number;
    openExceptions: number;
  };
  /** Open (not closed) MISMATCH / NEEDS_REVIEW findings. */
  findings: AssistantFinding[];
  /** All cable IDs in the active plan (for "cable X" lookups). */
  cableIds: string[];
  playbooks: SwapFixPlaybook[];
  staleness: {
    maxAgeDays: number;
    stale: Array<{ device: string; ageDays: number; parseFailed: boolean }>;
    neverImported: string[];
  } | null;
  capacity: CapacitySummary | null;
};

export type AssistantIntent =
  | "swap_fix"
  | "mismatches"
  | "stale_evidence"
  | "capacity"
  | "progress"
  | "cable_detail"
  | "help";

export type AssistantAnswer = {
  intent: AssistantIntent;
  text: string;
  /** Where in the app the facts come from. */
  sources: string[];
  suggestions: string[];
};

export const ASSISTANT_SUGGESTIONS = [
  "What are the mismatches?",
  "Which evidence is stale?",
  "How do I fix a swap?",
  "Show capacity by rack",
  "Give me a progress summary",
];

const LIST_LIMIT = 10;

const SWAP_FIX = /\b(swap|swapped|fix|resolve|remediat\w*|recable|re-cable|repair|playbook)\b/;
const MISMATCH = /\b(mismatch\w*|wrong|exception\w*|discrepanc\w*|problem\w*|issue\w*|error\w*|needs? review)\b/;
const STALE = /\b(stale|old|outdated|expired|fresh\w*|age|aged|never imported|not imported|evidence|lldp|cdp|neighbou?r\w*)\b/;
const CAPACITY = /\b(capacity|ports?|racks?|cable types?|media|devices?|usage|utili[sz]ation|links?)\b/;
const PROGRESS = /\b(progress|summary|overview|overall|status|how many|installed|verified|done|complete\w*|awaiting|pending)\b/;

function findCableId(message: string, cableIds: string[]): string | null {
  const lower = message.toLowerCase();
  // Longest IDs first so "CBL-10" does not shadow "CBL-100".
  const sorted = [...cableIds].sort((a, b) => b.length - a.length);
  for (const id of sorted) {
    const needle = id.toLowerCase();
    if (!needle) continue;
    const idx = lower.indexOf(needle);
    if (idx === -1) continue;
    const before = idx === 0 ? "" : lower[idx - 1];
    const after = lower[idx + needle.length] ?? "";
    const isWord = (c: string) => /[a-z0-9_-]/.test(c);
    if (!isWord(before) && !isWord(after)) return id;
  }
  return null;
}

export function classifyIntent(
  message: string,
  cableIds: string[] = [],
): { intent: AssistantIntent; cableId?: string } {
  const m = message.toLowerCase().trim();
  if (!m) return { intent: "help" };
  if (SWAP_FIX.test(m)) return { intent: "swap_fix" };
  const cableId = findCableId(message, cableIds);
  if (cableId) return { intent: "cable_detail", cableId };
  if (MISMATCH.test(m)) return { intent: "mismatches" };
  if (STALE.test(m)) return { intent: "stale_evidence" };
  if (CAPACITY.test(m)) return { intent: "capacity" };
  if (PROGRESS.test(m)) return { intent: "progress" };
  return { intent: "help" };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function capList(lines: string[]): string[] {
  if (lines.length <= LIST_LIMIT) return lines;
  return [...lines.slice(0, LIST_LIMIT), `…and ${lines.length - LIST_LIMIT} more (see the app pages).`];
}

function noPlan(intent: AssistantIntent): AssistantAnswer {
  return {
    intent,
    text: "This project has no active plan revision yet, so there are no findings, evidence, or capacity numbers to report. Import and publish a plan first.",
    sources: [],
    suggestions: [],
  };
}

function answerMismatches(f: AssistantFacts): AssistantAnswer {
  const { mismatches, needsReview, openExceptions } = f.counts;
  const sources = ["Exceptions", "Overview"];
  if (f.findings.length === 0) {
    return {
      intent: "mismatches",
      text: `No open mismatches or needs-review findings in the active plan (${plural(f.counts.awaiting, "cable")} still awaiting evidence).`,
      sources,
      suggestions: ["Which evidence is stale?"],
    };
  }
  const lines = f.findings.map((x) => {
    const observed = x.observed ? `observed ${x.observed}` : "no observation recorded";
    const ack = x.exceptionStatus === "ACKNOWLEDGED" ? " [acknowledged, still visible]" : "";
    return `- ${x.cableId} (${x.state}): expected ${x.expected}; ${observed}${ack}`;
  });
  return {
    intent: "mismatches",
    text: [
      `${plural(openExceptions, "open exception")}: ${mismatches} mismatch, ${needsReview} needs review.`,
      ...capList(lines),
    ].join("\n"),
    sources,
    suggestions: f.playbooks.length > 0 ? ["How do I fix a swap?"] : [],
  };
}

function answerSwapFix(f: AssistantFacts): AssistantAnswer {
  const sources = ["Overview swap playbook", "Exceptions"];
  if (f.playbooks.length > 0) {
    const shown = f.playbooks.slice(0, 3);
    const blocks = shown.map((p) =>
      [
        `${p.summary}`,
        ...p.steps.map((s) => `  ${s.order}. ${s.title} — ${s.detail}`),
      ].join("\n"),
    );
    const extra =
      f.playbooks.length > shown.length
        ? `\n…and ${f.playbooks.length - shown.length} more swap pair(s) on the Overview page.`
        : "";
    return {
      intent: "swap_fix",
      text: `${plural(f.playbooks.length, "swap pair")} detected from paired mismatches:\n\n${blocks.join("\n\n")}${extra}`,
      sources,
      suggestions: ["What are the mismatches?"],
    };
  }
  if (f.findings.length > 0) {
    const lines = f.findings
      .filter((x) => x.nextAction)
      .map((x) => `- ${x.cableId}: ${x.nextAction}`);
    return {
      intent: "swap_fix",
      text: [
        "No paired swap pattern was detected, so there is no ordered swap playbook. Open findings and their recorded next actions:",
        ...(lines.length > 0
          ? capList(lines)
          : ["- (no next action recorded; see the Exceptions page)"]),
        "General order: confirm the cable ID and both ends at the rack, correct the physical cabling to match the plan, then re-import fresh neighbor evidence so the finding clears.",
      ].join("\n"),
      sources,
      suggestions: ["What are the mismatches?"],
    };
  }
  return {
    intent: "swap_fix",
    text: "There are no open mismatches, so nothing needs a swap fix right now. If a swap appears later, the fix order is: uncable both cables, recable each to the plan, then re-import neighbor evidence.",
    sources,
    suggestions: [],
  };
}

function answerStale(f: AssistantFacts): AssistantAnswer {
  const sources = ["Evidence", "Compliance"];
  const s = f.staleness;
  if (!s) {
    return {
      intent: "stale_evidence",
      text: "No evidence staleness data is available for this project.",
      sources,
      suggestions: [],
    };
  }
  const parts: string[] = [];
  if (s.stale.length === 0) {
    parts.push(`No devices have evidence older than ${plural(s.maxAgeDays, "day")}.`);
  } else {
    parts.push(
      `${plural(s.stale.length, "device")} with stale evidence (older than ${plural(s.maxAgeDays, "day")} or failed parse):`,
      ...capList(
        s.stale.map(
          (d) =>
            `- ${d.device}: ${plural(d.ageDays, "day")} old${d.parseFailed ? " (last import failed to parse)" : ""}`,
        ),
      ),
    );
  }
  if (s.neverImported.length > 0) {
    parts.push(
      `${plural(s.neverImported.length, "planned device")} with no evidence imported: ${s.neverImported.slice(0, LIST_LIMIT).join(", ")}${s.neverImported.length > LIST_LIMIT ? ", …" : ""}.`,
    );
  }
  if (s.stale.length > 0 || s.neverImported.length > 0) {
    parts.push("To refresh: re-import neighbor output (or run a collection) for those devices.");
  }
  return { intent: "stale_evidence", text: parts.join("\n"), sources, suggestions: [] };
}

function answerCapacity(f: AssistantFacts): AssistantAnswer {
  const c = f.capacity;
  const sources = ["Capacity"];
  if (!c) return noPlan("capacity");
  const lines = [
    `${plural(c.totalLinks, "link")} in the plan (${c.activeLinks} active, ${c.retiredLinks} retired).`,
    `Install status: ${Object.entries(c.byInstallStatus)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}.`,
  ];
  if (c.byCableType.length > 0) {
    lines.push(`Cable types: ${c.byCableType.map((t) => `${t.type} ${t.count}`).join(", ")}.`);
  }
  if (c.byRack.length > 0) {
    lines.push("By rack:", ...capList(c.byRack.map((r) => `- ${r.rack}: ${r.installed}/${r.links} installed`)));
  }
  if (c.byDevice.length > 0) {
    lines.push(
      "Busiest devices (planned endpoints):",
      ...c.byDevice.slice(0, 5).map((d) => `- ${d.device}: ${d.portsUsed}`),
    );
  }
  lines.push("These are plan-link counts, not a live port inventory.");
  return { intent: "capacity", text: lines.join("\n"), sources, suggestions: [] };
}

function answerProgress(f: AssistantFacts): AssistantAnswer {
  const c = f.counts;
  const pct = (n: number) => (c.cables === 0 ? "0%" : `${Math.round((n / c.cables) * 100)}%`);
  return {
    intent: "progress",
    text: [
      `${plural(c.cables, "cable")} in the active plan.`,
      `- Installed: ${c.installed} (${pct(c.installed)})`,
      `- Verified: ${c.verified} (${pct(c.verified)})`,
      `- Awaiting evidence: ${c.awaiting}`,
      `- Open exceptions: ${c.openExceptions} (${c.mismatches} mismatch, ${c.needsReview} needs review)`,
    ].join("\n"),
    sources: ["Overview"],
    suggestions: c.openExceptions > 0 ? ["What are the mismatches?"] : [],
  };
}

function answerCable(f: AssistantFacts, cableId: string): AssistantAnswer {
  const finding = f.findings.find((x) => x.cableId === cableId);
  const sources = ["Cables", "Exceptions"];
  if (!finding) {
    return {
      intent: "cable_detail",
      text: `${cableId} is in the active plan and has no open mismatch or needs-review finding. It may be verified, or still awaiting evidence.`,
      sources,
      suggestions: [],
    };
  }
  const lines = [
    `${cableId}: ${finding.state} (${finding.findingType}), exception ${finding.exceptionStatus}.`,
    `- Expected: ${finding.expected}`,
    `- Observed: ${finding.observed ?? "no observation recorded"}`,
  ];
  if (finding.relatedCableId) lines.push(`- Related cable: ${finding.relatedCableId}`);
  if (finding.nextAction) lines.push(`- Next action: ${finding.nextAction}`);
  return { intent: "cable_detail", text: lines.join("\n"), sources, suggestions: [] };
}

function answerHelp(): AssistantAnswer {
  return {
    intent: "help",
    text: [
      "I answer from this project's recorded data only, using fixed rules. I can help with:",
      "- Mismatches and open exceptions",
      "- Stale or missing neighbor evidence",
      "- How to fix a swap (from the swap playbook)",
      "- Capacity by rack, device, and cable type",
      "- Overall install / verification progress",
      "- A specific cable, e.g. “what is wrong with CBL-001?”",
      "I can't answer general networking questions or predict outcomes.",
    ].join("\n"),
    sources: [],
    suggestions: ASSISTANT_SUGGESTIONS,
  };
}

/** Pure, deterministic answer from retrieved project facts. */
export function answerQuestion(message: string, facts: AssistantFacts): AssistantAnswer {
  const { intent, cableId } = classifyIntent(message, facts.cableIds);
  if (intent === "help") return answerHelp();
  if (!facts.hasActivePlan) return noPlan(intent);
  switch (intent) {
    case "swap_fix":
      return answerSwapFix(facts);
    case "mismatches":
      return answerMismatches(facts);
    case "stale_evidence":
      return answerStale(facts);
    case "capacity":
      return answerCapacity(facts);
    case "progress":
      return answerProgress(facts);
    case "cable_detail":
      return answerCable(facts, cableId!);
    default:
      return answerHelp();
  }
}
