import { describe, it, expect, vi } from 'vitest';
import {
  writeDealReferenceValue,
  type DealReferenceWriteAction,
  type DealReferenceWriteDeps,
  type DealReferenceAdminRow,
} from './dealReferenceValueWrite';
import {
  DEAL_REFERENCE_CATEGORY_COLUMN,
  DEAL_REFERENCE_CATEGORY_OPTION,
  categoryForOptionValue,
} from '../shared/governance/dealReferenceCategories';

/**
 * Governed admin Deal Reference value write.
 *
 * Pins the discipline: fail-closed authorization + identity, actor resolved
 * BEFORE any mutation, uniqueness (code in category / active name in category),
 * readback verification, honest audit (Succeeded on verified write; best-effort
 * Failed audit + audit-failed outcome on failure). Pure over injected deps.
 */

const PT = DEAL_REFERENCE_CATEGORY_OPTION.productType;
const ACTOR_BIND = '/cr664_users(11111111-1111-1111-1111-111111111111)';
const AUTH: { actorEmail: string; actorSystemUserId: string | undefined; authorized: boolean } = {
  actorEmail: 'admin@bank.test',
  actorSystemUserId: 'sys-1',
  authorized: true,
};

/** In-memory backend so create/update/readback behave realistically. */
function makeBackend(seed: DealReferenceAdminRow[] = []) {
  const store = new Map<string, DealReferenceAdminRow>();
  for (const r of seed) store.set(r.id, r);
  let counter = 0;

  const deps: DealReferenceWriteDeps = {
    listCategoryRows: vi.fn(async (cv: number) => ({
      success: true,
      rows: [...store.values()].filter((r) => r.categoryValue === cv),
    })),
    getRow: vi.fn(async (id: string) => {
      const row = store.get(id);
      return row ? { success: true, row } : { success: false, error: { message: 'not found' } };
    }),
    createRow: vi.fn(async (payload: Record<string, unknown>) => {
      const id = `new-${++counter}`;
      const cv = payload[DEAL_REFERENCE_CATEGORY_COLUMN] as number;
      store.set(id, {
        id,
        name: payload.cr664_name as string,
        code: payload.cr664_code as string,
        category: categoryForOptionValue(cv),
        categoryValue: cv,
        active: payload.cr664_activeflag !== false,
        sortOrder: payload.cr664_sortorder as number | undefined,
      });
      return { success: true, id };
    }),
    updateRow: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const row = store.get(id);
      if (!row) return { success: false, error: { message: 'not found' } };
      const next = { ...row };
      if ('cr664_name' in patch) next.name = patch.cr664_name as string;
      if ('cr664_code' in patch) next.code = patch.cr664_code as string;
      if ('cr664_sortorder' in patch) next.sortOrder = patch.cr664_sortorder as number;
      if ('cr664_activeflag' in patch) next.active = patch.cr664_activeflag as boolean;
      store.set(id, next);
      return { success: true };
    }),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    resolveActorChangedBy: vi.fn(async () => ({ ok: true, changedByBind: ACTOR_BIND })),
  };
  return { store, deps };
}

function row(over: Partial<DealReferenceAdminRow> & { id: string }): DealReferenceAdminRow {
  return { name: 'X', code: 'X', category: 'productType', categoryValue: PT, active: true, ...over };
}

function run(action: DealReferenceWriteAction, deps: DealReferenceWriteDeps, over: Partial<typeof AUTH> = {}) {
  return writeDealReferenceValue({ action, ...AUTH, ...over }, deps);
}

describe('writeDealReferenceValue — authorization + identity (fail-closed)', () => {
  it('refuses an unauthorized caller and mutates nothing', async () => {
    const { store, deps } = makeBackend();
    const r = await run({ kind: 'create', category: 'productType', name: 'Equipment', code: 'EQUIP' }, deps, { authorized: false });
    expect(r.kind).toBe('unauthorized');
    expect(store.size).toBe(0);
    expect(deps.createRow).not.toHaveBeenCalled();
  });

  it('refuses when no Dataverse systemuser identity is present', async () => {
    const { deps } = makeBackend();
    const r = await run({ kind: 'create', category: 'productType', name: 'Equipment', code: 'EQUIP' }, deps, { actorSystemUserId: undefined });
    expect(r.kind).toBe('identity-unresolved');
    expect(deps.createRow).not.toHaveBeenCalled();
  });

  it('does NOT mutate when the auditable actor cannot be resolved', async () => {
    const { store, deps } = makeBackend();
    (deps.resolveActorChangedBy as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: 'no cr664_user' });
    const r = await run({ kind: 'create', category: 'productType', name: 'Equipment', code: 'EQUIP' }, deps);
    expect(r.kind).toBe('identity-unresolved');
    expect(store.size).toBe(0);
    expect(deps.createRow).not.toHaveBeenCalled();
  });
});

describe('writeDealReferenceValue — create', () => {
  it('validates category, name, and code', async () => {
    const { deps } = makeBackend();
    expect((await run({ kind: 'create', category: 'nope', name: 'A', code: 'A' }, deps)).kind).toBe('invalid-input');
    expect((await run({ kind: 'create', category: 'productType', name: '  ', code: 'A' }, deps)).kind).toBe('invalid-input');
    expect((await run({ kind: 'create', category: 'productType', name: 'A', code: '  ' }, deps)).kind).toBe('invalid-input');
  });

  it('creates a categorized, active row + audits it (Configuration event)', async () => {
    const { store, deps } = makeBackend();
    const r = await run({ kind: 'create', category: 'productType', name: 'Equipment', code: 'EQUIP', sortOrder: 10 }, deps);
    expect(r.kind).toBe('success');
    if (r.kind === 'success') expect(r.action).toBe('create');
    // The stored row carries the category discriminator + active flag.
    const created = [...store.values()][0];
    expect(created).toMatchObject({ name: 'Equipment', code: 'EQUIP', categoryValue: PT, active: true, sortOrder: 10 });
    // Audit: Configuration category + AdminConfigurationChange + ChangedBy core-user bind + correlation id.
    const auditPayload = (deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(auditPayload).toMatchObject({
      cr664_eventcategory: 788190005,
      cr664_eventtype: 788190007,
      cr664_entitytype: 788190005,
      cr664_outcomestatus: 788190000,
      'cr664_ChangedBy@odata.bind': ACTOR_BIND,
    });
    expect(auditPayload.cr664_correlationid).toBeTruthy();
  });

  it('rejects a duplicate code within the category (never creates)', async () => {
    const { store, deps } = makeBackend([row({ id: 'r1', code: 'EQUIP', name: 'Equipment' })]);
    const r = await run({ kind: 'create', category: 'productType', name: 'Different', code: 'equip' }, deps);
    expect(r.kind).toBe('duplicate');
    expect(store.size).toBe(1);
    expect(deps.createRow).not.toHaveBeenCalled();
  });

  it('rejects a duplicate ACTIVE display name within the category', async () => {
    const { deps } = makeBackend([row({ id: 'r1', code: 'EQUIP', name: 'Equipment' })]);
    const r = await run({ kind: 'create', category: 'productType', name: 'equipment', code: 'EQUIP2' }, deps);
    expect(r.kind).toBe('duplicate');
  });

  it('emits a Failed audit and returns readback-mismatch when the create does not read back', async () => {
    const { deps } = makeBackend();
    // getRow returns a row that does not match what we wrote.
    (deps.getRow as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, row: row({ id: 'new-1', name: 'WRONG', code: 'WRONG', categoryValue: PT }) });
    const r = await run({ kind: 'create', category: 'productType', name: 'Equipment', code: 'EQUIP' }, deps);
    expect(r.kind).toBe('readback-mismatch');
    // A best-effort Failed audit (788190001) was emitted.
    const failed = (deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[0].cr664_outcomestatus === 788190001);
    expect(failed).toBe(true);
  });

  it('returns audit-failed (never a clean success) when the Succeeded audit fails', async () => {
    const { deps } = makeBackend();
    (deps.emitAudit as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: { message: 'audit down' } });
    const r = await run({ kind: 'create', category: 'productType', name: 'Equipment', code: 'EQUIP' }, deps);
    expect(r.kind).toBe('audit-failed');
  });
});

describe('writeDealReferenceValue — update', () => {
  it('rejects an empty change set', async () => {
    const { deps } = makeBackend([row({ id: 'r1' })]);
    expect((await run({ kind: 'update', id: 'r1' }, deps)).kind).toBe('invalid-input');
  });

  it('returns not-found for a missing row', async () => {
    const { deps } = makeBackend();
    expect((await run({ kind: 'update', id: 'ghost', name: 'X' }, deps)).kind).toBe('not-found');
  });

  it('rejects a rename that collides with another code in the category', async () => {
    const { deps } = makeBackend([
      row({ id: 'r1', code: 'EQUIP', name: 'Equipment' }),
      row({ id: 'r2', code: 'TERM', name: 'Term Loan' }),
    ]);
    const r = await run({ kind: 'update', id: 'r2', code: 'EQUIP' }, deps);
    expect(r.kind).toBe('duplicate');
  });

  it('updates only the provided fields + readback confirms', async () => {
    const { store, deps } = makeBackend([row({ id: 'r1', code: 'EQUIP', name: 'Equipment', sortOrder: 10 })]);
    const r = await run({ kind: 'update', id: 'r1', name: 'Equipment Finance', sortOrder: 5 }, deps);
    expect(r.kind).toBe('success');
    if (r.kind === 'success') expect(r.action).toBe('update');
    expect(store.get('r1')).toMatchObject({ name: 'Equipment Finance', code: 'EQUIP', sortOrder: 5 });
  });
});

describe('writeDealReferenceValue — deactivate / reactivate', () => {
  it('deactivates an active value', async () => {
    const { store, deps } = makeBackend([row({ id: 'r1', active: true })]);
    const r = await run({ kind: 'deactivate', id: 'r1' }, deps);
    expect(r.kind).toBe('success');
    if (r.kind === 'success') expect(r.action).toBe('deactivate');
    expect(store.get('r1')?.active).toBe(false);
  });

  it('blocks reactivation that would collide with a live value', async () => {
    const { deps } = makeBackend([
      row({ id: 'r1', code: 'EQUIP', name: 'Equipment', active: false }),
      row({ id: 'r2', code: 'EQUIP', name: 'Equipment', active: true }),
    ]);
    const r = await run({ kind: 'reactivate', id: 'r1' }, deps);
    expect(r.kind).toBe('duplicate');
  });

  it('reactivates when there is no live collision', async () => {
    const { store, deps } = makeBackend([row({ id: 'r1', code: 'EQUIP', name: 'Equipment', active: false })]);
    const r = await run({ kind: 'reactivate', id: 'r1' }, deps);
    expect(r.kind).toBe('success');
    expect(store.get('r1')?.active).toBe(true);
  });
});
