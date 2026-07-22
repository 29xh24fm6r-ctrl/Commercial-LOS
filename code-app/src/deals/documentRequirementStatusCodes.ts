import type { DocumentRequirementStatus } from './documentRequirementLifecycle';

/**
 * Persisted cr664_requirementstatus option-set values — pure lookup table,
 * no writes. Split out of documentRequirementActions.ts (Remediation
 * 2026-07-22, Workstream G) so read-only surfaces (Manager, Team) can read a
 * document's governed requirement status without importing an action
 * module: readOnlySurfaceGuard.test.ts's Phase 44 role-boundary sweep
 * forbids any manager/team file from importing anything under
 * src/deals/*Actions.ts, on the (correct) assumption that such a file may
 * perform writes. documentRequirementActions.ts re-exports both symbols
 * below unchanged for its own existing consumers.
 */
export const REQUIREMENT_STATUS_CODES: Readonly<Record<DocumentRequirementStatus, number>> = Object.freeze({
  not_assessed: 788190100,
  outstanding: 788190101,
  requested: 788190102,
  under_review: 788190103,
  reviewed: 788190104,
  waived: 788190105,
  not_applicable: 788190106,
});

const STATUS_BY_CODE: ReadonlyMap<number, DocumentRequirementStatus> = new Map(
  Object.entries(REQUIREMENT_STATUS_CODES).map(([status, code]) => [code, status as DocumentRequirementStatus]),
);

/** Reverse lookup for reading a persisted cr664_requirementstatus value back off a live row. */
export function requirementStatusFromCode(code: number | undefined): DocumentRequirementStatus | undefined {
  if (code === undefined) return undefined;
  return STATUS_BY_CODE.get(code);
}
