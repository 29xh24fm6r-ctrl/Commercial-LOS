import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('./newDealAuditActorResolver', () => ({
  createActorChangedByResolver: vi.fn(),
}));

import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { createActorChangedByResolver } from './newDealAuditActorResolver';
import { buildLiveChecklistRowTransport, buildLiveChecklistAuditSink } from './checklistLiveWriteDeps';

const createChecklistRowMock = vi.mocked(Cr664_documentchecklistsService.create);
const createAuditMock = vi.mocked(Cr664_auditeventsService.create);
const resolverFactoryMock = vi.mocked(createActorChangedByResolver);

beforeEach(() => {
  createChecklistRowMock.mockReset();
  createAuditMock.mockReset();
  resolverFactoryMock.mockReset();
});

describe('buildLiveChecklistRowTransport', () => {
  it('creates a row with only the allow-listed payload and returns the new id', async () => {
    createChecklistRowMock.mockResolvedValue({
      success: true,
      data: { cr664_documentchecklistid: 'row-1' },
    } as never);
    const transport = buildLiveChecklistRowTransport();
    const result = await transport.createChecklistRow({ documentName: 'Tax Returns', dealBind: '/cr664_loandeals(d-1)' });
    expect(result).toEqual({ ok: true, id: 'row-1' });
    expect(createChecklistRowMock).toHaveBeenCalledWith({
      cr664_documentname: 'Tax Returns',
      'cr664_Deal@odata.bind': '/cr664_loandeals(d-1)',
    });
  });

  it('reports a non-success create as a failure, never a fake success', async () => {
    createChecklistRowMock.mockResolvedValue({ success: false, error: { message: 'field rejected' } } as never);
    const transport = buildLiveChecklistRowTransport();
    const result = await transport.createChecklistRow({ documentName: 'UCC', dealBind: '/cr664_loandeals(d-1)' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('field rejected');
  });

  it('catches a thrown error from the SDK call', async () => {
    createChecklistRowMock.mockRejectedValue(new Error('network down'));
    const transport = buildLiveChecklistRowTransport();
    const result = await transport.createChecklistRow({ documentName: 'UCC', dealBind: '/cr664_loandeals(d-1)' });
    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});

describe('buildLiveChecklistAuditSink', () => {
  function audit(overrides: Partial<Parameters<ReturnType<typeof buildLiveChecklistAuditSink>['write']>[0]> = {}) {
    return {
      correlationId: 'corr-1',
      dealId: 'deal-1',
      documentName: 'Tax Returns',
      outcome: 'created' as const,
      error: null,
      ...overrides,
    };
  }

  it('fails closed when the actor cannot be resolved to a cr664_user — never writes an audit', async () => {
    resolverFactoryMock.mockReturnValue(vi.fn().mockResolvedValue({ ok: false, reason: 'no match' }));
    const sink = buildLiveChecklistAuditSink('banker@oldglorybank.com');
    const result = await sink.write(audit());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no match');
    expect(createAuditMock).not.toHaveBeenCalled();
  });

  it('writes a created-row audit bound to /cr664_users(...) on success', async () => {
    resolverFactoryMock.mockReturnValue(
      vi.fn().mockResolvedValue({ ok: true, changedByBind: '/cr664_users(u-1)' }),
    );
    createAuditMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } } as never);
    const sink = buildLiveChecklistAuditSink('banker@oldglorybank.com');
    const result = await sink.write(audit());
    expect(result.ok).toBe(true);
    const payload = createAuditMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/cr664_users(u-1)');
    expect(payload.cr664_notes).toContain('Tax Returns');
  });

  it('writes a failed-row audit with the failure reason recorded', async () => {
    resolverFactoryMock.mockReturnValue(
      vi.fn().mockResolvedValue({ ok: true, changedByBind: '/cr664_users(u-1)' }),
    );
    createAuditMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-2' } } as never);
    const sink = buildLiveChecklistAuditSink('banker@oldglorybank.com');
    const result = await sink.write(audit({ outcome: 'failed', error: 'row create failed' }));
    expect(result.ok).toBe(true);
    const payload = createAuditMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_failurereason).toBe('row create failed');
  });

  it('reports a non-success audit create honestly', async () => {
    resolverFactoryMock.mockReturnValue(
      vi.fn().mockResolvedValue({ ok: true, changedByBind: '/cr664_users(u-1)' }),
    );
    createAuditMock.mockResolvedValue({ success: false, error: { message: 'audit rejected' } } as never);
    const sink = buildLiveChecklistAuditSink('banker@oldglorybank.com');
    const result = await sink.write(audit());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('audit rejected');
  });
});
