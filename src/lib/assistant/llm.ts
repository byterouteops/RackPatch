/**
 * Optional LLM rewording layer (Phase 18 CE). Off unless OPENAI_API_KEY is set.
 *
 * The model never answers from its own knowledge: it receives retrieved project facts plus
 * the deterministic answer and may only rephrase/organise them. Output is rejected (and the
 * deterministic answer is used) if it contains numbers that are not present in the grounding.
 */
import type { AssistantAnswer, AssistantFacts } from "@/lib/assistant/answer";

export function isLlmEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Compact fact payload — names, IDs and counts only; no raw evidence text or secrets. */
export function buildGroundingFacts(facts: AssistantFacts) {
  return {
    counts: facts.counts,
    openFindings: facts.findings.slice(0, 30).map((f) => ({
      cableId: f.cableId,
      state: f.state,
      expected: f.expected,
      observed: f.observed,
      relatedCableId: f.relatedCableId,
      nextAction: f.nextAction,
    })),
    swapPlaybooks: facts.playbooks.slice(0, 5).map((p) => ({
      summary: p.summary,
      steps: p.steps.map((s) => `${s.order}. ${s.title} — ${s.detail}`),
    })),
    staleness: facts.staleness
      ? {
          maxAgeDays: facts.staleness.maxAgeDays,
          stale: facts.staleness.stale.slice(0, 30),
          neverImported: facts.staleness.neverImported.slice(0, 30),
        }
      : null,
    capacity: facts.capacity
      ? {
          totalLinks: facts.capacity.totalLinks,
          activeLinks: facts.capacity.activeLinks,
          retiredLinks: facts.capacity.retiredLinks,
          byInstallStatus: facts.capacity.byInstallStatus,
          byCableType: facts.capacity.byCableType,
          byRack: facts.capacity.byRack,
          topDevices: facts.capacity.byDevice.slice(0, 10),
        }
      : null,
  };
}

export const ASSISTANT_SYSTEM_PROMPT = [
  "You are the RackPatch project assistant for data-center cabling.",
  "Answer ONLY from the PROJECT FACTS and DRAFT ANSWER provided. They are the sole source of truth.",
  "Never invent cable IDs, device names, counts, dates, percentages, or recommendations that are not in them.",
  "If the facts do not contain the answer, say so plainly. Do not give general networking advice or predictions.",
  "Keep the answer concise. You may reorganise or reword the draft; do not change any number or identifier.",
].join(" ");

export function buildLlmMessages(question: string, facts: AssistantFacts, draft: AssistantAnswer) {
  const grounding = JSON.stringify(buildGroundingFacts(facts));
  return {
    grounding,
    messages: [
      { role: "system" as const, content: ASSISTANT_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `QUESTION:\n${question}\n\nPROJECT FACTS (JSON):\n${grounding}\n\nDRAFT ANSWER (rule-based, grounded):\n${draft.text}`,
      },
    ],
  };
}

function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

/**
 * True when every number in `output` also appears in `grounding`.
 * Small ordinals used in numbered lists (1–9) are always allowed.
 */
export function numbersAreGrounded(output: string, grounding: string): boolean {
  const known = new Set(extractNumbers(grounding));
  return extractNumbers(output).every((n) => known.has(n) || (/^[1-9]$/.test(n)));
}

/**
 * Ask OpenAI to rephrase the grounded draft. Returns null on any failure or if the output
 * is not grounded; callers must then use the deterministic answer.
 */
export async function enhanceWithLlm(
  question: string,
  facts: AssistantFacts,
  draft: AssistantAnswer,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const { grounding, messages } = buildLlmMessages(question, facts, draft);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 600, messages }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    if (!numbersAreGrounded(text, `${grounding}\n${draft.text}\n${question}`)) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
