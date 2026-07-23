import type { FundingAuditAction } from './fundingAudit';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

/**
 * Pure timeline-event payload builder — mirrors this app's established deal-timeline shape
 * (`src/deals/activityQueries.ts` / `src/deals/logActivityActions.ts`) so a future live wiring can
 * cross-write a real `cr664_dealtimelineevent` row for each funding transition, exactly the way
 * activity logging does. NOT wired to any live write today (no dedicated funding-timeline event
 * type exists on the schema yet) — this is a payload SHAPE, not a write path.
 */
export interface FundingTimelineEntry {
  readonly dealId: string;
  readonly title: string;
  readonly summary: string;
  readonly occurredAtIso: string;
  readonly action: FundingAuditAction;
}

const ACTION_TITLE: Record<FundingAuditAction, string> = {
  requested: 'Funding requested',
  first_approval: 'Funding first approval recorded',
  fully_approved: 'Funding approved',
  rejected: 'Funding rejected',
  revoked: 'Funding approval revoked',
  funded: 'Funding disbursed',
};

export function buildFundingTimelineEntry(
  record: FundingAuthorizationRecord,
  action: FundingAuditAction,
  occurredAtIso: string,
): FundingTimelineEntry {
  return {
    dealId: record.dealId,
    title: ACTION_TITLE[action],
    summary: `${ACTION_TITLE[action]} — requested $${record.requestedAmount.toLocaleString()}${
      record.approvedAmount !== undefined ? `, approved $${record.approvedAmount.toLocaleString()}` : ''
    }.`,
    occurredAtIso,
    action,
  };
}
