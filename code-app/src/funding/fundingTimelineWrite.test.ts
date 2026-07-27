import { describe, it, expect, vi } from 'vitest';
import { recordFundingTimeline } from './fundingTimelineWrite';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

const record: FundingAuthorizationRecord = {
  dealId: 'deal-1', authorizationStatus: 'FUNDED', requestedAmount: 100000, approvedAmount: 100000,
  destinationVerificationStatus: 'verified', conditionsSatisfied: true, exceptions: [],
  requestedBy: 'banker@bank.test', requestedAt: '2026-07-01T00:00:00Z', correlationId: 'corr-1',
  supportingDocumentIds: [], auditEventIds: [], recordId: 'fa-1',
};

describe('recordFundingTimeline', () => {
  it('records the timeline event when the actor resolves to a real cr664_user bind', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });
    const emitTimeline = vi.fn(async () => ({ success: true }));
    const result = await recordFundingTimeline(record, 'funded', 'banker@bank.test', '2026-07-01T00:00:00Z', resolve, emitTimeline);
    expect(result).toEqual({ recorded: true });
    expect(emitTimeline).toHaveBeenCalledWith({
      record, action: 'funded', occurredAtIso: '2026-07-01T00:00:00Z', changedByBind: '/cr664_users(core-1)',
    });
  });

  it('fails closed (never emits) when the actor cannot be resolved', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: false, reason: 'no platform-user match' });
    const emitTimeline = vi.fn(async () => ({ success: true }));
    const result = await recordFundingTimeline(record, 'requested', 'banker@bank.test', '2026-07-01T00:00:00Z', resolve, emitTimeline);
    expect(result.recorded).toBe(false);
    expect(result.error).toBe('no platform-user match');
    expect(emitTimeline).not.toHaveBeenCalled();
  });

  it('throws (via assertChangedByCoreUserBind) rather than ever emit a /systemusers bind', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/systemusers(sys-1)' });
    const emitTimeline = vi.fn(async () => ({ success: true }));
    await expect(
      recordFundingTimeline(record, 'first_approval', 'banker@bank.test', '2026-07-01T00:00:00Z', resolve, emitTimeline),
    ).rejects.toThrow(/systemusers/);
    expect(emitTimeline).not.toHaveBeenCalled();
  });

  it('reports the emit error honestly when the timeline write itself fails', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });
    const emitTimeline = vi.fn(async () => ({ success: false, error: 'timeline table rejected write' }));
    const result = await recordFundingTimeline(record, 'rejected', 'banker@bank.test', '2026-07-01T00:00:00Z', resolve, emitTimeline);
    expect(result).toEqual({ recorded: false, error: 'timeline table rejected write' });
  });

  it('reports a thrown resolver error honestly rather than propagating an unhandled rejection', async () => {
    const resolve: ResolveActorChangedBy = async () => {
      throw new Error('resolver blew up');
    };
    const emitTimeline = vi.fn(async () => ({ success: true }));
    const result = await recordFundingTimeline(record, 'revoked', 'banker@bank.test', '2026-07-01T00:00:00Z', resolve, emitTimeline);
    expect(result).toEqual({ recorded: false, error: 'resolver blew up' });
  });
});
