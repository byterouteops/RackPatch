import type { InstallStatus, VerificationState } from "@prisma/client";

/** The fields the cable list needs for rendering, filtering and topology. Long text is loaded per cable. */
export type CableListRow = {
  id: string;
  cableId: string;
  aRack: string;
  aDevice: string;
  aPort: string;
  zRack: string;
  zDevice: string;
  zPort: string;
  cableType: string | null;
  fabric: string | null;
  speed: string | null;
  installStatus: InstallStatus;
  verificationState: VerificationState;
  retired: boolean;
  lengthMeters: number | null;
};

/** Rows rendered on the server before the full list streams in; must equal the client's default page size. */
export const FIRST_PAGE = 25;

/**
 * Compact wire format: every string is an index into `s` (or null), so repeated racks, devices,
 * ports and states are sent once. Large projects otherwise serialise megabytes into the page.
 */
export type EncodedCableList = {
  s: string[];
  r: Array<Array<number | null>>;
};

const STRING_FIELDS = [
  "id",
  "cableId",
  "aRack",
  "aDevice",
  "aPort",
  "zRack",
  "zDevice",
  "zPort",
  "cableType",
  "fabric",
  "speed",
  "installStatus",
  "verificationState",
] as const;

export function encodeCableList(rows: CableListRow[]): EncodedCableList {
  const s: string[] = [];
  const index = new Map<string, number>();
  const ref = (v: string | null) => {
    if (v == null) return null;
    let i = index.get(v);
    if (i === undefined) {
      i = s.length;
      s.push(v);
      index.set(v, i);
    }
    return i;
  };
  const r = rows.map((row) => [
    ...STRING_FIELDS.map((f) => ref(row[f])),
    row.retired ? 1 : 0,
    row.lengthMeters,
  ]);
  return { s, r };
}

export function decodeCableList({ s, r }: EncodedCableList): CableListRow[] {
  const str = (i: number | null) => (i == null ? null : s[i]);
  return r.map((t) => {
    const row = {} as Record<string, unknown>;
    STRING_FIELDS.forEach((f, i) => {
      row[f] = str(t[i]);
    });
    row.retired = t[STRING_FIELDS.length] === 1;
    row.lengthMeters = t[STRING_FIELDS.length + 1];
    return row as CableListRow;
  });
}
