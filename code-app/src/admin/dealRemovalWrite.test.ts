import { describe, it, expect, vi } from 'vitest';
import {
  writeDealRemoval,
  type DealRemovalAction,
  type DealRemovalWriteDeps,
  type DealRemovalRow,
} from './dealRemovalWrite';

/**
 * Governed admin Deal Removal (withdraw / reinstate).
 *
 * Pins the discipline: fail-closed authorization + identity, actor resolved
 * BEFORE any mutation, a boarded deal is refused (portfolio removal owns that),
 * an already-terminal deal is refused, readback verification, honest audit
 * (Succeeded on verified write; best-effort Failed audit + audit-failed
 * outcome on failure). Pure over injected deps.
 */

const ACTOR_BIND = '/cr664_users(11111111-1111-1111-1111-111111111111)';
const AUTH: { actorEmail: string; actorSystemUserId: string | undefined; authorized: boolean } = {
  actorEmail: 'admin@bank.test',
  actorSystemUserId: 'sys-1',
  authorized: true,
};

function makeBackend(seed: DealRemovalRow[] = []) {
  const store = new Map<string, DealRemovalRow>();
  for (const r of seed) store.set(r.id, r);

  const deps: DealRemovalWriteDeps = {
    getDeal: vi.fn(async (id: string) => {
      const row = store.get(id);
      return row ? { success: true, row } : { success: false, error: { message: 'not found' } };
    }),
    updateDeal: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const row = store.get(id);
      if (!row) return { success: false, error: { message: 'not found' } };
      const bind = patch['cr664_StatusReference@odata.bind'] as string;
      const statusName = bind.includes('withdrawn-status') ? 'Withdrawn' : bind.includes('open-status') ? 'Open' : row.statusName;
      store.set(id, { ...row, statusName });
      return { success: true };
    }),
    resolveStatusBind: vi.fn(async (code: string) =>
      code === 'WITHDRAWN' ? '/cr664_dealstatusreferences(withdrawn-status)' : code === 'OPEN' ? '/cr664_dealstatusreferences(open-status)' : null,
    ),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    resolveActorChangedBy: vi.fn(async () => ({ ok: true, changedByBind: ACTOR_BIND })),
  };
  return { store, deps };
}

function row(over: Partial<DealRemovalRow> & { id: string }): DealRemovalRow {
  return { name: 'Acme Term Loan', statusName: 'Underwriting', closed: false, active: true, ...over };
}

function run(action: DealRemovalAction, deps: DealRemovalWriteDeps, over: Partial<typeof AUTH> = {}) {
  return writeDealRemoval({ action, ...AUTH, ...over }, deps);
}

describe('writeDealRemoval — authorization + identity (fail-closed)', () => {
  it('refuses an unauthorized caller and mutates nothing', async () => {
    const { store, deps } = makeBackend([row({ id: 'd1' })]);
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'duplicate entry' }, deps, { authorized: false });
    expect(r.kind).toBe('unauthorized');
    expect(store.get('d1')!.statusName).toBe('Underwriting');
    expect(deps.updateDeal).not.toHaveBeenCalled();
  });

  it('refuses when no Dataverse systemuser identity is present', async () => {
    const { deps } = makeBackend([row({ id: 'd1' })]);
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'x' }, deps, { actorSystemUserId: undefined });
    expect(r.kind).toBe('identity-unresolved');
    expect(deps.updateDeal).not.toHaveBeenCalled();
  });

  it('does NOT mutate when the auditable actor cannot be resolved', async () => {
    const { store, deps } = makeBackend([row({ id: 'd1' })]);
    (deps.resolveActorChangedBy as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: 'no cr664_user' });
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'x' }, deps);
    expect(r.kind).toBe('identity-unresolved');
    expect(store.get('d1')!.statusName).toBe('Underwriting');
    expect(deps.updateDeal).not.toHaveBeenCalled();
  });
});

describe('writeDealRemoval — withdraw', () => {
  it('requires a non-blank reason', async () => {
    const { deps } = makeBackend([row({ id: 'd1' })]);
    expect((await run({ kind: 'withdraw', dealId: 'd1', reason: '  ' }, deps)).kind).toBe('invalid-input');
  });

  it('requires a selected deal', async () => {
    const { deps } = makeBackend([]);
    expect((await run({ kind: 'withdraw', dealId: '', reason: 'x' }, deps)).kind).toBe('invalid-input');
  });

  it('refuses a deal that is already boarded to the portfolio', async () => {
    const { store, deps } = makeBackend([row({ id: 'd1', closed: true, statusName: 'Boarded' })]);
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'x' }, deps);
    expect(r.kind).toBe('already-boarded');
    expect(store.get('d1')!.statusName).toBe('Boarded');
    expect(deps.updateDeal).not.toHaveBeenCalled();
  });

  it('refuses a deal already withdrawn or declined', async () => {
    const { deps } = makeBackend([row({ id: 'd1', statusName: 'Declined' })]);
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'x' }, deps);
    expect(r.kind).toBe('already-terminal');
    expect(deps.updateDeal).not.toHaveBeenCalled();
  });

  it('withdraws an in-flight deal and audits it (Lifecycle/StatusChange event)', async () => {
    const { store, deps } = makeBackend([row({ id: 'd1' })]);
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'duplicate entry, created in error' }, deps);
    expect(r.kind).toBe('success');
    expect(store.get('d1')!.statusName).toBe('Withdrawn');
    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
    const payload = (deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_eventcategory).toBe(788190002);
    expect(payload.cr664_eventtype).toBe(788190001);
    expect(payload.cr664_entitytype).toBe(788190000);
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(d1)');
    expect(payload.cr664_notes).toContain('duplicate entry, created in error');
  });

  it('reports status-not-seeded fail-closed when WITHDRAWN is unseeded', async () => {
    const { deps } = makeBackend([row({ id: 'd1' })]);
    (deps.resolveStatusBind as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'x' }, deps);
    expect(r.kind).toBe('status-not-seeded');
    expect(deps.updateDeal).not.toHaveBeenCalled();
  });

  it('reports readback-mismatch and still emits a Failed audit when the write does not persist', async () => {
    const { deps } = makeBackend([row({ id: 'd1' })]);
    // Update reports success but never actually changes the stored status —
    // simulates a silent no-op write; readback must catch it.
    (deps.updateDeal as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'x' }, deps);
    expect(r.kind).toBe('readback-mismatch');
    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
    expect((deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0].cr664_outcomestatus).toBe(788190001);
  });

  it('reports audit-failed as an honest partial success (the write persisted)', async () => {
    const { store, deps } = makeBackend([row({ id: 'd1' })]);
    (deps.emitAudit as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: { message: 'audit down' } });
    const r = await run({ kind: 'withdraw', dealId: 'd1', reason: 'x' }, deps);
    expect(r.kind).toBe('audit-failed');
    expect(store.get('d1')!.statusName).toBe('Withdrawn');
  });
});

describe('writeDealRemoval — reinstate', () => {
  it('refuses to reinstate a deal that is not withdrawn', async () => {
    const { deps } = makeBackend([row({ id: 'd1', statusName: 'Underwriting' })]);
    const r = await run({ kind: 'reinstate', dealId: 'd1' }, deps);
    expect(r.kind).toBe('not-withdrawn');
    expect(deps.updateDeal).not.toHaveBeenCalled();
  });

  it('reinstates a withdrawn deal back to Open', async () => {
    const { store, deps } = makeBackend([row({ id: 'd1', statusName: 'Withdrawn' })]);
    const r = await run({ kind: 'reinstate', dealId: 'd1' }, deps);
    expect(r.kind).toBe('success');
    expect(store.get('d1')!.statusName).toBe('Open');
  });
});

describe('writeDealRemoval — not found', () => {
  it('reports not-found for an unknown deal id', async () => {
    const { deps } = makeBackend([]);
    const r = await run({ kind: 'withdraw', dealId: 'missing', reason: 'x' }, deps);
    expect(r.kind).toBe('not-found');
  });
});
