/**
 * Normalize free-text cable/media types (Phase 16 CE taxonomy).
 * Does not invent fiber panel/circuit topology.
 */

export const CABLE_TYPE_TAXONOMY = [
  "Cat5e",
  "Cat6",
  "Cat6a",
  "DAC",
  "AOC",
  "SMF",
  "MMF",
  "MPO",
  "Other",
] as const;

export type CableTypeCode = (typeof CABLE_TYPE_TAXONOMY)[number];

const ALIASES: Record<string, CableTypeCode> = {
  cat5e: "Cat5e",
  "cat-5e": "Cat5e",
  cat6: "Cat6",
  "cat-6": "Cat6",
  cat6a: "Cat6a",
  "cat-6a": "Cat6a",
  dac: "DAC",
  twinax: "DAC",
  aoc: "AOC",
  smf: "SMF",
  "single-mode": "SMF",
  singlemode: "SMF",
  os2: "SMF",
  mmf: "MMF",
  "multi-mode": "MMF",
  multimode: "MMF",
  om3: "MMF",
  om4: "MMF",
  mpo: "MPO",
  mtp: "MPO",
};

export function normalizeCableType(raw: string | null | undefined): CableTypeCode | null {
  if (!raw?.trim()) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (ALIASES[key]) return ALIASES[key];
  const exact = CABLE_TYPE_TAXONOMY.find((t) => t.toLowerCase() === raw.trim().toLowerCase());
  if (exact) return exact;
  for (const token of key.split(/[^a-z0-9]+/)) {
    if (ALIASES[token]) return ALIASES[token];
  }
  return "Other";
}

export function cableTypeLabel(raw: string | null | undefined): string {
  return normalizeCableType(raw) ?? "—";
}
