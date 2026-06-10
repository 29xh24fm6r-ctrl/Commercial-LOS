/**
 * Phase 143E — CRM writeback POLICY GATE (DISABLED BY DEFAULT).
 *
 * PURE. Decides whether a future CRM writeback could proceed. Even when every
 * prerequisite is satisfied, `allowedForLiveWriteNow` stays false and the best
 * status is `ready_for_dry_run` — never live. Unsupported entity/operation/fields
 * reject; stage/status/lifecycle/amount/pricing/credit fields are blocked. Every
 * outcome keeps `allowedForLiveWriteNow` / `liveWritePerformed` /
 * `externalSystemChanged` false.
 */

import { crmDeterministicProofId } from '../activation/crmActivationSafety';
import type { CrmProvider } from '../connectors/crmConnectorReadiness';

export const CRM_WRITEBACK_MODE = 'disabled_by_default' as const;

export type CrmWritebackEntityKind = 'account' | 'contact' | 'opportunity' | 'relationship_note' | 'task_note';
export type CrmWritebackOperationKind = 'create' | 'update' | 'link';

export interface CrmWritebackPolicyGateInput {
  provider: CrmProvider;
  entityKind: CrmWritebackEntityKind;
  operationKind: CrmWritebackOperationKind;
  requestedFields: readonly string[];
  sourceOfTruthConfirmed?: boolean;
  identityMatchConfirmed?: boolean;
  conflictFree?: boolean;
  auditModelReady?: boolean;
  rollbackReady?: boolean;
  allowlistConfigured?: boolean;
  mode: typeof CRM_WRITEBACK_MODE;
}

export type CrmWritebackPolicyStatus = 'blocked_disabled' | 'blocked_policy' | 'ready_for_dry_run' | 'rejected';

export interface CrmWritebackPolicyGateResult {
  status: CrmWritebackPolicyStatus;
  provider: CrmProvider;
  allowedForLiveWriteNow: false;
  liveWritePerformed: false;
  externalSystemChanged: false;
  blockers: readonly { code: string; message: string }[];
  warnings: readonly { code: string; message: string }[];
  rejectedReason?: string;
  policyGateProofId?: string;
}

const ENTITY_KINDS: readonly CrmWritebackEntityKind[] = ['account', 'contact', 'opportunity', 'relationship_note', 'task_note'];
const OPERATION_KINDS: readonly CrmWritebackOperationKind[] = ['create', 'update', 'link'];

/** Fields blocked from any CRM writeback (lifecycle / authoritative / sensitive). */
const BLOCKED_FIELDS: readonly string[] = [
  'stage', 'status', 'lifecycle', 'amount', 'pricing', 'creditdecision', 'credit_decision',
  'borrowerlegalidentity', 'ssn', 'tin', 'dob', 'accountnumber', 'approval', 'denial', 'recommendation', 'committeevote',
];

function result(
  status: CrmWritebackPolicyStatus,
  provider: CrmProvider,
  blockers: { code: string; message: string }[],
  warnings: { code: string; message: string }[],
  withProof: boolean,
  rejectedReason?: string,
): CrmWritebackPolicyGateResult {
  return {
    status, provider, allowedForLiveWriteNow: false, liveWritePerformed: false, externalSystemChanged: false,
    blockers, warnings, rejectedReason,
    policyGateProofId: withProof ? crmDeterministicProofId('crm_writeback_policy_gate', `${provider}|${CRM_WRITEBACK_MODE}`) : undefined,
  };
}

export function evaluateCrmWritebackPolicyGate(
  input: CrmWritebackPolicyGateInput | null | undefined,
): CrmWritebackPolicyGateResult {
  const provider = input?.provider ?? 'salesforce';
  if (!input || (input.provider !== 'salesforce' && input.provider !== 'ncino')) {
    return result('rejected', provider, [{ code: 'invalid_provider', message: 'Only salesforce or ncino is supported.' }], [], false, 'invalid_provider');
  }
  if (input.mode !== CRM_WRITEBACK_MODE) {
    return result('rejected', provider, [{ code: 'invalid_mode', message: 'Only the disabled-by-default mode is accepted.' }], [], false, 'invalid_mode');
  }
  if (!ENTITY_KINDS.includes(input.entityKind) || !OPERATION_KINDS.includes(input.operationKind)) {
    return result('rejected', provider, [{ code: 'unsupported_operation', message: 'Unsupported entity or operation kind.' }], [], false, 'unsupported_operation');
  }

  const blockers: { code: string; message: string }[] = [];
  const warnings: { code: string; message: string }[] = [];

  const requested = (input.requestedFields ?? []).map((f) => f.toLowerCase().replace(/[^a-z_]/g, ''));
  const blockedHit = requested.find((f) => BLOCKED_FIELDS.includes(f));
  if (blockedHit) {
    blockers.push({ code: 'blocked_field', message: `Field "${blockedHit}" is blocked from any CRM writeback in this phase.` });
    return result('blocked_policy', provider, blockers, warnings, true);
  }
  if (requested.length === 0) {
    blockers.push({ code: 'no_fields', message: 'No requested fields supplied.' });
    return result('blocked_policy', provider, blockers, warnings, true);
  }

  if (input.allowlistConfigured !== true) {
    blockers.push({ code: 'allowlist_unconfigured', message: 'No write allowlist is configured; writeback stays disabled.' });
    return result('blocked_disabled', provider, blockers, warnings, true);
  }

  if (input.sourceOfTruthConfirmed !== true) blockers.push({ code: 'source_of_truth_unconfirmed', message: 'Source of truth is not confirmed.' });
  if (input.identityMatchConfirmed !== true) blockers.push({ code: 'identity_match_unconfirmed', message: 'Identity match is not confirmed.' });
  if (input.conflictFree !== true) blockers.push({ code: 'conflicts_present', message: 'Conflicts are present.' });
  if (input.auditModelReady !== true) blockers.push({ code: 'audit_model_not_ready', message: 'Audit model is not ready.' });
  if (input.rollbackReady !== true) blockers.push({ code: 'rollback_not_ready', message: 'Rollback is not ready.' });

  if (blockers.length > 0) {
    return result('blocked_policy', provider, blockers, warnings, true);
  }

  // Every prerequisite satisfied — but live write remains disabled; dry-run only.
  warnings.push({ code: 'dry_run_only', message: 'Prerequisites met — dry-run is allowed; live write remains disabled.' });
  return result('ready_for_dry_run', provider, blockers, warnings, true);
}
