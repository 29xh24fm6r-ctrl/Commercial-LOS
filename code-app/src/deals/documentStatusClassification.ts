import type { DocumentRequirementStatus } from './documentRequirementLifecycle';

/**
 * Canonical document-status classification — Remediation 2026-07-22
 * (Workstream G).
 *
 * Shared by every surface that buckets live cr664_documentchecklist rows
 * into outstanding/received/reviewed: dealDocumentQueries.ts (Deal Cockpit +
 * DealMetricDeck/DealWorkstreamPanel), workQueueQueries.ts (the cross-deal
 * banker work queue), managerQueries.ts (Manager rollups), and
 * teamQueries.ts (Team rollups). Each of these previously carried its own
 * independently-written copy of the same "reviewer > receivedDate/uploaded >
 * outstanding" rule — correct on its own, but four separate copies that
 * could silently drift, and NONE of which recognized a document the
 * Document Requirement workspace (documentRequirementActions.ts) has
 * already Waived or marked Not Applicable. A waived/N-A row persists no
 * reviewer, no receivedDate, and is never uploaded, so every one of the
 * four copies bucketed it as "outstanding" — a document a banker had
 * already governed-excused kept inflating the Deal Cockpit outstanding
 * count, the Manager and Team rollups, and the cross-deal work queue.
 *
 * This module is the one place that rule now lives.
 * `classifyLegacyDocumentStatus` keeps the exact 3-bucket vocabulary those
 * surfaces already render; `isGovernedExcusedDocument` is the shared "has
 * this been waived or marked Not Applicable" check callers use to exclude
 * such rows from all three buckets, rather than mis-filing them as
 * outstanding.
 */

export type LegacyDocumentStatus = 'outstanding' | 'received' | 'reviewed';

export function classifyLegacyDocumentStatus(opts: {
  readonly reviewer: string | undefined;
  readonly receivedDate: string | undefined;
  readonly uploaded: boolean;
}): LegacyDocumentStatus {
  if (opts.reviewer && opts.reviewer.trim().length > 0) return 'reviewed';
  if (opts.receivedDate || opts.uploaded) return 'received';
  return 'outstanding';
}

/**
 * True once the Document Requirement workspace has Waived or marked this
 * row Not Applicable (documentRequirementActions.ts's `waive` /
 * `mark_not_applicable` actions). Reads the same stopgap fields
 * documentRequirementLiveReader.ts already reads (see
 * documentRequirementFields.ts) — no schema change, just recognizing what
 * those actions already persist.
 */
export function isGovernedExcusedDocument(opts: {
  readonly waived?: boolean;
  readonly requirementStatus?: DocumentRequirementStatus;
}): boolean {
  return (
    opts.waived === true ||
    opts.requirementStatus === 'waived' ||
    opts.requirementStatus === 'not_applicable'
  );
}
