/**
 * Reconciles the derivation engine's currently-applicable requirements
 * (documentRequirementDerivation.ts) against live cr664_documentchecklist
 * rows, producing the single list the Documents UI, the blocker model, and
 * every other consuming surface reads. A derived requirement with no
 * matching live row is a VIRTUAL row in status `not_assessed` — nothing is
 * persisted until `acknowledge` runs. A live row survives even if it no
 * longer matches a currently-derived requirement (e.g. a manually-added
 * document, or a requirement a since-changed deal attribute no longer
 * triggers) — rows are never silently dropped.
 */

import type { RequiredDocumentDefinition } from './documentRequirementDerivation';
import type { DocumentRequirementRow, DocumentRequirementStatus } from './documentRequirementLifecycle';

/** LEGACY name matching (no business-type key in the schema) — mirrors loanWorkflowRequirementEngine.ts. */
function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
}

/** The relevant fields of a live cr664_documentchecklist row, already mapped to a clean shape. */
export interface LiveDocumentChecklistRow {
  readonly id: string;
  readonly documentName: string;
  /** Raw persisted status, when present. Absent for rows created before this feature. */
  readonly requirementStatus: DocumentRequirementStatus | undefined;
  readonly required: boolean | undefined;
  readonly acknowledged: boolean | undefined;
  readonly acknowledgedBy: string | undefined;
  readonly acknowledgedDate: string | undefined;
  readonly requestedDate: string | undefined;
  readonly receivedDate: string | undefined;
  /** Optional so existing hand-built `LiveDocumentChecklistRow` fixtures keep compiling without edits. */
  readonly receivedBy?: string | undefined;
  readonly reviewedDate: string | undefined;
  readonly reviewer: string | undefined;
  readonly waived: boolean | undefined;
  readonly waiverReason: string | undefined;
  readonly dueDate: string | undefined;
}

/**
 * Legacy rows (created by the retired pilot, or the old addRequiredDocument
 * action, before requirementStatus existed) get an inferred status from the
 * facts already on the row — the same fact-precedence dealDocumentQueries.ts
 * already used (reviewer > receivedDate > requestDate > bare existence).
 */
function inferLegacyStatus(row: LiveDocumentChecklistRow): DocumentRequirementStatus {
  if (row.reviewedDate || (row.reviewer ?? '').trim().length > 0) return 'reviewed';
  if (row.receivedDate) return 'under_review';
  if (row.requestedDate) return 'requested';
  return 'outstanding';
}

function toRequirementRow(row: LiveDocumentChecklistRow): DocumentRequirementRow {
  const status = row.requirementStatus ?? inferLegacyStatus(row);
  return {
    id: row.id,
    documentName: row.documentName,
    status,
    required: row.required ?? true,
    // A persisted row that predates the acknowledged flag implies acknowledgment in
    // spirit (someone already requested/received it) — infer true rather than false.
    acknowledged: row.acknowledged ?? true,
    acknowledgedBy: row.acknowledgedBy,
    acknowledgedDate: row.acknowledgedDate,
    requestedDate: row.requestedDate,
    receivedDate: row.receivedDate,
    receivedBy: row.receivedBy,
    reviewedDate: row.reviewedDate,
    reviewer: row.reviewer,
    waived: row.waived ?? status === 'waived',
    waiverReason: row.waiverReason,
    dueDate: row.dueDate,
  };
}

function virtualRow(def: RequiredDocumentDefinition): DocumentRequirementRow {
  return {
    id: undefined,
    documentName: def.documentName,
    status: 'not_assessed',
    required: true,
    acknowledged: false,
    acknowledgedBy: undefined,
    acknowledgedDate: undefined,
    requestedDate: undefined,
    receivedDate: undefined,
    receivedBy: undefined,
    reviewedDate: undefined,
    reviewer: undefined,
    waived: false,
    waiverReason: undefined,
    dueDate: undefined,
  };
}

export function reconcileDocumentRequirements(
  requirements: readonly RequiredDocumentDefinition[],
  liveRows: readonly LiveDocumentChecklistRow[],
): readonly DocumentRequirementRow[] {
  const byNormalizedName = new Map<string, LiveDocumentChecklistRow>();
  for (const row of liveRows) {
    byNormalizedName.set(normalizeName(row.documentName), row);
  }

  const matched = new Set<string>();
  const result: DocumentRequirementRow[] = [];

  for (const def of requirements) {
    const key = normalizeName(def.documentName);
    const row = byNormalizedName.get(key);
    if (row) {
      matched.add(key);
      result.push(toRequirementRow(row));
    } else {
      result.push(virtualRow(def));
    }
  }

  for (const row of liveRows) {
    const key = normalizeName(row.documentName);
    if (matched.has(key)) continue;
    result.push(toRequirementRow(row));
  }

  return result;
}
