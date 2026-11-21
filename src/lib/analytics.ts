import { prisma } from "@/lib/db";

/**
 * First-party product analytics (no third-party trackers).
 *
 * Privacy rules enforced here (unit-tested without a DB):
 * - event names are dotted lowercase identifiers
 * - props are a flat object of finite numbers, booleans, and short id-like strings only
 * - keys that look like PII/secrets and strings that look like emails/URLs/free text are dropped
 * - `trackEvent` never throws: analytics must never block a user flow
 */

const NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
/** Id-like strings only (cuid, uuid, short slugs). Rejects spaces, '@', '/', ':' etc. */
const ID_VALUE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BLOCKED_KEY_RE =
  /(email|name|phone|address|password|passwd|secret|token|key|cookie|auth|ip|note|text|message|body|url|host|serial|payload|data)/i;

export const MAX_EVENT_NAME_LENGTH = 64;
export const MAX_PROPS_KEYS = 10;
export const MAX_PROPS_JSON_LENGTH = 1000;

export type EventPropValue = number | boolean | string;
export type EventProps = Record<string, EventPropValue>;

export function sanitizeEventName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EVENT_NAME_LENGTH) return null;
  return NAME_RE.test(trimmed) ? trimmed : null;
}

export function sanitizeProps(props: unknown): EventProps | null {
  if (!props || typeof props !== "object" || Array.isArray(props)) return null;
  const out: EventProps = {};
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PROPS_KEYS) break;
    if (!KEY_RE.test(key) || BLOCKED_KEY_RE.test(key)) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "string") {
      if (ID_VALUE_RE.test(value)) out[key] = value;
    }
  }
  if (Object.keys(out).length === 0) return null;
  if (JSON.stringify(out).length > MAX_PROPS_JSON_LENGTH) return null;
  return out;
}

export type TrackEventInput = {
  name: string;
  projectId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  props?: Record<string, unknown>;
};

/** Pure: build the DB row (or null when the event name is invalid). */
export function buildProductEventData(input: TrackEventInput) {
  const name = sanitizeEventName(input.name);
  if (!name) return null;
  const props = sanitizeProps(input.props);
  return {
    name,
    projectId: input.projectId ?? null,
    workspaceId: input.workspaceId ?? null,
    actorId: input.actorId ?? null,
    propsJson: props ? JSON.stringify(props) : null,
  };
}

/**
 * Record a first-party product event. Never throws; resolves true when written.
 * Callers should `await` it (cheap single insert) so serverless runtimes don't drop the write.
 */
export async function trackEvent(input: TrackEventInput): Promise<boolean> {
  try {
    const data = buildProductEventData(input);
    if (!data) return false;
    await prisma.productEvent.create({ data });
    return true;
  } catch {
    return false;
  }
}

export const ANALYTICS_WINDOWS_DAYS = [7, 30] as const;

export type EventCount = { name: string; count: number };

/** Event counts by name since `now - days` for one project (real rows only). */
export async function countProjectEventsByName(
  projectId: string,
  days: number,
  now: Date = new Date(),
): Promise<EventCount[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.productEvent.groupBy({
    by: ["name"],
    where: { projectId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ name: r.name, count: r._count._all }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
