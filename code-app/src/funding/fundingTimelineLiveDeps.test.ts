import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { emitLiveFundingTimeline } from './fundingTimelineLiveDeps';

const timelineCreateMock = vi.mocked(Cr664_dealtimelineeventsService.create);

const record: FundingAuthorizationRecord = {
  dealId: 'deal-1', authorizationStatus: 'FUNDED', requestedAmount: 100000, approvedAmount: 100000,
  destinationVerificationStatus: 'verified', conditionsSatisfied: true, exceptions: [],
  requestedBy: 'banker@bank.test', requestedAt: '2026-07-01T00:00:00Z', correlationId: 'corr-1',
  supportingDocumentIds: [], auditEventIds: [], recordId: 'fa-1',
};

beforeEach(() => {
  timelineCreateMock.mockReset();
});

describe('Final LOS Completion arc — Workstream K: emitLiveFundingTimeline', () => {
  it('writes a real cr664_dealtimelineevent bound to the deal and the resolved cr664_user actor', async () => {
    timelineCreateMock.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } } as never);
    const result = await emitLiveFundingTimeline({
      record, action: 'funded', occurredAtIso: '2026-07-01T00:00:00Z', changedByBind: '/cr664_users(u-1)',
    });
    expect(result).toEqual({ success: true });
    const payload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['cr664_EventBy@odata.bind']).toBe('/cr664_users(u-1)');
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(payload.cr664_eventtype).toBe(788190002); // NoteLogged
    expect(payload.cr664_eventsubtype).toBe('funding:funded|correlation:corr-1');
    expect(payload.cr664_title).toBe('Funding disbursed');
  });

  it('reports a non-success create honestly', async () => {
    timelineCreateMock.mockResolvedValue({ success: false, error: { message: 'field validation failed' } } as never);
    const result = await emitLiveFundingTimeline({
      record, action: 'requested', occurredAtIso: '2026-07-01T00:00:00Z', changedByBind: '/cr664_users(u-1)',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/field validation failed/);
  });

  it('catches a thrown SDK error', async () => {
    timelineCreateMock.mockRejectedValue(new Error('network down'));
    const result = await emitLiveFundingTimeline({
      record, action: 'rejected', occurredAtIso: '2026-07-01T00:00:00Z', changedByBind: '/cr664_users(u-1)',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network down/);
  });

  it('every FundingAuditAction produces a distinct, real title', async () => {
    timelineCreateMock.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } } as never);
    const actions = ['requested', 'first_approval', 'fully_approved', 'rejected', 'revoked', 'funded'] as const;
    const titles = new Set<string>();
    for (const action of actions) {
      await emitLiveFundingTimeline({ record, action, occurredAtIso: '2026-07-01T00:00:00Z', changedByBind: '/cr664_users(u-1)' });
      const payload = timelineCreateMock.mock.calls.at(-1)![0] as Record<string, unknown>;
      titles.add(payload.cr664_title as string);
    }
    expect(titles.size).toBe(actions.length);
  });
});
