import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Cr664_auditeventsService } from '../../generated/services/Cr664_auditeventsService';
import { liveEmitClosingDocumentAudit } from './closingDocumentAuditLiveDeps';
import type { ClosingDocumentAuditEvent } from './closingDocumentAudit';

vi.mock('../../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));

const create = vi.mocked(Cr664_auditeventsService.create);

const event: ClosingDocumentAuditEvent = {
  changedByBind: '/cr664_users(user-1)',
  manifest: {
    manifestId: 'manifest-1',
    templateKey: 'closing_checklist',
    templateVersion: '1.0',
    dealId: 'deal-1',
    generatedAtIso: '2026-07-28T12:00:00.000Z',
    generatedByActorEmail: 'banker@oldglorybank.com',
    contentHash: 'hash-1',
    correlationId: 'cd-1',
    status: 'final' as const,
  },
};

beforeEach(() => create.mockReset());

describe('liveEmitClosingDocumentAudit', () => {
  it('creates attributed lifecycle evidence linked to the deal and manifest', async () => {
    create.mockResolvedValue({ success: true, data: {} } as never);
    await expect(liveEmitClosingDocumentAudit(event)).resolves.toEqual({ success: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        cr664_entityid: 'deal-1',
        cr664_relatedentityid: 'manifest-1',
        cr664_correlationid: 'cd-1',
        'cr664_ChangedBy@odata.bind': '/cr664_users(user-1)',
        'cr664_LoanDeal@odata.bind': '/cr664_loandeals(deal-1)',
      }),
    );
  });

  it('returns a non-success so the caller can report partial evidence', async () => {
    create.mockResolvedValue({ success: false, error: { message: 'audit denied' } } as never);
    await expect(liveEmitClosingDocumentAudit(event)).resolves.toEqual({
      success: false,
      error: 'audit denied',
    });
  });
});
