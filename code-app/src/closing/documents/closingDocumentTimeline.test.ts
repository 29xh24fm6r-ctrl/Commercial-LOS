import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordClosingDocumentGenerationTimeline } from './closingDocumentTimeline';
import type { GeneratedClosingDocumentManifest } from './closingDocumentTypes';
import type { ResolveActorChangedBy } from '../../deals/newDealAuditActorResolver';

const manifest: GeneratedClosingDocumentManifest = {
  manifestId: 'm-1',
  templateKey: 'closing_checklist',
  templateVersion: '1.0.0',
  dealId: 'deal-1',
  generatedAtIso: '2026-07-01T00:00:00.000Z',
  generatedByActorEmail: 'banker@bank.test',
  contentHash: 'abcd1234',
  correlationId: 'corr-1',
  status: 'final',
};

describe('recordClosingDocumentGenerationTimeline', () => {
  it('records the timeline event when the actor resolves to a real cr664_user bind', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });
    const emitTimeline = vi.fn(async () => ({ success: true }));
    const result = await recordClosingDocumentGenerationTimeline(manifest, resolve, emitTimeline);
    expect(result).toEqual({ recorded: true });
    expect(emitTimeline).toHaveBeenCalledWith({ manifest, changedByBind: '/cr664_users(core-1)' });
  });

  it('fails closed (never emits) when the actor cannot be resolved', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: false, reason: 'no platform-user match' });
    const emitTimeline = vi.fn(async () => ({ success: true }));
    const result = await recordClosingDocumentGenerationTimeline(manifest, resolve, emitTimeline);
    expect(result.recorded).toBe(false);
    expect(result.error).toBe('no platform-user match');
    expect(emitTimeline).not.toHaveBeenCalled();
  });

  it('throws (via assertChangedByCoreUserBind) rather than ever emit a /systemusers bind', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/systemusers(sys-1)' });
    const emitTimeline = vi.fn(async () => ({ success: true }));
    await expect(recordClosingDocumentGenerationTimeline(manifest, resolve, emitTimeline)).rejects.toThrow(/systemusers/);
    expect(emitTimeline).not.toHaveBeenCalled();
  });

  it('reports the emit error honestly when the timeline write itself fails', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });
    const emitTimeline = vi.fn(async () => ({ success: false, error: 'timeline table rejected write' }));
    const result = await recordClosingDocumentGenerationTimeline(manifest, resolve, emitTimeline);
    expect(result).toEqual({ recorded: false, error: 'timeline table rejected write' });
  });

  it('reports a thrown resolver error honestly rather than propagating an unhandled rejection', async () => {
    const resolve: ResolveActorChangedBy = async () => {
      throw new Error('resolver blew up');
    };
    const emitTimeline = vi.fn(async () => ({ success: true }));
    const result = await recordClosingDocumentGenerationTimeline(manifest, resolve, emitTimeline);
    expect(result).toEqual({ recorded: false, error: 'resolver blew up' });
  });
});

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('../../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: createMock },
}));

describe('liveEmitClosingDocumentTimeline', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('posts the DocumentGenerated (788190011) event type with the deal bind and eventsubtype', async () => {
    createMock.mockResolvedValueOnce({ success: true, data: { cr664_dealtimelineeventid: 't-1' } });
    const { liveEmitClosingDocumentTimeline } = await import('./closingDocumentTimeline');
    const result = await liveEmitClosingDocumentTimeline({ manifest, changedByBind: '/cr664_users(core-1)' });
    expect(result.success).toBe(true);
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_eventtype).toBe(788190011);
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(payload.cr664_eventsubtype).toBe('closingdocument:generated|correlation:corr-1');
    expect(payload['cr664_EventBy@odata.bind']).toBe('/cr664_users(core-1)');
  });

  it('fails closed (never fabricates success) when the create call reports non-success', async () => {
    createMock.mockResolvedValueOnce({ success: false, error: { message: 'row lock timeout' } });
    const { liveEmitClosingDocumentTimeline } = await import('./closingDocumentTimeline');
    const result = await liveEmitClosingDocumentTimeline({ manifest, changedByBind: '/cr664_users(core-1)' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('row lock timeout');
  });

  it('fails closed when the create call throws', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    const { liveEmitClosingDocumentTimeline } = await import('./closingDocumentTimeline');
    const result = await liveEmitClosingDocumentTimeline({ manifest, changedByBind: '/cr664_users(core-1)' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });
});
