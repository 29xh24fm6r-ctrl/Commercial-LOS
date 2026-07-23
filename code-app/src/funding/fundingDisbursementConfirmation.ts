import { createActorChangedByResolver, type ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';
import { deriveFundingReadiness, type FundingReadinessBlocker } from './fundingReadiness';
import { recordFundingAudit, type EmitFundingAudit } from './fundingAudit';
import type { FundingAuthorizationStorageDeps } from './fundingAuthorizationStorage';
import type { FundingAuthorizationRecord, FundingReadinessFacts } from './fundingAuthorizationTypes';

/**
 * final-seven-workstreams Workstream 7 — the disbursement confirmation step. This is the ONLY
 * place a record may reach FUNDED, and it is deliberately separate from the request and approval
 * actions (per the spec's required control separation). It performs NO actual money movement — it
 * records that a disbursement the bank already carried out through its real payment channel is now
 * reflected in the governed authorization record, with full readiness re-verification at the moment
 * of confirmation (never trusting an approval that may have gone stale).
 */
export type FundingDisbursementOutcome =
  | { readonly kind: 'confirmed'; readonly record: FundingAuthorizationRecord; readonly auditRecorded: boolean; readonly auditError?: string }
  | { readonly kind: 'blocked'; readonly blockers: readonly FundingReadinessBlocker[] }
  | { readonly kind: 'denied'; readonly reason: 'not_approved' | 'already_funded' | 'record_terminal' }
  | { readonly kind: 'write_failed'; readonly error: string };

export interface ConfirmFundingDisbursementInput {
  readonly record: FundingAuthorizationRecord;
  readonly readinessFacts: FundingReadinessFacts;
  readonly fundingDate: string;
  readonly confirmedByActorEmail: string;
}

export interface FundingDisbursementDeps {
  readonly storage: FundingAuthorizationStorageDeps;
  readonly emitAudit: EmitFundingAudit;
  readonly resolveActorChangedBy?: ResolveActorChangedBy;
}

export async function confirmFundingDisbursement(
  input: ConfirmFundingDisbursementInput,
  deps: FundingDisbursementDeps,
): Promise<FundingDisbursementOutcome> {
  if (input.record.authorizationStatus === 'FUNDED') return { kind: 'denied', reason: 'already_funded' };
  if (input.record.authorizationStatus !== 'APPROVED') {
    return {
      kind: 'denied',
      reason: input.record.authorizationStatus === 'PENDING' || input.record.authorizationStatus === 'BLOCKED'
        ? 'not_approved'
        : 'record_terminal',
    };
  }

  const readiness = deriveFundingReadiness(input.readinessFacts);
  if (!readiness.ready) return { kind: 'blocked', blockers: readiness.blockers };

  const updated: FundingAuthorizationRecord = {
    ...input.record,
    authorizationStatus: 'FUNDED',
    fundingDate: input.fundingDate,
  };

  const write = await deps.storage.updateRecord(updated);
  if (!write.success) return { kind: 'write_failed', error: write.error ?? 'Record update returned non-success.' };

  const audit = await recordFundingAudit(
    updated,
    'funded',
    input.confirmedByActorEmail,
    deps.resolveActorChangedBy ?? createActorChangedByResolver(),
    deps.emitAudit,
  );
  const withAuditId = audit.auditId
    ? { ...updated, auditEventIds: [...updated.auditEventIds, audit.auditId] }
    : updated;
  if (audit.auditId) await deps.storage.updateRecord(withAuditId);

  return {
    kind: 'confirmed',
    record: withAuditId,
    auditRecorded: audit.recorded,
    ...(audit.error ? { auditError: audit.error } : {}),
  };
}
