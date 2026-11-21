/**
 * Parse a RackPatch cable QR payload into a same-project cable deep-link.
 * Rejects cross-project URLs and non-RackPatch strings.
 */

export type ParsedCableQr =
  | { ok: true; projectId: string; linkId: string; path: string; action: string | null }
  | { ok: false; error: string };

const CABLE_PATH =
  /^\/app\/projects\/([^/]+)\/cables\/([^/?#]+)(?:\?(.*))?$/i;

/**
 * @param raw - Full URL or path from a scanned QR
 * @param expectedProjectId - Active project; scan must target this project
 */
export function parseCableQr(raw: string, expectedProjectId: string): ParsedCableQr {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Empty QR content" };
  }

  let pathWithQuery: string;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      pathWithQuery = `${u.pathname}${u.search}`;
    } else if (trimmed.startsWith("/")) {
      pathWithQuery = trimmed;
    } else {
      return { ok: false, error: "QR is not a RackPatch cable link" };
    }
  } catch {
    return { ok: false, error: "Invalid QR URL" };
  }

  const match = pathWithQuery.match(CABLE_PATH);
  if (!match) {
    return { ok: false, error: "QR is not a cable label for this app" };
  }

  const projectId = match[1];
  const linkId = match[2];
  const query = match[3] ?? "";

  if (projectId !== expectedProjectId) {
    return { ok: false, error: "QR belongs to a different project" };
  }

  const params = new URLSearchParams(query);
  const action = params.get("action");

  const path = action
    ? `/app/projects/${projectId}/cables/${linkId}?action=${encodeURIComponent(action)}`
    : `/app/projects/${projectId}/cables/${linkId}`;

  return { ok: true, projectId, linkId, path, action };
}
