import { buildNewDealAuditPayload, summarizeAuditPayloadShape, AUDIT_OUTCOME_SUCCEEDED } from '../deals/dealOriginationAudit';
import { newCorrelationId } from '../shared/governance/correlationId';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import type { EmitFundingAudit, FundingAuditAction } from './fundingAudit';

/**
 * Factory Arc Phase 13 — the live `EmitFundingAudit` implementation. Replaces
 * `DealFundingAuthorizationPanel.tsx`'s `NO_LIVE_AUDIT_SINK` stub (self-documented: "No live audit
 * sink is wired yet for funding authorization"), which meant every real, durable funding-authorization
 * write (PR 112 — request/approve/reject/revoke/confirm, all against a genuinely live
 * `cr664_fundingauthorization` record) landed with zero audit trail. Reuses the SAME canonical
 * `buildNewDealAuditPayload` / `Cr664_auditeventsService` path every other deal-scoped lifecycle event
 * in this app already funnels through (see documentUploadLiveDeps.ts's `emitAudit` for the identical
 * pattern) — this is not a new audit mechanism, just the missing wire-up for this one domain.
 *
 * Every funding action recorded here is an honest SUCCEEDED lifecycle event: a rejection or
 * revocation is a legitimate governed outcome of the funding process, not an audit "failure" — the
 * distinction between actions is carried in `cr664_auditeventname` / `cr664_notes`, not the outcome
 * code. A failed/unresolved audit never reverts the funding action that already happened (this
 * codebase's universal "governance-partial" outcome discipline) — `recordFundingAudit` (fundingAudit.ts)
 * already enforces that; this module only supplies the live emit.
 */

const ACTION_LABEL: Record<FundingAuditAction, string> = {
  requested: 'Funding Requested',
  first_approval: 'Funding First Approval Recorded',
  fully_approved: 'Funding Fully Approved',
  rejected: 'Funding Rejected',
  revoked: 'Funding Revoked',
  funded: 'Funds Disbursed',
};

export const emitLiveFundingAudit: EmitFundingAudit = async ({ record, action, changedByBind }) => {
  assertChangedByCoreUserBind(changedByBind);
  const nowIso = new Date().toISOString();
  const correlationId = record.correlationId || newCorrelationId('fa');
  const payload = buildNewDealAuditPayload(
    {
      eventName: ACTION_LABEL[action],
      dealId: record.dealId,
      changedByBind,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      sourceProcess: 'fundingAuditLiveDeps/emitFundingAudit',
      notes: `Funding authorization ${record.recordId} for deal ${record.dealId}: ${ACTION_LABEL[action]} (status now ${record.authorizationStatus}).`,
      fieldName: 'cr664_authorizationstatus',
      oldValue: '',
      newValue: record.authorizationStatus,
    },
    nowIso,
  );
  const shape = summarizeAuditPayloadShape(payload);
  try {
    const { Cr664_auditeventsService } = await import('../generated/services/Cr664_auditeventsService');
    const res = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!res.success) {
      return { success: false, error: `${res.error?.message ?? 'AuditEvent create returned non-success.'} | ${shape}` };
    }
    return { success: true, id: (res.data as unknown as { cr664_auditeventid?: string } | undefined)?.cr664_auditeventid };
  } catch (err: unknown) {
    return { success: false, error: `${err instanceof Error ? err.message : String(err)} | ${shape}` };
  }
};
