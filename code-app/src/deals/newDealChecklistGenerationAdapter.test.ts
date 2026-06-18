import { describe, it, expect, vi } from 'vitest';
import {
  generateAuditedDocumentChecklist,
  createChecklistGenerationAuditEmitter,
  DOCUMENT_CHECKLIST_ALLOWED_FIELDS,
  type AuditedChecklistDeps,
  type ChecklistRowPayload,
  type ChecklistAuditEvent,
} from './newDealChecklistGenerationAdapter';
import type { ResolveActorChangedBy } from './newDealAuditActorResolver';

/**
 * Phase 188C — the audited, fail-closed document-checklist generator. Disabled
 * by default; idempotent; allow-listed payload; audit binds /cr664_users only
 * (never /systemusers) and emits ONLY after every intended row is created.
 */

function baseInput(over: Partial<Parameters<typeof generateAuditedDocumentChecklist>[0]> = {}) {
  return {
    dealId: 'deal-1',
    authorized: true,
    actorSystemUserId: 'sys-1',
    actorEmail: 'banker@bank.test',
    templateDocumentNames: ['Tax Return', 'Debt Schedule'],
    enabledOverride: true,
    ...over,
  };
}

function deps(over: Partial<AuditedChecklistDeps> = {}): {
  d: AuditedChecklistDeps;
  created: ChecklistRowPayload[];
  auditCalls: ChecklistAuditEvent[];
} {
  const created: ChecklistRowPayload[] = [];
  const auditCalls: ChecklistAuditEvent[] = [];
  const d: AuditedChecklistDeps = {
    listExistingChecklistRows: async () => ({ ok: true, names: [] }),
    createChecklistRow: async (p) => {
      created.push(p);
      return { ok: true, id: `row-${created.length}` };
    },
    emitChecklistGenerationAudit: async (e) => {
      auditCalls.push(e);
      return { ok: true };
    },
    correlationId: () => 'corr-fixed',
    ...over,
  };
  return { d, created, auditCalls };
}

describe('generateAuditedDocumentChecklist — disabled gate', () => {
  it('disabled (gate off) creates no rows, emits no audit, reports honestly', async () => {
    const { d, created, auditCalls } = deps();
    const out = await generateAuditedDocumentChecklist(baseInput({ enabledOverride: false }), d);
    expect(out.kind).toBe('disabled');
    expect(created).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('blocks when unauthorized / no deal, no IO', async () => {
    const { d, created } = deps();
    expect((await generateAuditedDocumentChecklist(baseInput({ authorized: false }), d)).kind).toBe('unauthorized');
    expect((await generateAuditedDocumentChecklist(baseInput({ dealId: undefined }), d)).kind).toBe('dependency_not_ready');
    expect(created).toHaveLength(0);
  });
});

describe('idempotency', () => {
  it('skips existing names (trim + case-insensitive) and creates only the missing', async () => {
    const { d, created, auditCalls } = deps({
      listExistingChecklistRows: async () => ({ ok: true, names: ['  tax return '] }),
    });
    const out = await generateAuditedDocumentChecklist(baseInput(), d);
    expect(out.kind).toBe('success');
    expect(created.map((p) => p.cr664_documentname)).toEqual(['Debt Schedule']);
    expect(auditCalls[0]!.createdNames).toEqual(['Debt Schedule']);
    expect(auditCalls[0]!.skippedNames).toEqual(['Tax Return']);
  });

  it('all names already present -> skipped_duplicate_detected, no creates, no audit', async () => {
    const { d, created, auditCalls } = deps({
      listExistingChecklistRows: async () => ({ ok: true, names: ['tax return', 'debt schedule'] }),
    });
    const out = await generateAuditedDocumentChecklist(baseInput(), d);
    expect(out.kind).toBe('skipped_duplicate_detected');
    expect(created).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('duplicate requested names do not create duplicate rows', async () => {
    const { d, created } = deps();
    const out = await generateAuditedDocumentChecklist(
      baseInput({ templateDocumentNames: ['Doc A', 'doc a', ' Doc B '] }),
      d,
    );
    expect(out.kind).toBe('success');
    expect(created.map((p) => p.cr664_documentname)).toEqual(['Doc A', 'Doc B']);
  });
});

describe('payload allow-list', () => {
  it('every create payload contains ONLY the approved fields (no correlationid/documenttype/stage/status/portfolio/crm/borrower)', async () => {
    const { d, created } = deps();
    await generateAuditedDocumentChecklist(baseInput(), d);
    for (const p of created) {
      // Phase 188G: the row payload is exactly two fields; correlationid is
      // audit-only (not a column on cr664_documentchecklists).
      expect(Object.keys(p).sort()).toEqual(
        ['cr664_Deal@odata.bind', 'cr664_documentname'],
      );
      for (const key of Object.keys(p)) {
        expect(DOCUMENT_CHECKLIST_ALLOWED_FIELDS).toContain(key);
      }
      expect(p).not.toHaveProperty('cr664_correlationid');
      expect(p).not.toHaveProperty('cr664_documenttype');
      const blob = JSON.stringify(p);
      expect(blob).not.toMatch(/cr664_(stage|status|portfolio|stagereference|statusreference)/i);
      expect(blob).not.toMatch(/email|phone|borrower|recipient/i);
      expect(p['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    }
  });

  it('the audit event still carries the correlation id (audit-only)', async () => {
    const { d, auditCalls } = deps();
    await generateAuditedDocumentChecklist(baseInput(), d);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.correlationId).toBe('corr-fixed');
  });
});

describe('audit emits only after all rows succeed', () => {
  it('success path: rows created then exactly one audit with created/skipped + correlation id', async () => {
    const { d, created, auditCalls } = deps();
    const out = await generateAuditedDocumentChecklist(baseInput(), d);
    expect(out.kind).toBe('success');
    expect(created).toHaveLength(2);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.correlationId).toBe('corr-fixed');
    expect(auditCalls[0]!.createdNames).toEqual(['Tax Return', 'Debt Schedule']);
  });
});

describe('failure handling — fail closed, never fake success', () => {
  it('list-existing failure -> failed, no creates, no audit', async () => {
    const { d, created, auditCalls } = deps({
      listExistingChecklistRows: async () => ({ ok: false, error: 'boom' }),
    });
    const out = await generateAuditedDocumentChecklist(baseInput(), d);
    expect(out.kind).toBe('failed');
    expect(created).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('FIRST create failure -> failed, no audit', async () => {
    const { d, auditCalls } = deps({ createChecklistRow: async () => ({ ok: false, error: 'create boom' }) });
    const out = await generateAuditedDocumentChecklist(baseInput(), d);
    expect(out.kind).toBe('failed');
    expect(auditCalls).toHaveLength(0);
  });

  it('LATER create failure -> partial_success, no audit', async () => {
    let n = 0;
    const { d, auditCalls } = deps({
      createChecklistRow: async () => {
        n += 1;
        return n === 1 ? { ok: true, id: 'r1' } : { ok: false, error: 'second boom' };
      },
    });
    const out = await generateAuditedDocumentChecklist(baseInput(), d);
    expect(out.kind).toBe('partial_success');
    expect(auditCalls).toHaveLength(0);
  });

  it('a create that throws is caught and fails closed (no audit)', async () => {
    const { d, auditCalls } = deps({
      createChecklistRow: async () => { throw new Error('io down'); },
    });
    const out = await generateAuditedDocumentChecklist(baseInput(), d);
    expect(out.kind).toBe('failed');
    expect(auditCalls).toHaveLength(0);
  });

  it('audit failure after all rows created -> audit_failed_partial (not success)', async () => {
    const { d } = deps({ emitChecklistGenerationAudit: async () => ({ ok: false, error: 'audit boom' }) });
    const out = await generateAuditedDocumentChecklist(baseInput(), d);
    expect(out.kind).toBe('audit_failed_partial');
  });
});

describe('createChecklistGenerationAuditEmitter — /cr664_users guard', () => {
  const event: ChecklistAuditEvent = {
    dealId: 'deal-1',
    createdNames: ['Tax Return'],
    skippedNames: [],
    correlationId: 'corr-1',
    actorEmail: 'banker@bank.test',
  };

  it('binds cr664_ChangedBy to /cr664_users(<CoreUser>) and POSTs', async () => {
    let posted: Record<string, unknown> | null = null;
    const resolve: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });
    const emit = createChecklistGenerationAuditEmitter({
      resolveActorChangedBy: resolve,
      createAudit: async (p) => { posted = p; return { success: true }; },
      now: () => '2026-06-17T00:00:00.000Z',
    });
    const out = await emit(event);
    expect(out.ok).toBe(true);
    expect(posted!['cr664_ChangedBy@odata.bind']).toBe('/cr664_users(core-1)');
    expect(JSON.stringify(posted)).not.toMatch(/systemusers/);
  });

  it('fails closed (no POST) when the actor cannot resolve to a cr664_user', async () => {
    const createAudit = vi.fn(async () => ({ success: true }));
    const emit = createChecklistGenerationAuditEmitter({
      resolveActorChangedBy: async () => ({ ok: false, reason: 'no platform-user identity matched' }),
      createAudit,
    });
    const out = await emit(event);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/audit blocked/i);
    expect(createAudit).not.toHaveBeenCalled();
  });

  it('REJECTS a /systemusers bind via assertChangedByCoreUserBind (never POSTs it)', async () => {
    const createAudit = vi.fn(async () => ({ success: true }));
    const emit = createChecklistGenerationAuditEmitter({
      resolveActorChangedBy: async () => ({ ok: true, changedByBind: '/systemusers(sys-1)' }),
      createAudit,
    });
    await expect(emit(event)).rejects.toThrow(/systemusers/);
    expect(createAudit).not.toHaveBeenCalled();
  });

  it('surfaces a failed audit POST honestly', async () => {
    const emit = createChecklistGenerationAuditEmitter({
      resolveActorChangedBy: async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' }),
      createAudit: async () => ({ success: false, error: { message: 'POST 400' } }),
    });
    const out = await emit(event);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/POST 400/);
  });
});
