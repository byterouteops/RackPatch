import { isIP } from "net";

/**
 * Outbound URL guard for integrations (NetBox, webhooks).
 *
 * - https only, no embedded credentials
 * - blocks loopback / link-local / cloud-metadata / reserved ranges always
 * - blocks RFC1918 + CGNAT private ranges unless allowPrivate is set (self-host opt-in)
 *
 * Hostname checks are static; connection-time IP checks live in safe-fetch (DNS pinning).
 */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export type UrlCheckOptions = {
  /** Allow RFC1918 / CGNAT private ranges (loopback, link-local, metadata stay blocked). */
  allowPrivate?: boolean;
};

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".cluster.local", ".svc"];

export function allowPrivateIntegrationNetworks(): boolean {
  const v = process.env.INTEGRATION_ALLOW_PRIVATE_NETWORKS;
  return v === "true" || v === "1" || v === "yes";
}

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** Parse an IPv6 literal into 16 bytes (handles :: compression and embedded IPv4). */
function parseIPv6(input: string): number[] | null {
  let ip = input;
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  let tail: number[] = [];
  const lastColon = ip.lastIndexOf(":");
  if (ip.includes(".")) {
    const v4 = parseIPv4(ip.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    ip = ip.slice(0, lastColon + 1) + "0:0";
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = halves.length === 2 ? [...head, ...Array(missing).fill("0"), ...rest] : head;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length === 4) {
    bytes[12] = tail[0];
    bytes[13] = tail[1];
    bytes[14] = tail[2];
    bytes[15] = tail[3];
  }
  return bytes.length === 16 ? bytes : null;
}

function isBlockedIPv4(b: number[], allowPrivate: boolean): boolean {
  const [a, c] = b;
  if (a === 0) return true; // "this" network
  if (a === 127) return true; // loopback
  if (a === 169 && c === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a >= 224) return true; // multicast + reserved + broadcast
  if (a === 192 && c === 0 && b[2] === 0) return true; // IETF protocol assignments
  if (a === 192 && c === 0 && b[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (c === 18 || c === 19)) return true; // benchmarking
  if (a === 198 && c === 51 && b[2] === 100) return true; // TEST-NET-2
  if (a === 203 && c === 0 && b[2] === 113) return true; // TEST-NET-3
  if (a === 100 && c >= 64 && c <= 127) return !allowPrivate; // CGNAT (Alibaba metadata 100.100.100.200)
  if (a === 10) return !allowPrivate;
  if (a === 172 && c >= 16 && c <= 31) return !allowPrivate;
  if (a === 192 && c === 168) return !allowPrivate;
  return false;
}

/** True when the IP literal must not be contacted. Unknown/unparseable input is blocked. */
export function isBlockedIp(ip: string, opts: UrlCheckOptions = {}): boolean {
  const allowPrivate = opts.allowPrivate ?? false;
  const family = isIP(ip);
  if (family === 4) {
    const b = parseIPv4(ip);
    return !b || isBlockedIPv4(b, allowPrivate);
  }
  if (family === 6) {
    const b = parseIPv6(ip);
    if (!b) return true;
    const allZero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
    if (allZero(0, 16)) return true; // ::
    if (allZero(0, 15) && b[15] === 1) return true; // ::1
    // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
    if (allZero(0, 10) && b[10] === 0xff && b[11] === 0xff) return isBlockedIPv4(b.slice(12), allowPrivate);
    if (allZero(0, 12)) return isBlockedIPv4(b.slice(12), allowPrivate);
    // NAT64 64:ff9b::/96 -> embedded IPv4
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && allZero(4, 12)) {
      return isBlockedIPv4(b.slice(12), allowPrivate);
    }
    if (b[0] === 0x20 && b[1] === 0x02) return isBlockedIPv4(b.slice(2, 6), allowPrivate); // 6to4
    if ((b[0] & 0xfe) === 0xfc) return !allowPrivate; // fc00::/7 unique local (AWS fd00:ec2::254)
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10 site-local (deprecated)
    if (b[0] === 0xff) return true; // multicast
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // documentation
    return false;
  }
  return true;
}

/** Validate a user-supplied https URL for outbound server-side requests. */
export function checkOutboundUrl(raw: string, opts: UrlCheckOptions = {}): UrlCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "URL is required" };
  if (trimmed.length > 2048) return { ok: false, reason: "URL is too long" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only https:// URLs are allowed" };
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with embedded credentials are not allowed" };
  }
  if (url.hash) return { ok: false, reason: "URL fragments are not allowed" };

  // WHATWG URL already canonicalises decimal/hex/octal IPv4 forms to dotted decimal.
  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  host = host.replace(/\.$/, "");
  if (!host) return { ok: false, reason: "URL has no host" };

  if (isIP(host)) {
    if (isBlockedIp(host, opts)) {
      return { ok: false, reason: "Host resolves to a blocked address range" };
    }
    return { ok: true, url };
  }

  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Internal hostnames are not allowed" };
  }
  if (!host.includes(".")) {
    return { ok: false, reason: "Single-label hostnames are not allowed" };
  }
  if (!/^[a-z0-9.-]+$/.test(host) && !host.startsWith("xn--")) {
    // Punycode is produced by URL for IDNs; anything else odd is rejected.
    return { ok: false, reason: "Hostname contains unsupported characters" };
  }
  return { ok: true, url };
}

/** Throwing variant for server actions. */
export function assertOutboundUrl(raw: string, opts?: UrlCheckOptions): URL {
  const res = checkOutboundUrl(raw, opts ?? { allowPrivate: allowPrivateIntegrationNetworks() });
  if (!res.ok) throw new Error(res.reason);
  return res.url;
}
