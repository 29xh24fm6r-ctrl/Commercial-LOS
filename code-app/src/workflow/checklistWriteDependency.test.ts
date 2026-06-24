// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createChecklistWriteDependency, type ChecklistWriteDependencyConfig } from './checklistWriteDependency';

function config(over: Partial<ChecklistWriteDependencyConfig> = {}): ChecklistWriteDependencyConfig {
  return {
    enabled: true,
    authorized: true,
    dealId: 'deal-1',
    correlationId: 'corr-1',
    transport: { createChecklistRow: vi.fn(async () => ({ ok: true, id: 'row-1' })) },
    auditSink: { write: vi.fn(async () => ({ ok: true })) },
    ...over,
  };
}

describe('Phase 237E — governed checklist write dependency', () => {
  it('disabled by default (flag false) → dependency_not_ready, no write', async () => {
    const create = vi.fn(async () => ({ ok: true }));
    const dep = createChecklistWriteDependency(config({ enabled: false, transport: { createChecklistRow: create } }));
    const out = await dep.createMissingRows(['W-9']);
    expect(out.kind).toBe('dependency_not_ready');
    expect(create).not.toHaveBeenCalled();
  });

  it('unauthorized actor is blocked before any write', async () => {
    const create = vi.fn(async () => ({ ok: true }));
    const dep = createChecklistWriteDependency(config({ authorized: false, transport: { createChecklistRow: create } }));
    expect((await dep.createMissingRows(['W-9'])).kind).toBe('unauthorized');
    expect(create).not.toHaveBeenCalled();
  });

  it('missing transport/audit → dependency_not_ready (no fake success)', async () => {
    const dep = createChecklistWriteDependency(config({ transport: undefined }));
    expect((await dep.createMissingRows(['W-9'])).kind).toBe('dependency_not_ready');
  });

  it('blank names fail closed', async () => {
    expect((await createChecklistWriteDependency(config()).createMissingRows(['   ', ''])).kind).toBe('failed');
  });

  it('writes allow-listed rows (documentName + deal bind) and audits each on success', async () => {
    const create = vi.fn(async () => ({ ok: true, id: 'r' }));
    const audit = vi.fn(async () => ({ ok: true }));
    const dep = createChecklistWriteDependency(config({ transport: { createChecklistRow: create }, auditSink: { write: audit } }));
    const out = await dep.createMissingRows(['W-9', 'Articles']);
    expect(out.kind).toBe('success');
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({ documentName: 'W-9', dealBind: '/cr664_loandeals(deal-1)' });
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it('adapter failure is surfaced as failed (never fake success) and audited', async () => {
    const create = vi.fn(async () => ({ ok: false, error: 'boom' }));
    const audit = vi.fn(async () => ({ ok: true }));
    const dep = createChecklistWriteDependency(config({ transport: { createChecklistRow: create }, auditSink: { write: audit } }));
    const out = await dep.createMissingRows(['W-9']);
    expect(out.kind).toBe('failed');
    if (out.kind === 'failed') expect(out.detail).toMatch(/boom/);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
  });
});
