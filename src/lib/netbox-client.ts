import { safeHttpsRequest } from "@/lib/net/safe-fetch";
import { assertOutboundUrl } from "@/lib/net/ssrf";
import { parseNetBoxCables, parseNetBoxDevices, type NetBoxData } from "@/lib/netbox";

const PAGE_LIMIT = 200;
const MAX_PAGES = 25;
const TIMEOUT_MS = 10_000;

/** Normalize a saved NetBox base URL (origin + optional path prefix, no query/hash, no trailing slash). */
export function normalizeNetBoxBaseUrl(raw: string): string {
  const url = assertOutboundUrl(raw);
  if (url.search) throw new Error("NetBox base URL must not include a query string");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

async function fetchAll(baseUrl: string, token: string, path: string): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    // Build URLs ourselves; never follow server-provided `next` links (SSRF pivot).
    const url = `${baseUrl}${path}?limit=${PAGE_LIMIT}&offset=${page * PAGE_LIMIT}`;
    const res = await safeHttpsRequest({
      url,
      method: "GET",
      headers: { Authorization: `Token ${token}` },
      timeoutMs: TIMEOUT_MS,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`NetBox rejected the token (HTTP ${res.status})`);
    }
    if (res.status !== 200) throw new Error(`NetBox returned HTTP ${res.status} for ${path}`);
    let json: unknown;
    try {
      json = JSON.parse(res.body);
    } catch {
      throw new Error(`NetBox returned non-JSON for ${path}`);
    }
    const results = (json as { results?: unknown[]; next?: unknown }).results;
    if (!Array.isArray(results)) throw new Error(`Unexpected NetBox response for ${path}`);
    all.push(...results);
    if (!(json as { next?: unknown }).next || results.length === 0) break;
  }
  return all;
}

/** Read-only GETs against NetBox REST. No write calls exist in CE. */
export async function fetchNetBoxData(baseUrl: string, token: string): Promise<NetBoxData> {
  const base = normalizeNetBoxBaseUrl(baseUrl);
  const devices = await fetchAll(base, token, "/api/dcim/devices/");
  const cables = await fetchAll(base, token, "/api/dcim/cables/");
  return { devices: parseNetBoxDevices(devices), cables: parseNetBoxCables(cables) };
}
