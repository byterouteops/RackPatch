# Phase 18 Implementation Report

**Updated:** 2026-11-21  
**Status:** PARTIALLY IMPLEMENTED — grounded, rule-based assistant with optional LLM rewording (CE slice)

## What shipped

- Page `/app/projects/[projectId]/assistant` (subnav "Assist") with a chat UI (`src/components/assistant-chat.tsx`). History is **client-side only**; no `AssistantThread` model, no migration.
- `src/lib/assistant/answer.ts` — pure, deterministic `answerQuestion()` with keyword intents: mismatches/exceptions, stale evidence, how-to-fix swap (uses the existing swap playbook), capacity, progress, single-cable lookup, and a help fallback. Every number and name comes from the retrieved facts.
- `src/lib/assistant/facts.ts` — read-only retrieval of findings, playbooks, evidence staleness (7-day) and capacity for the active revision.
- Server action `askAssistant({ projectId, message })` in `src/app/actions/assistant.ts` — requires project view access, message ≤ 500 chars, 30 questions/min/user rate limit.
- `src/lib/assistant/llm.ts` — optional OpenAI rewording, enabled only when `OPENAI_API_KEY` is set (`OPENAI_MODEL` optional, default `gpt-4o-mini`).

## Grounding behaviour

- The deterministic answer is always computed first. Without a key, answers are rule-based only and nothing leaves the server.
- With a key, the model receives the question, a compact JSON of project facts, and the draft answer, with instructions to use nothing else (temperature 0).
- Guard: if the model output contains any number not present in the facts/draft/question (single-digit list ordinals excepted), or the call fails/times out (15s), the deterministic answer is returned instead. The UI labels each answer "Rule-based" or "LLM-reworded, grounded".
- This guard checks numbers only. It cannot prove that wording or inferences are faithful, so LLM output is best-effort grounded, not verified.
- Privacy: with a key set, cable IDs, device names, expected/observed summaries and counts are sent to OpenAI. Raw evidence text and secrets are not included.

## Honest limits

- Keyword rules, not language understanding: unusual phrasing falls back to the help message. Swap/fix wording takes priority over mismatch wording.
- No conversation memory (each question is independent), no persisted threads, no streaming, no actions taken on the user's behalf.
- Cannot answer general networking questions or predict outcomes by design.
- Facts reuse the overview's definitions (e.g. open exceptions); retired links are not filtered out of findings.

## Verification

- `tests/assistant-answer.test.ts`: intent classification (mismatches, stale evidence, how to fix swap, capacity, progress, cable IDs, help), content assertions against fixture facts, list capping, no-plan and nothing-to-fix cases, and LLM grounding checks. The OpenAI HTTP call itself is not tested.
- `tsc --noEmit` and `next build` pass.

See `PHASE_18_ARCHITECTURE_PLAN.md` for the original scope.
