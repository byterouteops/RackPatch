import { safeHttpsRequest } from "@/lib/net/safe-fetch";
import { normalizeNetBoxBaseUrl } from "@/lib/netbox-client";

/** Parse NetBox numeric id from RackPatch cableId `NB-{id}`. */
export function parseNetBoxCableId(cableId: string): number | null {
  const m = /^NB-(\d+)$/i.exec(cableId.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * PATCH a NetBox cable label (and optional description).
 * Requires write-enabled integration + explicit caller confirm.
 */
export async function patchNetBoxCableLabel(input: {
  baseUrl: string;
  token: string;
  netboxCableId: number;
  label: string;
  description?: string;
}): Promise<{ ok: true; status: number } | { ok: false; status: number; error: string }> {
  const base = normalizeNetBoxBaseUrl(input.baseUrl);
  const url = `${base}/api/dcim/cables/${input.netboxCableId}/`;
  const body = JSON.stringify({
    label: input.label.slice(0, 100),
    ...(input.description !== undefined
      ? { description: input.description.slice(0, 200) }
      : {}),
  });

  const res = await safeHttpsRequest({
    url,
    method: "PATCH",
    headers: {
      Authorization: `Token ${input.token}`,
      "Content-Type": "application/json",
    },
    body,
    timeoutMs: 15_000,
  });

  if (res.status >= 200 && res.status < 300) {
    return { ok: true, status: res.status };
  }
  return {
    ok: false,
    status: res.status,
    error: `NetBox write failed HTTP ${res.status}: ${res.body.slice(0, 200)}`,
  };
}
