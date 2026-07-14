import { describe, it, expect, vi } from 'vitest';
import {
  writePortfolioLoanRemoval,
  type PortfolioLoanRemovalAction,
  type PortfolioLoanRemovalWriteDeps,
  type PortfolioLoanRemovalRow,
} from './portfolioLoanRemovalWrite';

/**
 * Governed admin Portfolio Loan Removal (remove / reinstate).
 *
 * Pins the discipline: fail-closed authorization + identity, actor resolved
 * BEFORE any mutation, an already-removed loan is refused (idempotency), an
 * already-active loan can't be "reinstated" twice, readback verification,
 * honest audit (Succeeded on verified write; best-effort Failed audit +
 * audit-failed outcome on failure). Pure over injected deps.
 */

const ACTOR_BIND = '/cr664_users(11111111-1111-1111-1111-111111111111)';
const AUTH: { actorEmail: string; actorSystemUserId: string | undefined; authorized: boolean } = {
  actorEmail: 'admin@bank.test',
  actorSystemUserId: 'sys-1',
  authorized: true,
};

function makeBackend(seed: PortfolioLoanRemovalRow[] = []) {
  const store = new Map<string, PortfolioLoanRemovalRow>();
  for (const r of seed) store.set(r.id, r);

  const deps: PortfolioLoanRemovalWriteDeps = {
    getLoan: vi.fn(async (id: string) => {
      const row = store.get(id);
      return row ? { success: true, row } : { success: false, error: { message: 'not found' } };
    }),
    updateLoan: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const row = store.get(id);
      if (!row) return { success: false, error: { message: 'not found' } };
      const active = patch.statecode === 0;
      store.set(id, { ...row, active, loanStatus: patch.cr664_loanstatus as string });
      return { success: true };
    }),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    resolveActorChangedBy: vi.fn(async () => ({ ok: true, changedByBind: ACTOR_BIND })),
  };
  return { store, deps };
}

function row(over: Partial<PortfolioLoanRemovalRow> & { id: string }): PortfolioLoanRemovalRow {
  return { name: 'Acme Term Loan', loanNumber: 'LN-1001', borrowerName: 'Acme Corp', loanStatus: 'Performing', active: true, ...over };
}

function run(action: PortfolioLoanRemovalAction, deps: PortfolioLoanRemovalWriteDeps, over: Partial<typeof AUTH> = {}) {
  return writePortfolioLoanRemoval({ action, ...AUTH, ...over }, deps);
}

describe('writePortfolioLoanRemoval — authorization + identity (fail-closed)', () => {
  it('refuses an unauthorized caller and mutates nothing', async () => {
    const { store, deps } = makeBackend([row({ id: 'l1' })]);
    const r = await run({ kind: 'remove', loanId: 'l1', reason: 'entered in error' }, deps, { authorized: false });
    expect(r.kind).toBe('unauthorized');
    expect(store.get('l1')!.active).toBe(true);
    expect(deps.updateLoan).not.toHaveBeenCalled();
  });

  it('refuses when no Dataverse systemuser identity is present', async () => {
    const { deps } = makeBackend([row({ id: 'l1' })]);
    const r = await run({ kind: 'remove', loanId: 'l1', reason: 'x' }, deps, { actorSystemUserId: undefined });
    expect(r.kind).toBe('identity-unresolved');
    expect(deps.updateLoan).not.toHaveBeenCalled();
  });

  it('does NOT mutate when the auditable actor cannot be resolved', async () => {
    const { store, deps } = makeBackend([row({ id: 'l1' })]);
    (deps.resolveActorChangedBy as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: 'no cr664_user' });
    const r = await run({ kind: 'remove', loanId: 'l1', reason: 'x' }, deps);
    expect(r.kind).toBe('identity-unresolved');
    expect(store.get('l1')!.active).toBe(true);
    expect(deps.updateLoan).not.toHaveBeenCalled();
  });
});

describe('writePortfolioLoanRemoval — remove', () => {
  it('requires a non-blank reason', async () => {
    const { deps } = makeBackend([row({ id: 'l1' })]);
    expect((await run({ kind: 'remove', loanId: 'l1', reason: '  ' }, deps)).kind).toBe('invalid-input');
  });

  it('requires a selected loan', async () => {
    const { deps } = makeBackend([]);
    expect((await run({ kind: 'remove', loanId: '', reason: 'x' }, deps)).kind).toBe('invalid-input');
  });

  it('refuses a loan already removed', async () => {
    const { deps } = makeBackend([row({ id: 'l1', active: false })]);
    const r = await run({ kind: 'remove', loanId: 'l1', reason: 'x' }, deps);
    expect(r.kind).toBe('already-removed');
    expect(deps.updateLoan).not.toHaveBeenCalled();
  });

  it('removes an active loan (statecode Inactive) and audits it (Lifecycle/StatusChange/PortfolioLoan event)', async () => {
    const { store, deps } = makeBackend([row({ id: 'l1' })]);
    const r = await run({ kind: 'remove', loanId: 'l1', reason: 'duplicate boarding, created in error' }, deps);
    expect(r.kind).toBe('success');
    expect(store.get('l1')!.active).toBe(false);
    expect(store.get('l1')!.loanStatus).toBe('Removed by Admin');
    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
    const payload = (deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_eventcategory).toBe(788190002);
    expect(payload.cr664_eventtype).toBe(788190001);
    expect(payload.cr664_entitytype).toBe(788190001);
    expect(payload['cr664_PortfolioLoan@odata.bind']).toBe('/cr664_portfolioboardedloans(l1)');
    expect(payload.cr664_notes).toContain('duplicate boarding, created in error');
  });

  it('reports readback-mismatch and still emits a Failed audit when the write does not persist', async () => {
    const { deps } = makeBackend([row({ id: 'l1' })]);
    (deps.updateLoan as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    const r = await run({ kind: 'remove', loanId: 'l1', reason: 'x' }, deps);
    expect(r.kind).toBe('readback-mismatch');
    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
    expect((deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0].cr664_outcomestatus).toBe(788190001);
  });

  it('reports audit-failed as an honest partial success (the write persisted)', async () => {
    const { store, deps } = makeBackend([row({ id: 'l1' })]);
    (deps.emitAudit as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: { message: 'audit down' } });
    const r = await run({ kind: 'remove', loanId: 'l1', reason: 'x' }, deps);
    expect(r.kind).toBe('audit-failed');
    expect(store.get('l1')!.active).toBe(false);
  });
});

describe('writePortfolioLoanRemoval — reinstate', () => {
  it('refuses to reinstate a loan that is already active', async () => {
    const { deps } = makeBackend([row({ id: 'l1', active: true })]);
    const r = await run({ kind: 'reinstate', loanId: 'l1' }, deps);
    expect(r.kind).toBe('not-removed');
    expect(deps.updateLoan).not.toHaveBeenCalled();
  });

  it('reinstates a removed loan back to Active', async () => {
    const { store, deps } = makeBackend([row({ id: 'l1', active: false, loanStatus: 'Removed by Admin' })]);
    const r = await run({ kind: 'reinstate', loanId: 'l1' }, deps);
    expect(r.kind).toBe('success');
    expect(store.get('l1')!.active).toBe(true);
    expect(store.get('l1')!.loanStatus).toBe('Active');
  });
});

describe('writePortfolioLoanRemoval — not found', () => {
  it('reports not-found for an unknown loan id', async () => {
    const { deps } = makeBackend([]);
    const r = await run({ kind: 'remove', loanId: 'missing', reason: 'x' }, deps);
    expect(r.kind).toBe('not-found');
  });
});
