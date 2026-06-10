/**
 * Phase 143F — CRM controlled writeback adapter (DRY-RUN ONLY).
 *
 * PURE / offline. Accepts a policy-approved preview plan and returns a
 * deterministic DRY-RUN proof. It never calls Salesforce/nCino, never uses the
 * network, and never returns a live write. It rejects `dryRunOnly !== true`, a
 * policy gate that is not `ready_for_dry_run`, executable/unsafe payloads, and
 * unsupported operations. Every outcome keeps `liveWritePerformed`,
 * `salesforceWritePerformed`, `ncinoWritePerformed`, and `externalSystemChanged`
 * false.
 */

import { crmContainsUnsafePayload, crmDeterministicProofId } from '../activation/crmActivationSafety';
import type { CrmProvider } from '../connectors/crmConnectorReadiness';
import type { CrmWritebackPolicyStatus } from './crmWritebackPolicyGate';

export interface CrmControlledWritebackOperation {
  entity: string;
  operation: string;
  fieldLabel?: string;
  valueSummary?: string;
}

export interface CrmControlledWritebackInput {
  provider: CrmProvider;
  planId?: string;
  dryRunOnly: boolean;
  policyGateStatus: CrmWritebackPolicyStatus;
  operations: readonly CrmControlledWritebackOperation[];
  requestedByDisplayName?: string;
  requestedAt: string;
}

export type CrmControlledWritebackStatus = 'dry_run_recorded' | 'rejected';
export type CrmControlledWritebackRejectedReason =
  | 'missing_plan'
  | 'not_dry_run_only'
  | 'policy_not_ready'
  | 'unsupported_operation'
  | 'unsafe_payload';

const SUPPORTED_OPERATIONS = new Set(['would_create', 'would_update', 'would_link', 'no_op', 'would_skip']);

export interface CrmControlledWritebackAuditSummary {
  planId: string;
  provider: CrmProvider;
  operationCount: number;
  liveWritePerformed: false;
  salesforceWritePerformed: false;
  ncinoWritePerformed: false;
  externalSystemChanged: false;
  readOnly: true;
}

export interface CrmControlledWritebackResult {
  status: CrmControlledWritebackStatus;
  provider: CrmProvider;
  dryRunOnly: true;
  liveWritePerformed: false;
  salesforceWritePerformed: false;
  ncinoWritePerformed: false;
  externalSystemChanged: false;
  message: string;
  rejectedReason?: CrmControlledWritebackRejectedReason;
  dryRunProofId?: string;
  auditSummary: CrmControlledWritebackAuditSummary;
}

const NO_LIVE = 'Dry-run only — no Salesforce or nCino record is written and no external system is changed.';

function audit(input: CrmControlledWritebackInput | null, planId: string): CrmControlledWritebackAuditSummary {
  return {
    planId,
    provider: input?.provider ?? 'salesforce',
    operationCount: input?.operations?.length ?? 0,
    liveWritePerformed: false,
    salesforceWritePerformed: false,
    ncinoWritePerformed: false,
    externalSystemChanged: false,
    readOnly: true,
  };
}

function rejected(input: CrmControlledWritebackInput | null, planId: string, reason: CrmControlledWritebackRejectedReason, message: string): CrmControlledWritebackResult {
  return {
    status: 'rejected',
    provider: input?.provider ?? 'salesforce',
    dryRunOnly: true,
    liveWritePerformed: false,
    salesforceWritePerformed: false,
    ncinoWritePerformed: false,
    externalSystemChanged: false,
    message: `${message} ${NO_LIVE}`,
    rejectedReason: reason,
    auditSummary: audit(input, planId),
  };
}

export function submitCrmControlledWriteback(
  input: CrmControlledWritebackInput | null | undefined,
): CrmControlledWritebackResult {
  const planId = (input?.planId ?? '').trim();
  if (!input || planId.length === 0 || (input.operations?.length ?? 0) === 0) {
    return rejected(input ?? null, planId, 'missing_plan', 'Rejected: a non-empty policy-approved plan is required.');
  }
  if (input.dryRunOnly !== true) {
    return rejected(input, planId, 'not_dry_run_only', 'Rejected: only dry-run-only requests are accepted.');
  }
  if (input.policyGateStatus !== 'ready_for_dry_run') {
    return rejected(input, planId, 'policy_not_ready', 'Rejected: the writeback policy gate is not ready_for_dry_run.');
  }
  if (input.operations.some((op) => !SUPPORTED_OPERATIONS.has(op.operation))) {
    return rejected(input, planId, 'unsupported_operation', 'Rejected: an unsupported operation was supplied.');
  }
  const payloadText = input.operations.map((op) => `${op.entity}\n${op.operation}\n${op.fieldLabel ?? ''}\n${op.valueSummary ?? ''}`).join('\n');
  if (crmContainsUnsafePayload(payloadText)) {
    return rejected(input, planId, 'unsafe_payload', 'Rejected: a suspicious executable / unsafe payload was supplied.');
  }

  return {
    status: 'dry_run_recorded',
    provider: input.provider,
    dryRunOnly: true,
    liveWritePerformed: false,
    salesforceWritePerformed: false,
    ncinoWritePerformed: false,
    externalSystemChanged: false,
    message: `Dry-run proof recorded for ${input.operations.length} operation(s). ${NO_LIVE}`,
    dryRunProofId: crmDeterministicProofId('crm_writeback_dry_run', `${input.provider}|${planId}|${input.operations.length}`),
    auditSummary: audit(input, planId),
  };
}
