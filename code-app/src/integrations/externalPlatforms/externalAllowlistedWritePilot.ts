/**
 * Phase 155 — Allowlisted write pilot scaffold.
 * Disabled by default. No writes. No write button. No enable-live button.
 */

export type WritePilotStatus = 'disabled' | 'eligible_for_future_pilot' | 'rejected';

export interface AllowlistedWritePilotInput {
  candidateFields: readonly string[];
}

export interface AllowlistedWritePilotResult {
  status: WritePilotStatus;
  liveWritePilotEnabled: false;
  liveWritePerformed: false;
  externalSystemChanged: false;
  allowedFieldCount: number;
  blockedFieldCount: number;
  pilotProofId: string;
  blockers: readonly string[];
  warnings: readonly string[];
  nextActivationGate: string;
}

const CANDIDATE_ALLOWLIST = [
  'non_authoritative_relationship_note',
  'external_reference_label',
  'review_status_label',
  'preview_comment',
  'internal_follow_up_note',
];

const ALWAYS_BLOCKED = [
  'credit_decision', 'committee_vote', 'approval_status',
  'lifecycle', 'stage', 'status', 'amount', 'pricing',
  'borrower_legal_name', 'tax_id', 'ssn', 'dob',
  'account_number', 'routing_number', 'loan_boarding_status', 'payment_status',
];

export function evaluateAllowlistedWritePilot(input: AllowlistedWritePilotInput): AllowlistedWritePilotResult {
  const blockers: string[] = [];
  let allowedCount = 0;
  let blockedCount = 0;

  for (const field of input.candidateFields) {
    if (ALWAYS_BLOCKED.includes(field)) {
      blockers.push(`${field}: always blocked (authoritative/sensitive)`);
      blockedCount++;
    } else if (CANDIDATE_ALLOWLIST.includes(field)) {
      allowedCount++;
    } else {
      blockers.push(`${field}: not in candidate allowlist`);
      blockedCount++;
    }
  }

  const status: WritePilotStatus =
    blockers.length > 0 && allowedCount === 0 ? 'rejected' :
    allowedCount > 0 ? 'eligible_for_future_pilot' :
    'disabled';

  return {
    status,
    liveWritePilotEnabled: false,
    liveWritePerformed: false,
    externalSystemChanged: false,
    allowedFieldCount: allowedCount,
    blockedFieldCount: blockedCount,
    pilotProofId: `write-pilot:${status}:${Date.now()}`,
    blockers,
    warnings: allowedCount > 0 ? ['Eligible fields identified but pilot is not enabled.'] : [],
    nextActivationGate: 'Operator approval, security review, audit model, and rollback plan required before enabling write pilot.',
  };
}
