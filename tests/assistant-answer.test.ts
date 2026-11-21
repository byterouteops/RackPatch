import { describe, expect, it } from "vitest";
import {
  answerQuestion,
  classifyIntent,
  type AssistantFacts,
} from "@/lib/assistant/answer";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";
import { buildLlmMessages, numbersAreGrounded } from "@/lib/assistant/llm";

const base: AssistantFacts = {
  hasActivePlan: true,
  counts: {
    cables: 40,
    installed: 25,
    verified: 18,
    awaiting: 15,
    mismatches: 2,
    needsReview: 1,
    openExceptions: 3,
  },
  findings: [
    {
      cableId: "CBL-001",
      state: "MISMATCH",
      findingType: "WRONG_ENDPOINT",
      expected: "leaf1 Eth1 ↔ srv1 NIC1",
      observed: "leaf1 Eth1 ↔ srv2 NIC1",
      relatedCableId: "CBL-002",
      exceptionStatus: "OPEN",
      nextAction: "Swap with CBL-002",
    },
    {
      cableId: "CBL-002",
      state: "MISMATCH",
      findingType: "WRONG_ENDPOINT",
      expected: "leaf1 Eth2 ↔ srv2 NIC1",
      observed: "leaf1 Eth2 ↔ srv1 NIC1",
      relatedCableId: "CBL-001",
      exceptionStatus: "ACKNOWLEDGED",
      nextAction: null,
    },
    {
      cableId: "CBL-010",
      state: "NEEDS_REVIEW",
      findingType: "AMBIGUOUS",
      expected: "leaf2 Eth5 ↔ srv9 NIC1",
      observed: null,
      relatedCableId: null,
      exceptionStatus: "OPEN",
      nextAction: null,
    },
  ],
  cableIds: ["CBL-001", "CBL-002", "CBL-010", "CBL-100"],
  playbooks: buildSwapFixPlaybooks([
    {
      cableId: "CBL-001",
      relatedCableId: "CBL-002",
      findingType: "WRONG_ENDPOINT",
      state: "MISMATCH",
      expectedSummary: "leaf1 Eth1 ↔ srv1 NIC1",
      observedSummary: "leaf1 Eth1 ↔ srv2 NIC1",
      aRack: "R1",
      zRack: "R2",
      aDevice: "leaf1",
      aPort: "Eth1",
      zDevice: "srv1",
      zPort: "NIC1",
      plannedLinkId: "l1",
    },
    {
      cableId: "CBL-002",
      relatedCableId: "CBL-001",
      findingType: "WRONG_ENDPOINT",
      state: "MISMATCH",
      expectedSummary: "leaf1 Eth2 ↔ srv2 NIC1",
      observedSummary: "leaf1 Eth2 ↔ srv1 NIC1",
      aRack: "R1",
      zRack: "R2",
      aDevice: "leaf1",
      aPort: "Eth2",
      zDevice: "srv2",
      zPort: "NIC1",
      plannedLinkId: "l2",
    },
  ]),
  staleness: {
    maxAgeDays: 7,
    stale: [{ device: "leaf2", ageDays: 12, parseFailed: false }],
    neverImported: ["srv9"],
  },
  capacity: {
    totalLinks: 40,
    activeLinks: 38,
    retiredLinks: 2,
    byInstallStatus: { PLANNED: 13, INSTALLED: 25, BLOCKED: 2 },
    byCableType: [{ type: "Cat6", count: 30 }],
    byRack: [{ rack: "R1", links: 20, installed: 12 }],
    byDevice: [{ device: "leaf1", portsUsed: 24, installed: 10 }],
  },
};

describe("classifyIntent", () => {
  it.each([
    ["mismatches", "mismatches"],
    ["What are the mismatches?", "mismatches"],
    ["stale evidence", "stale_evidence"],
    ["which devices have old data", "stale_evidence"],
    ["how to fix swap", "swap_fix"],
    ["How do I fix a swapped cable?", "swap_fix"],
    ["capacity by rack", "capacity"],
    ["give me a progress summary", "progress"],
    ["tell me a joke", "help"],
    ["", "help"],
  ])("%s -> %s", (msg, intent) => {
    expect(classifyIntent(msg, base.cableIds).intent).toBe(intent);
  });

  it("detects a known cable id without confusing prefixes", () => {
    expect(classifyIntent("what about cbl-100?", base.cableIds)).toEqual({
      intent: "cable_detail",
      cableId: "CBL-100",
    });
    expect(classifyIntent("what about CBL-1000", base.cableIds).intent).toBe("help");
  });
});

describe("answerQuestion", () => {
  it("lists mismatches with exact counts and cable ids from facts", () => {
    const a = answerQuestion("mismatches", base);
    expect(a.intent).toBe("mismatches");
    expect(a.text).toContain("3 open exceptions: 2 mismatch, 1 needs review");
    expect(a.text).toContain("CBL-001");
    expect(a.text).toContain("[acknowledged, still visible]");
    expect(a.text).toContain("no observation recorded");
    expect(a.suggestions).toContain("How do I fix a swap?");
  });

  it("reports no open mismatches honestly", () => {
    const a = answerQuestion("mismatches", { ...base, findings: [], playbooks: [] });
    expect(a.text).toContain("No open mismatches");
    expect(a.text).toContain("15 cables still awaiting evidence");
  });

  it("reports stale and never-imported evidence", () => {
    const a = answerQuestion("stale evidence", base);
    expect(a.intent).toBe("stale_evidence");
    expect(a.text).toContain("leaf2: 12 days old");
    expect(a.text).toContain("srv9");
    expect(a.text).toContain("older than 7 days");
  });

  it("says when nothing is stale", () => {
    const a = answerQuestion("stale evidence", {
      ...base,
      staleness: { maxAgeDays: 7, stale: [], neverImported: [] },
    });
    expect(a.text).toBe("No devices have evidence older than 7 days.");
  });

  it("explains how to fix a swap using the playbook steps", () => {
    const a = answerQuestion("how to fix swap", base);
    expect(a.intent).toBe("swap_fix");
    expect(a.text).toContain("1 swap pair");
    expect(a.text).toContain("Uncable CBL-001");
    expect(a.text).toContain("Re-import neighbor evidence");
  });

  it("falls back to recorded next actions when no swap pair exists", () => {
    const a = answerQuestion("how to fix this", { ...base, playbooks: [] });
    expect(a.text).toContain("No paired swap pattern");
    expect(a.text).toContain("CBL-001: Swap with CBL-002");
  });

  it("does not invent a fix when nothing is open", () => {
    const a = answerQuestion("fix swap", { ...base, findings: [], playbooks: [] });
    expect(a.text).toContain("no open mismatches");
  });

  it("answers capacity from the summary only", () => {
    const a = answerQuestion("capacity", base);
    expect(a.text).toContain("40 links");
    expect(a.text).toContain("R1: 12/20 installed");
    expect(a.text).toContain("not a live port inventory");
  });

  it("computes progress percentages from counts", () => {
    const a = answerQuestion("progress", base);
    expect(a.text).toContain("Installed: 25 (63%)");
    expect(a.text).toContain("Verified: 18 (45%)");
  });

  it("describes a single cable and reports clean cables", () => {
    expect(answerQuestion("what is wrong with CBL-010", base).text).toContain("AMBIGUOUS");
    expect(answerQuestion("status of CBL-100", base).text).toContain("no open mismatch");
  });

  it("caps long lists", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      ...base.findings[2],
      cableId: `X-${i}`,
    }));
    const a = answerQuestion("mismatches", { ...base, findings: many });
    expect(a.text).toContain("…and 4 more");
  });

  it("returns a no-plan message without numbers", () => {
    const a = answerQuestion("mismatches", { ...base, hasActivePlan: false });
    expect(a.text).toContain("no active plan");
  });

  it("returns help for unknown questions rather than guessing", () => {
    const a = answerQuestion("what is the best switch vendor?", base);
    expect(a.intent).toBe("help");
    expect(a.text).toContain("can't answer general networking questions");
  });
});

describe("llm grounding", () => {
  it("accepts output whose numbers all come from the grounding", () => {
    expect(numbersAreGrounded("There are 3 open exceptions on 40 cables.", '{"a":3,"b":40}')).toBe(true);
  });

  it("rejects invented numbers", () => {
    expect(numbersAreGrounded("About 87 cables are at risk.", '{"a":3,"b":40}')).toBe(false);
  });

  it("allows single-digit list ordinals", () => {
    expect(numbersAreGrounded("1. Uncable\n2. Recable", "none")).toBe(true);
  });

  it("builds messages containing facts and the draft", () => {
    const draft = answerQuestion("mismatches", base);
    const { messages, grounding } = buildLlmMessages("mismatches", base, draft);
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("CBL-001");
    expect(messages[1].content).toContain(draft.text);
    expect(grounding).toContain('"openExceptions":3');
  });
});
