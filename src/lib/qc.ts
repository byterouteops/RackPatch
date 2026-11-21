/** QC queue helpers (Phase 14 CE contractor slice). Pure and unit-tested. */

export const QC_NOTE_PREFIX = "[QC] ";

export type QcFindingLike = {
  state: string;
  exceptionStatus: string;
};

/** Only open MISMATCH / NEEDS_REVIEW findings can be QC-acknowledged. */
export function isQcAcknowledgeable(f: QcFindingLike): boolean {
  return (
    (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW") && f.exceptionStatus === "OPEN"
  );
}

export function formatQcNote(note: string, who?: string): string {
  const clean = note.trim().replace(/\s+/g, " ");
  const prefix = who ? `${QC_NOTE_PREFIX}${who}: ` : QC_NOTE_PREFIX;
  return `${prefix}${clean}`.slice(0, 500);
}
