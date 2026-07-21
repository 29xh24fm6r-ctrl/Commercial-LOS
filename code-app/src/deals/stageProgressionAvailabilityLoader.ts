/**
 * WF-1A Item 1 — data-driven stage-progression availability.
 *
 * The DealStageProgressionCard previously called the no-arg
 * `stageProgressionAvailability()` → hard ROWS_NOT_LOADED → always unavailable,
 * so the Advance control never appeared even after seeding. This loads the
 * seeded stage-reference rows, runs the deterministic ordering resolver, and
 * derives availability from the real result.
 *
 * Fail-closed: any read failure — including the not-yet-provisioned
 * `cr664_sequence` column (Dataverse 0x80060888) before the maker seeds it and
 * regenerates the SDK — resolves to the honest "not seeded" unavailable state,
 * never a crash. Once the seven rows carry a unique cr664_sequence and the SDK
 * exposes the field, availability flips to available automatically.
 *
 * Pure over an injected row reader (SDK-free static graph) + a live default.
 */

import {
  resolveStageOrdering,
  type StageOrderingResult,
  type StageReferenceRow,
} from '../workflow/stageOrderingContract';
import {
  deriveStageProgressionAvailability,
  stageProgressionAvailability,
  type StageProgressionAvailability,
} from '../shared/governance/stageProgressionAvailability';

/** Columns needed to resolve the canonical ordering. */
export const STAGE_ORDERING_SELECT: readonly string[] = [
  'cr664_dealstagereferenceid',
  'cr664_code',
  'cr664_name',
  'cr664_activeflag',
  'cr664_sequence',
];

/** Reads stage-reference rows for ordering. Throws on a non-success read. */
export type StageReferenceRowReader = () => Promise<readonly StageReferenceRow[]>;

/**
 * Derive availability from injected rows. Pure. Any thrown read (missing
 * column, service error) is caught by the caller and mapped to the honest
 * unavailable state.
 */
export async function loadStageProgressionAvailabilityWith(
  read: StageReferenceRowReader,
): Promise<StageProgressionAvailability> {
  try {
    const rows = await read();
    return deriveStageProgressionAvailability(resolveStageOrdering(rows));
  } catch {
    // Fail-closed: rows/column not available in this environment yet.
    return stageProgressionAvailability();
  }
}

async function readLiveStageReferenceRows(): Promise<readonly StageReferenceRow[]> {
  const { Cr664_dealstagereferencesService } = await import(
    '../generated/services/Cr664_dealstagereferencesService'
  );
  const res = await Cr664_dealstagereferencesService.getAll({ select: [...STAGE_ORDERING_SELECT] });
  if (!res.success) {
    throw new Error(res.error?.message ?? 'Failed to read stage references.');
  }
  // The generated model does not (yet) type cr664_sequence; resolveStageOrdering
  // reads it structurally (optional). Cast is safe — StageReferenceRow is a
  // subset with all-optional fields, and the annotation arrives at runtime once
  // the column is provisioned.
  return (res.data ?? []) as unknown as readonly StageReferenceRow[];
}

/** Live loader — reads via the generated stage-reference service. */
export function loadStageProgressionAvailability(): Promise<StageProgressionAvailability> {
  return loadStageProgressionAvailabilityWith(readLiveStageReferenceRows);
}

/**
 * Governance initiative (2026-07-21) — live loader for the raw canonical ordering, not just its
 * availability summary. `StageWorkflowControl.tsx` (the RETURN/DECLINE/WITHDRAW UI) needs the full
 * `StageOrderingResult` (prior-stage lookups, terminal detection), not the availability projection.
 * Fail-closed identically to `loadStageProgressionAvailability` — any read failure resolves to
 * `{status:'unavailable', reasons:[...]}` , never a crash or a fabricated ordering.
 */
export async function loadStageOrdering(): Promise<StageOrderingResult> {
  try {
    const rows = await readLiveStageReferenceRows();
    return resolveStageOrdering(rows);
  } catch (err: unknown) {
    return { status: 'unavailable', reasons: [err instanceof Error ? err.message : String(err)] };
  }
}
