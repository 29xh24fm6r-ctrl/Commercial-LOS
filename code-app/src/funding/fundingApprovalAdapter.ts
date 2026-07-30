import { createActorChangedByResolver, type ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';
import {
  evaluateFundingApproval,
  evaluateFundingRejection,
  evaluateFundingRevocation,
  type FundingAuthorizationPolicyConfig,
} from './fundingAuthorizationPolicy';
import { recordFundingAudit, type EmitFundingAudit } from './fundingAudit';
import { recordFundingTimeline, type EmitFundingTimeline } from './fundingTimelineWrite';
import type { FundingAuthorizationStorageDeps } from './fundingAuthorizationStorage';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';
import {
  evaluateLifecycleBeforeWrite,
  type LifecycleGovernanceInvocation,
} from '../governance/lifecycleGovernanceIntegration';

export interface FundingApprovalDeps {
  readonly storage: FundingAuthorizationStorageDeps;
  readonly emitAudit: EmitFundingAudit;
  readonly resolveActorChangedBy?: ResolveActorChangedBy;
  /**
   * Final LOS Completion arc — Workstream K. Optional ONLY so hand-built test doubles predating
   * this workstream keep compiling without edits — an omitted dep is equivalent to "timeline
   * emission unavailable," never fabricated as succeeded. Independent of `emitAudit`'s own
   * success/failure.
   */
  readonly emitTimeline?: EmitFundingTimeline;
  readonly lifecycleGovernance?: LifecycleGovernanceInvocation;
}

export type FundingApprovalOutcome =
  | { readonly kind: 'first_approval_recorded'; readonly record: FundingAuthorizationRecord }
  | { readonly kind: 'fully_approved'; readonly record: FundingAuthorizationRecord }
  | { readonly kind: 'rejected'; readonly record: FundingAuthorizationRecord }
  | { readonly kind: 'revoked'; readonly record: FundingAuthorizationRecord }
  | { readonly kind: 'denied'; readonly reason: string }
  | { readonly kind: 'write_failed'; readonly error: string };

type PersistResult =
  | { readonly ok: true; readonly record: FundingAuthorizationRecord }
  | { readonly ok: false; readonly error: string };

async function persistAndAudit(
  record: FundingAuthorizationRecord,
  action: Parameters<typeof recordFundingAudit>[1],
  actorEmail: string,
  deps: FundingApprovalDeps,
): Promise<PersistResult> {
  const write = await deps.storage.updateRecord(record);
  if (!write.success) return { ok: false, error: write.error ?? 'Record update returned non-success.' };
  const resolveActorChangedBy = deps.resolveActorChangedBy ?? createActorChangedByResolver();
  const audit = await recordFundingAudit(record, action, actorEmail, resolveActorChangedBy, deps.emitAudit);
  const withAudit = audit.auditId ? { ...record, auditEventIds: [...record.auditEventIds, audit.auditId] } : record;
  if (audit.auditId) await deps.storage.updateRecord(withAudit);

  // Final LOS Completion arc — Workstream K. Best-effort, never blocks the outcome or reflects the
  // audit's own success/failure — the write above already succeeded and is authoritative.
  if (deps.emitTimeline) {
    try {
      await recordFundingTimeline(withAudit, action, actorEmail, new Date().toISOString(), resolveActorChangedBy, deps.emitTimeline);
    } catch {
      // Best-effort — see the comment above.
    }
  }

  return { ok: true, record: withAudit };
}

export interface ApproveFundingInput {
  readonly record: FundingAuthorizationRecord;
  readonly approverEmail: string;
  readonly approvedAmount: number;
  readonly authorizedFacilityAmount: number;
  readonly config?: FundingAuthorizationPolicyConfig;
}

export async function approveFunding(
  input: ApproveFundingInput,
  deps: FundingApprovalDeps,
): Promise<FundingApprovalOutcome> {
  const evaluation = evaluateFundingApproval(input);
  if (evaluation.kind === 'denied') return { kind: 'denied', reason: evaluation.reason };
  const lifecycleGate = await evaluateLifecycleBeforeWrite(
    'funding-authorization',
    deps.lifecycleGovernance,
    { allowed: true, evidenceIds: ['legacy-funding-approval-policy'] },
  );
  if (!lifecycleGate.allowed) return { kind: 'denied', reason: lifecycleGate.safeMessage };

  const nowIso = new Date().toISOString();
  if (evaluation.kind === 'first_approval_recorded') {
    const updated: FundingAuthorizationRecord = {
      ...input.record,
      authorizedBy: input.approverEmail,
      approvedAmount: input.approvedAmount,
    };
    const result = await persistAndAudit(updated, 'first_approval', input.approverEmail, deps);
    if (!result.ok) return { kind: 'write_failed', error: result.error };
    return { kind: 'first_approval_recorded', record: result.record };
  }

  const updated: FundingAuthorizationRecord = {
    ...input.record,
    authorizationStatus: 'APPROVED',
    approvedAmount: input.approvedAmount,
    authorizedAt: nowIso,
    ...(input.record.authorizedBy ? { secondApprovedBy: input.approverEmail } : { authorizedBy: input.approverEmail }),
  };
  const result = await persistAndAudit(updated, 'fully_approved', input.approverEmail, deps);
  if (!result.ok) return { kind: 'write_failed', error: result.error };
  return { kind: 'fully_approved', record: result.record };
}

export async function rejectFunding(
  record: FundingAuthorizationRecord,
  actorEmail: string,
  deps: FundingApprovalDeps,
): Promise<FundingApprovalOutcome> {
  const evaluation = evaluateFundingRejection(record);
  if (evaluation.kind === 'denied') return { kind: 'denied', reason: evaluation.reason };
  const updated: FundingAuthorizationRecord = { ...record, authorizationStatus: 'REJECTED' };
  const result = await persistAndAudit(updated, 'rejected', actorEmail, deps);
  if (!result.ok) return { kind: 'write_failed', error: result.error };
  return { kind: 'rejected', record: result.record };
}

export async function revokeFunding(
  record: FundingAuthorizationRecord,
  actorEmail: string,
  deps: FundingApprovalDeps,
): Promise<FundingApprovalOutcome> {
  const evaluation = evaluateFundingRevocation(record);
  if (evaluation.kind === 'denied') return { kind: 'denied', reason: evaluation.reason };
  const updated: FundingAuthorizationRecord = { ...record, authorizationStatus: 'REVOKED' };
  const result = await persistAndAudit(updated, 'revoked', actorEmail, deps);
  if (!result.ok) return { kind: 'write_failed', error: result.error };
  return { kind: 'revoked', record: result.record };
}
