"use server";

import { z } from "zod";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { consumeRateLimit } from "@/lib/rate-limit";
import { answerQuestion } from "@/lib/assistant/answer";
import { enhanceWithLlm, isLlmEnabled } from "@/lib/assistant/llm";
import { loadAssistantFacts } from "@/lib/assistant/facts";

const askSchema = z.object({
  projectId: z.string(),
  message: z.string().trim().min(1).max(500),
});

export type AskAssistantResult = {
  intent: string;
  text: string;
  sources: string[];
  suggestions: string[];
  /** True only when an LLM reworded the answer (and passed the grounding check). */
  llmEnhanced: boolean;
};

/**
 * Grounded project assistant. Always computes the deterministic answer from project facts;
 * if OPENAI_API_KEY is set the answer may be reworded, but only from those same facts.
 * Read-only; requires project view access.
 */
export async function askAssistant(raw: z.infer<typeof askSchema>): Promise<AskAssistantResult> {
  const user = await requireSessionUser();
  const data = askSchema.parse(raw);
  const access = await requireProjectAccess(user, data.projectId);

  const limit = await consumeRateLimit(`assistant:${user.id}`, 30, 60_000);
  if (!limit.allowed) {
    throw new Error(`Too many questions. Try again in ${limit.retryAfterSec}s.`);
  }

  const facts = await loadAssistantFacts(data.projectId, access.project.activeRevisionId);
  const draft = answerQuestion(data.message, facts);

  let text = draft.text;
  let llmEnhanced = false;
  // Help/no-plan answers carry no project facts, so there is nothing to enhance.
  if (isLlmEnabled() && draft.intent !== "help" && facts.hasActivePlan) {
    const enhanced = await enhanceWithLlm(data.message, facts, draft);
    if (enhanced) {
      text = enhanced;
      llmEnhanced = true;
    }
  }

  return {
    intent: draft.intent,
    text,
    sources: draft.sources,
    suggestions: draft.suggestions,
    llmEnhanced,
  };
}
