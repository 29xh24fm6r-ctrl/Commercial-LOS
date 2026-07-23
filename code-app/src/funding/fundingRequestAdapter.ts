import { newCorrelationId } from '../shared/governance/correlationId';
import { createActorChangedByResolver, type ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';
import { evaluateRequestedAmount } from './fundingAuthorizationPolicy';
import { recordFundingAudit, type EmitFundingAudit } from './fundingAudit';
import type { FundingAuthorizationStorageDeps } from './fundingAuthorizationStorage';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

export type FundingRequestOutcome =
  | { readonly kind: 'requested'; readonly record: FundingAuthorizationRecord; readonly auditRecorded: boolean; readonly auditError?: string }
  | { readonly kind: 'invalid_input'; readonly reason: string }
  | { readonly kind: 'write_failed'; readonly error: string; readonly correlationId: string };

export interface FundingRequestInput {
  readonly dealId: string;
  readonly requestedAmount: number;
  readonly requestedBy: string;
  readonly fundingMethod?: string;
  readonly supportingDocumentIds?: readonly string[];
  /** Set only when this request follows a REVOKED/REJECTED/CANCELLED prior record (a full do-over). */
  readonly supersedesRecordId?: string;
}

export interface FundingRequestDeps {
  readonly storage: FundingAuthorizationStorageDeps;
  readonly emitAudit: EmitFundingAudit;
  readonly resolveActorChangedBy?: ResolveActorChangedBy;
}

export async function requestFunding(
  input: FundingRequestInput,
  deps: FundingRequestDeps,
): Promise<FundingRequestOutcome> {
  if (!input.dealId.trim()) return { kind: 'invalid_input', reason: 'A deal id is required.' };
  if (!input.requestedBy.trim()) return { kind: 'invalid_input', reason: 'A requesting actor is required.' };
  const amountCheck = evaluateRequestedAmount(input.requestedAmount);
  if (!amountCheck.valid) return { kind: 'invalid_input', reason: amountCheck.reason };

  const correlationId = newCorrelationId('fa');
  const nowIso = new Date().toISOString();
  const record: FundingAuthorizationRecord = {
    recordId: newCorrelationId('farec'),
    dealId: input.dealId,
    authorizationStatus: 'PENDING',
    requestedAmount: input.requestedAmount,
    destinationVerificationStatus: 'unverified',
    conditionsSatisfied: false,
    exceptions: [],
    requestedBy: input.requestedBy,
    requestedAt: nowIso,
    correlationId,
    supportingDocumentIds: input.supportingDocumentIds ?? [],
    auditEventIds: [],
    fundingMethod: input.fundingMethod,
    ...(input.supersedesRecordId ? { supersedesRecordId: input.supersedesRecordId } : {}),
  };

  let writeResult;
  try {
    writeResult = await deps.storage.createRecord(record);
  } catch (err: unknown) {
    return { kind: 'write_failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!writeResult.success) {
    return { kind: 'write_failed', error: writeResult.error ?? 'Record storage returned non-success.', correlationId };
  }

  const audit = await recordFundingAudit(
    record,
    'requested',
    input.requestedBy,
    deps.resolveActorChangedBy ?? createActorChangedByResolver(),
    deps.emitAudit,
  );
  const withAuditId = audit.auditId ? { ...record, auditEventIds: [audit.auditId] } : record;
  if (audit.auditId) await deps.storage.updateRecord(withAuditId);

  return {
    kind: 'requested',
    record: withAuditId,
    auditRecorded: audit.recorded,
    ...(audit.error ? { auditError: audit.error } : {}),
  };
}
