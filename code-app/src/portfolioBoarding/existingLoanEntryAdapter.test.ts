import { describe, it, expect, vi } from 'vitest';
import {
  boardExistingLoan,
  MANUAL_EXISTING_LOAN_BOARDING_SOURCE,
  type ExistingLoanDeps,
  type ExistingLoanInput,
} from './existingLoanEntryAdapter';

/**
 * Phase 259 — fail-closed coverage for governed manual existing-loan boarding.
 */

function baseInput(over: Partial<ExistingLoanInput> = {}): ExistingLoanInput {
  return {
    loanNumber: 'LN-0001',
    borrowerLegalName: 'Acme Holdings, LLC',
    originalCommitmentAmount: 1_000_000,
    currentOutstandingPrincipal: 850_000,
    actorEmail: 'op@oldglorybank.com',
    actorSystemUserId: 'sys-op-1',
    authorized: true,
    ...over,
  };
}

function deps(over: Partial<ExistingLoanDeps> = {}): ExistingLoanDeps {
  return {
    findLoanByNumber: vi.fn(async () => null),
    createRoot: vi.fn(async () => ({ success: true, id: 'loan-1' })),
    readRoot: vi.fn(async () => ({ success: true, data: { cr664_loannumber: 'LN-0001' } })),
    createChild: vi.fn(async () => ({ success: true, id: 'child-1' })),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    ...over,
  };
}

describe('Phase 259 — boardExistingLoan fail-closed', () => {
  it('refuses when unauthorized (no write)', async () => {
    const d = deps();
    const out = await boardExistingLoan(baseInput({ authorized: false }), d);
    expect(out.kind).toBe('unauthorized');
    expect(d.createRoot).not.toHaveBeenCalled();
  });

  it('blocks missing required fields (loan number / borrower legal name)', async () => {
    const d = deps();
    expect((await boardExistingLoan(baseInput({ loanNumber: '  ' }), d)).kind).toBe('invalid-input');
    expect((await boardExistingLoan(baseInput({ borrowerLegalName: '' }), d)).kind).toBe('invalid-input');
    expect(d.createRoot).not.toHaveBeenCalled();
  });

  it('refuses without a Dataverse identity', async () => {
    const d = deps();
    expect((await boardExistingLoan(baseInput({ actorSystemUserId: undefined }), d)).kind).toBe('identity-unresolved');
    expect((await boardExistingLoan(baseInput({ actorEmail: undefined }), d)).kind).toBe('identity-unresolved');
  });

  it('blocks a duplicate loan number (no record created)', async () => {
    const createRoot = vi.fn(async () => ({ success: true, id: 'should-not-create' }));
    const d = deps({ findLoanByNumber: vi.fn(async () => ({ id: 'existing-loan-7' })), createRoot });
    const out = await boardExistingLoan(baseInput(), d);
    expect(out.kind).toBe('duplicate');
    if (out.kind === 'duplicate') {
      expect(out.loanNumber).toBe('LN-0001');
      expect(out.existingLoanId).toBe('existing-loan-7');
    }
    expect(createRoot).not.toHaveBeenCalled();
  });

  it('reports write-failed when the root create fails, mapped to the shared business-safe message', async () => {
    const d = deps({ createRoot: vi.fn(async () => ({ success: false, error: { message: 'create rejected' } })) });
    const out = await boardExistingLoan(baseInput(), d);
    expect(out.kind).toBe('write-failed');
    if (out.kind === 'write-failed') {
      expect(out.error).not.toContain('create rejected');
      expect(out.error).toContain("We couldn't save that action");
    }
  });

  it('fails closed on readback mismatch', async () => {
    const d = deps({ readRoot: vi.fn(async () => ({ success: true, data: { cr664_loannumber: 'LN-9999' } })) });
    const out = await boardExistingLoan(baseInput(), d);
    expect(out.kind).toBe('readback-mismatch');
    if (out.kind === 'readback-mismatch') {
      expect(out.expectedLoanNumber).toBe('LN-0001');
      expect(out.actualLoanNumber).toBe('LN-9999');
    }
  });

  it('reports audit-failed when the audit entry fails (loan was created)', async () => {
    const d = deps({ emitAudit: vi.fn(async () => ({ success: false, error: { message: 'audit rejected' } })) });
    const out = await boardExistingLoan(baseInput(), d);
    expect(out.kind).toBe('audit-failed');
    if (out.kind === 'audit-failed') expect(out.loanId).toBe('loan-1');
  });

  it('builds the correct root payload (Manual Existing Loan Entry source, loan number, borrower, amounts)', async () => {
    const createRoot = vi.fn(async (_p: Record<string, unknown>) => ({ success: true, id: 'loan-1' }));
    const d = deps({ createRoot });
    const out = await boardExistingLoan(baseInput(), d);
    expect(out.kind).toBe('success');
    const payload = createRoot.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_loannumber).toBe('LN-0001');
    expect(payload.cr664_borrowerlegalname).toBe('Acme Holdings, LLC');
    expect(payload.cr664_boardingsource).toBe(MANUAL_EXISTING_LOAN_BOARDING_SOURCE);
    expect(payload.cr664_originalcommitmentamount).toBe(1_000_000);
    expect(payload.cr664_currentoutstandingprincipal).toBe(850_000);
  });

  it('does NOT require an originated cr664_loandeal link (manual path works without it)', async () => {
    const createRoot = vi.fn(async (_p: Record<string, unknown>) => ({ success: true, id: 'loan-1' }));
    const d = deps({ createRoot });
    const out = await boardExistingLoan(baseInput(), d);
    expect(out.kind).toBe('success');
    const payload = createRoot.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['cr664_OriginatedLoanDeal@odata.bind']).toBeUndefined();
  });

  it('supports an optional originated-deal link when provided', async () => {
    const createRoot = vi.fn(async (_p: Record<string, unknown>) => ({ success: true, id: 'loan-1' }));
    const d = deps({ createRoot });
    await boardExistingLoan(baseInput({ originatedDealId: 'deal-9' }), d);
    const payload = createRoot.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['cr664_OriginatedLoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-9)');
  });

  it('WI-2 — binds the portfolio-manager systemuser lookup when an id is supplied', async () => {
    const createRoot = vi.fn(async (_p: Record<string, unknown>) => ({ success: true, id: 'loan-1' }));
    const d = deps({ createRoot });
    const out = await boardExistingLoan(baseInput({ portfolioManagerId: 'sys-mgr-7' }), d);
    expect(out.kind).toBe('success');
    const payload = createRoot.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['cr664_PortfolioManager@odata.bind']).toBe('/systemusers(sys-mgr-7)');
  });

  it('WI-2 — omits the manager bind when no id is supplied (manual path works without it)', async () => {
    const createRoot = vi.fn(async (_p: Record<string, unknown>) => ({ success: true, id: 'loan-1' }));
    const d = deps({ createRoot });
    await boardExistingLoan(baseInput(), d);
    const payload = createRoot.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload['cr664_PortfolioManager@odata.bind']).toBeUndefined();
  });

  it('creates entered child records linked to the boarded loan', async () => {
    const createChild = vi.fn(async (_c: string, _p: Record<string, unknown>) => ({ success: true, id: 'c' }));
    const d = deps({ createChild });
    const out = await boardExistingLoan(
      baseInput({
        guarantors: [{ name: 'Jane Q. Guarantor' }],
        collateral: [{ name: 'Office building — 123 Main St' }],
      }),
      d,
    );
    expect(out.kind).toBe('success');
    if (out.kind === 'success') {
      expect(out.childCreated).toBe(2);
      expect(out.childErrors).toHaveLength(0);
    }
    const calls = createChild.mock.calls as Array<[string, Record<string, unknown>]>;
    const guarantorCall = calls.find(([c]) => c === 'guarantors')!;
    expect(guarantorCall[1].cr664_name).toBe('Jane Q. Guarantor');
    expect(guarantorCall[1]['cr664_PortfolioBoardedLoan@odata.bind']).toBe('/cr664_portfolioboardedloans(loan-1)');
  });

  it('surfaces partial child failures honestly (loan still boarded)', async () => {
    const createChild = vi.fn(async (_c: string, _p: Record<string, unknown>) => ({ success: false, error: { message: 'child rejected' } }));
    const d = deps({ createChild });
    const out = await boardExistingLoan(baseInput({ documents: [{ name: 'Note & DOT' }] }), d);
    expect(out.kind).toBe('success');
    if (out.kind === 'success') {
      expect(out.loanId).toBe('loan-1');
      expect(out.childCreated).toBe(0);
      expect(out.childErrors).toHaveLength(1);
      expect(out.childErrors[0]!.collection).toBe('documents');
    }
  });
});
