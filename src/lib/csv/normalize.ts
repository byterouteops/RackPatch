/**
 * Interface / device normalization for matching keys.
 * Display labels are preserved separately; these helpers produce match keys only.
 *
 * Rules:
 * - Trim whitespace
 * - Case-insensitive comparison via lowercase keys
 * - Documented EthN aliases map to EthernetN for matching
 * - Ethernet17, Ethernet1/17, and Ethernet1/17/1 remain distinct
 * - Never merge devices based on short hostname similarity
 */

export function trimField(value: string | null | undefined): string {
  return (value ?? "").replace(/^\uFEFF/, "").trim();
}

/** Normalize a device name for matching (trim + lowercase). Does not alias hostnames. */
export function normalizeDevice(value: string): string {
  return trimField(value).toLowerCase();
}

/**
 * Normalize an interface / port label for matching.
 * Eth1/17 and Ethernet1/17 become the same key.
 * Ethernet17 vs Ethernet1/17 stay distinct.
 */
export function normalizePort(value: string): string {
  let s = trimField(value).toLowerCase();

  // Collapse internal whitespace
  s = s.replace(/\s+/g, " ");

  // Eth1/17, eth 1/17, Eth1 -> ethernet1/17, ethernet1
  s = s.replace(/^eth(?:ernet)?[\s_-]*/i, "ethernet");

  // Gi/GigabitEthernet aliases commonly seen in mixed plans
  s = s.replace(/^gi(?:gabitethernet)?[\s_-]*/i, "gigabitethernet");
  s = s.replace(/^te(?:ngigabitethernet)?[\s_-]*/i, "tengigabitethernet");

  // Remove spaces around separators for stable keys
  s = s.replace(/\s*([\/\-])\s*/g, "$1");

  return s;
}

export function endpointKey(
  aDeviceNorm: string,
  aPortNorm: string,
  zDeviceNorm: string,
  zPortNorm: string,
): string {
  const left = `${aDeviceNorm}|${aPortNorm}`;
  const right = `${zDeviceNorm}|${zPortNorm}`;
  return [left, right].sort().join("::");
}

export function formatEndpoint(device: string, port: string, rack?: string): string {
  const base = `${device} ${port}`;
  return rack ? `${rack} / ${base}` : base;
}
