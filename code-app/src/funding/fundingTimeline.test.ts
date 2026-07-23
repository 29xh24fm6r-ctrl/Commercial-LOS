import { describe, it, expect } from 'vitest';
import { buildFundingTimelineEntry } from './fundingTimeline';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

const rec: FundingAuthorizationRecord = {
  recordId: 'rec-1',
  dealId: 'deal-1',
  authorizationStatus: 'APPROVED',
  requestedAmount: 500_000,
  approvedAmount: 450_000,
  destinationVerificationStatus: 'verified',
  conditionsSatisfied: true,
  exceptions: [],
  requestedBy: 'requester@bank.test',
  requestedAt: '2026-07-01T00:00:00.000Z',
  correlationId: 'corr-1',
  supportingDocumentIds: [],
  auditEventIds: [],
};

describe('buildFundingTimelineEntry', () => {
  it('includes both requested and approved amounts when both are known', () => {
    const entry = buildFundingTimelineEntry(rec, 'fully_approved', '2026-07-02T00:00:00.000Z');
    expect(entry.title).toBe('Funding approved');
    expect(entry.summary).toBe('Funding approved — requested $500,000, approved $450,000.');
    expect(entry.dealId).toBe('deal-1');
    expect(entry.occurredAtIso).toBe('2026-07-02T00:00:00.000Z');
  });

  it('omits the approved-amount clause when no amount has been approved yet', () => {
    const requested = { ...rec, approvedAmount: undefined };
    const entry = buildFundingTimelineEntry(requested, 'requested', '2026-07-01T00:00:00.000Z');
    expect(entry.summary).toBe('Funding requested — requested $500,000.');
  });

  it('has a distinct title for every action', () => {
    const actions = ['requested', 'first_approval', 'fully_approved', 'rejected', 'revoked', 'funded'] as const;
    const titles = actions.map((a) => buildFundingTimelineEntry(rec, a, '2026-07-01T00:00:00.000Z').title);
    expect(new Set(titles).size).toBe(actions.length);
  });
});
