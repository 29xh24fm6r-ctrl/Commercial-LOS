import { describe, it, expect, vi } from 'vitest';
import { recordClosingDocumentGenerationAudit } from './closingDocumentAudit';
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

describe('recordClosingDocumentGenerationAudit', () => {
  it('records the audit when the actor resolves to a real cr664_user bind', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });
    const emitAudit = vi.fn(async () => ({ success: true }));
    const result = await recordClosingDocumentGenerationAudit(manifest, resolve, emitAudit);
    expect(result).toEqual({ recorded: true });
    expect(emitAudit).toHaveBeenCalledWith({ manifest, changedByBind: '/cr664_users(core-1)' });
  });

  it('fails closed (never POSTs) when the actor cannot be resolved', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: false, reason: 'no platform-user match' });
    const emitAudit = vi.fn(async () => ({ success: true }));
    const result = await recordClosingDocumentGenerationAudit(manifest, resolve, emitAudit);
    expect(result.recorded).toBe(false);
    expect(result.error).toBe('no platform-user match');
    expect(emitAudit).not.toHaveBeenCalled();
  });

  it('throws (via assertChangedByCoreUserBind) rather than ever emit a /systemusers bind', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/systemusers(sys-1)' });
    const emitAudit = vi.fn(async () => ({ success: true }));
    await expect(recordClosingDocumentGenerationAudit(manifest, resolve, emitAudit)).rejects.toThrow(/systemusers/);
    expect(emitAudit).not.toHaveBeenCalled();
  });

  it('reports the emit error honestly when the audit write itself fails', async () => {
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });
    const emitAudit = vi.fn(async () => ({ success: false, error: 'audit table rejected write' }));
    const result = await recordClosingDocumentGenerationAudit(manifest, resolve, emitAudit);
    expect(result).toEqual({ recorded: false, error: 'audit table rejected write' });
  });

  it('reports a thrown resolver error honestly rather than propagating an unhandled rejection', async () => {
    const resolve: ResolveActorChangedBy = async () => {
      throw new Error('resolver blew up');
    };
    const emitAudit = vi.fn(async () => ({ success: true }));
    const result = await recordClosingDocumentGenerationAudit(manifest, resolve, emitAudit);
    expect(result).toEqual({ recorded: false, error: 'resolver blew up' });
  });
});
