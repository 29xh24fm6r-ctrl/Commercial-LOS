/**
 * Final LOS Completion arc — Workstream F. Durable Executed Document Attestation record.
 *
 * Closes the CLOSING_FUNDING:executed_docs untracked() gap in loanWorkflowRequirementRegistry.ts.
 * Distinct from `closingDocumentTypes.ts`'s `GeneratedClosingDocumentManifest` (PR107/PR123), which
 * tracks GENERATION of closing documents (draft/final content) — this record is the missing fact
 * that the generated package was actually EXECUTED (signed) by the borrower at closing, which is a
 * separate, later event a closer certifies.
 */

export type ExecutedDocumentAttestationStatus = 'ATTESTED' | 'REVOKED';

export const EXECUTED_DOCUMENT_CERTIFICATION_STATUSES: readonly ExecutedDocumentAttestationStatus[] = [
  'ATTESTED',
  'REVOKED',
];

export interface ExecutedDocumentAttestationRecord {
  readonly attestationId: string;
  readonly dealId: string;
  readonly status: ExecutedDocumentAttestationStatus;
  /** The date the documents were actually signed (may differ from `attestedAtIso`, which is when
   *  the attestation was recorded). */
  readonly executedDateIso: string;
  /** REQUIRED — a blank notes field is denied by submitExecutedDocumentAttestationAction() before
   *  any write is attempted. */
  readonly notes: string;
  readonly attestedByActorEmail: string;
  readonly attestedAtIso: string;
  readonly correlationId: string;
  readonly supersedesAttestationId: string | undefined;
}

export interface ExecutedDocumentAttestationReadiness {
  /** CLOSING_FUNDING:executed_docs */
  readonly executedDocsAttested: { readonly met: boolean; readonly reason: string };
  /** The head-of-chain record, if any (for downstream display). */
  readonly currentAttestation: ExecutedDocumentAttestationRecord | undefined;
}

const NOT_MET = {
  met: false,
  reason: 'Executed loan documents have not been attested for this deal.',
} as const;

/**
 * Resolves the head-of-chain record via the append-only chain's structural linkage
 * (`supersedesAttestationId`), NOT by comparing timestamps — same discipline
 * `evaluateCommitmentReadiness` / `evaluateConditionVerificationReadiness` use.
 */
function headOfChain(
  records: readonly ExecutedDocumentAttestationRecord[],
): ExecutedDocumentAttestationRecord | undefined {
  const supersededIds = new Set(
    records.map((r) => r.supersedesAttestationId).filter((id): id is string => Boolean(id)),
  );
  const heads = records.filter((r) => !supersededIds.has(r.attestationId));
  return [...heads].sort((a, b) => (b.attestedAtIso ?? '').localeCompare(a.attestedAtIso ?? ''))[0];
}

/**
 * Fail-closed Executed Document Attestation readiness (Final LOS Completion arc, Workstream F/K).
 * Never fabricates a attestation: an empty list, a deal-id mismatch, or a head record whose
 * status is REVOKED (rather than ATTESTED) all fail closed as not-met.
 */
export function evaluateExecutedDocumentAttestationReadiness(
  records: readonly ExecutedDocumentAttestationRecord[] | undefined,
  expectedDealId: string,
): ExecutedDocumentAttestationReadiness {
  const forDeal = (records ?? []).filter((r) => r.dealId === expectedDealId);
  const current = headOfChain(forDeal);
  const met = current?.status === 'ATTESTED';
  return {
    executedDocsAttested: met ? { met: true, reason: '' } : NOT_MET,
    currentAttestation: current,
  };
}
