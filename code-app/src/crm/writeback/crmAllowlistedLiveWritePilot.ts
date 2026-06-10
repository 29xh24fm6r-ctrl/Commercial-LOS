/**
 * Phase 143I — CRM allowlisted live-write pilot SCAFFOLD (DISABLED BY DEFAULT).
 *
 * PURE. Defines the FUTURE control envelope for an allowlisted live-write pilot
 * WITHOUT enabling it. Only a tiny set of non-authoritative fields are allowlist
 * candidates; lifecycle / authoritative / sensitive fields are blocked. Even an
 * `eligible_for_future_pilot` result performs NO write, calls NO provider, and
 * uses NO transport. Every outcome keeps `liveWritePilotEnabled`,
 * `liveWritePerformed`, and `externalSystemChanged` false.
 */

import { crmDeterministicProofId } from '../activation/crmActivationSafety';

/** The ONLY fields eligible as future allowlisted-pilot candidates. */
export const CRM_PILOT_ALLOWED_FIELDS: readonly string[] = Object.freeze([
  'relationship_intelligence_note',
  'crm_external_reference_label',
  'non_authoritative_task_note',
  'preview_only_status_label',
]);

/** Fields that are always blocked from any pilot. */
export const CRM_PILOT_BLOCKED_FIELDS: readonly string[] = Object.freeze([
  'credit_decision', 'stage', 'status', 'lifecycle', 'amount', 'pricing', 'borrower_legal_identity',
  'ssn', 'tin', 'dob', 'account_number', 'approval', 'denial', 'recommendation', 'committee_vote',
]);

export interface CrmAllowlistedLiveWritePilotInput {
  dealId?: string;
  candidateFields: readonly string[];
}

export type CrmPilotStatus = 'disabled' | 'rejected' | 'eligible_for_future_pilot';

export interface CrmAllowlistedLiveWritePilotResult {
  status: CrmPilotStatus;
  liveWritePilotEnabled: false;
  liveWritePerformed: false;
  externalSystemChanged: false;
  allowedFieldCount: number;
  blockedFieldCount: number;
  allowedFields: readonly string[];
  blockedFields: readonly string[];
  message: string;
  pilotProofId?: string;
}

const DISABLED_MESSAGE = 'The allowlisted live-write pilot is disabled by default — no write occurs, even when eligible.';

function norm(field: string): string {
  return field.toLowerCase().replace(/[^a-z_]/g, '');
}

export function evaluateCrmAllowlistedLiveWritePilot(
  input: CrmAllowlistedLiveWritePilotInput | null | undefined,
): CrmAllowlistedLiveWritePilotResult {
  const candidates = (input?.candidateFields ?? []).map(norm);
  const allowed = candidates.filter((f) => CRM_PILOT_ALLOWED_FIELDS.includes(f));
  const blocked = candidates.filter((f) => CRM_PILOT_BLOCKED_FIELDS.includes(f) || !CRM_PILOT_ALLOWED_FIELDS.includes(f));

  const baseFlags = { liveWritePilotEnabled: false as const, liveWritePerformed: false as const, externalSystemChanged: false as const };
  const proofId = crmDeterministicProofId('crm_live_write_pilot_disabled', `${(input?.dealId ?? '').trim()}|${[...candidates].sort().join(',')}`);

  if (candidates.length === 0) {
    return { status: 'disabled', ...baseFlags, allowedFieldCount: 0, blockedFieldCount: 0, allowedFields: [], blockedFields: [], message: DISABLED_MESSAGE, pilotProofId: proofId };
  }
  if (blocked.length > 0) {
    return { status: 'rejected', ...baseFlags, allowedFieldCount: allowed.length, blockedFieldCount: blocked.length, allowedFields: allowed, blockedFields: blocked, message: `Rejected: ${blocked.length} field(s) are not allowlisted. ${DISABLED_MESSAGE}`, pilotProofId: proofId };
  }
  // All candidates are allowlisted — eligible for a FUTURE pilot, but still disabled (no write).
  return { status: 'eligible_for_future_pilot', ...baseFlags, allowedFieldCount: allowed.length, blockedFieldCount: 0, allowedFields: allowed, blockedFields: [], message: `Eligible for a future allowlisted pilot. ${DISABLED_MESSAGE}`, pilotProofId: proofId };
}
