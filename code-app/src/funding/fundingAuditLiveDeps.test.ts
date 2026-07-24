import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));

import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { emitLiveFundingAudit } from './fundingAuditLiveDeps';

const auditCreateMock = vi.mocked(Cr664_auditeventsService.create);

const record: FundingAuthorizationRecord = {
  dealId: 'deal-1', authorizationStatus: 'FUNDED', requestedAmount: 100000, approvedAmount: 100000,
  destinationVerificationStatus: 'verified', conditionsSatisfied: true, exceptions: [],
  requestedBy: 'banker@bank.test', requestedAt: '2026-07-01T00:00:00Z', correlationId: 'corr-1',
  supportingDocumentIds: [], auditEventIds: [], recordId: 'fa-1',
};

beforeEach(() => {
  auditCreateMock.mockReset();
});

describe('Factory Arc Phase 13 — emitLiveFundingAudit (closes the "no live audit sink" gap)', () => {
  it('writes a real cr664_AuditEvent bound to /cr664_users(...) on success', async () => {
    auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } } as never);
    const result = await emitLiveFundingAudit({ record, action: 'funded', changedByBind: '/cr664_users(u-1)' });
    expect(result).toEqual({ success: true, id: 'a-1' });
    const payload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/cr664_users(u-1)');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(payload.cr664_auditeventname).toBe('Funds Disbursed');
    expect(payload.cr664_newvalue).toBe('FUNDED');
    expect(payload.cr664_correlationid).toBe('corr-1');
  });

  it('reports a non-success create honestly, including the payload shape summary', async () => {
    auditCreateMock.mockResolvedValue({ success: false, error: { message: 'field validation failed' } } as never);
    const result = await emitLiveFundingAudit({ record, action: 'requested', changedByBind: '/cr664_users(u-1)' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/field validation failed/);
  });

  it('catches a thrown SDK error', async () => {
    auditCreateMock.mockRejectedValue(new Error('network down'));
    const result = await emitLiveFundingAudit({ record, action: 'rejected', changedByBind: '/cr664_users(u-1)' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network down/);
  });

  it('rejects a systemuser bind rather than ever writing one — targets cr664_user only', async () => {
    await expect(
      emitLiveFundingAudit({ record, action: 'first_approval', changedByBind: '/systemusers(u-1)' }),
    ).rejects.toThrow(/cr664_user/);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('every FundingAuditAction maps to a distinct, real event name', async () => {
    auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } } as never);
    const actions = ['requested', 'first_approval', 'fully_approved', 'rejected', 'revoked', 'funded'] as const;
    const names = new Set<string>();
    for (const action of actions) {
      await emitLiveFundingAudit({ record, action, changedByBind: '/cr664_users(u-1)' });
      const payload = auditCreateMock.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(typeof payload.cr664_auditeventname).toBe('string');
      expect((payload.cr664_auditeventname as string).length).toBeGreaterThan(0);
      names.add(payload.cr664_auditeventname as string);
    }
    expect(names.size).toBe(actions.length);
  });
});
