import { describe, it, expect } from 'vitest';
import {
  derivePortfolioBoardingActivation,
  boardPortfolioLoan,
  PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
  type PortfolioBoardingInput,
  type PortfolioSchemaFacts,
} from './portfolioBoardingActivation';
import type { OperatorSmokeEvidence, SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';

function schema(present = true): PortfolioSchemaFacts {
  return { services: [{ label: 'loan-master', present }], columns: [{ label: 'loan.amount', present }], relationships: [{ label: 'borrowerÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢loan', present }] };
}
function ev(records: OperatorSmokeEvidence[] = []): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records };
}

describe('Phase 219 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â portfolio schema gate', () => {
  it('blocked until schema verified + flags + smoke', () => {
    const r = derivePortfolioBoardingActivation({ schema: schema(false), actorAuthorized: false, clientInjected: false, auditWired: false, singleRecordSmokeEnabled: false, evidence: ev() });
    expect(r.schemaVerified).toBe(false);
    expect(r.readiness.level).toBe('blocked');
  });
});

function board(over: Partial<PortfolioBoardingInput> = {}): PortfolioBoardingInput {
  return {
    actorAuthorized: true, schemaVerified: true, correlationId: 'c1',
    loanMaster: { amount: 100000 }, loanMasterRequiredFields: ['amount'],
    transport: { createLoanMaster: async () => ({ ok: true, id: 'loan-1' }), writeChildGroup: async () => ({ ok: true }) },
    auditSink: { write: async () => ({ ok: true }) },
    ...over,
  };
}

describe('Phase 229 â€” single-record internal portfolio boarding (fail-closed seam)', () => {
  it('is disabled by default and boards only when explicitly enabled', async () => {
    expect(PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect((await boardPortfolioLoan(board())).outcome).toBe('disabled');
    expect((await boardPortfolioLoan(board({ enabled: true }))).outcome).toBe('boarded');
  });
  it('unauthorized / schema_not_verified / validation_error fail closed', async () => {
    expect((await boardPortfolioLoan(board({ enabled: true, actorAuthorized: false }))).outcome).toBe('unauthorized');
    expect((await boardPortfolioLoan(board({ enabled: true, schemaVerified: false }))).outcome).toBe('schema_not_verified');
    expect((await boardPortfolioLoan(board({ enabled: true, loanMaster: {} }))).outcome).toBe('validation_error');
  });
  it('loan_master_failed when the master create fails (no children attempted)', async () => {
    const out = await boardPortfolioLoan(board({ enabled: true, transport: { createLoanMaster: async () => ({ ok: false, error: 'x' }), writeChildGroup: async () => ({ ok: true }) } }));
    expect(out.outcome).toBe('loan_master_failed');
    expect(out.loanId).toBeNull();
  });
  it('reports child groups as written / skipped / failed honestly', async () => {
    const out = await boardPortfolioLoan(board({
      enabled: true,
      childRecords: { borrower: [{ name: 'B' }], collateral: [{ kind: 'RE' }] },
      transport: {
        createLoanMaster: async () => ({ ok: true, id: 'loan-1' }),
        writeChildGroup: async (g) => (g === 'collateral' ? { ok: false, error: 'bad' } : { ok: true }),
      },
    }));
    expect(out.outcome).toBe('boarded');
    expect(out.childResults.borrower).toBe('written');
    expect(out.childResults.collateral).toBe('failed');
    expect(out.childResults.guarantor).toBe('skipped');
  });
  it('boards the full document/evidence and exception/review child groups', async () => {
    const written: string[] = [];
    const out = await boardPortfolioLoan(board({
      enabled: true,
      childRecords: {
        document: [{ name: 'Note' }],
        evidence: [{ name: 'Scan' }],
        exception: [{ name: 'Policy exception' }],
        review: [{ name: 'Annual review' }],
      },
      transport: {
        createLoanMaster: async () => ({ ok: true, id: 'loan-1' }),
        writeChildGroup: async (g) => { written.push(g); return { ok: true }; },
      },
    }));
    expect(out.outcome).toBe('boarded');
    // The four previously-unreachable groups are now first-class and written.
    expect(written).toEqual(expect.arrayContaining(['document', 'evidence', 'exception', 'review']));
    expect(out.childResults.document).toBe('written');
    expect(out.childResults.evidence).toBe('written');
    expect(out.childResults.exception).toBe('written');
    expect(out.childResults.review).toBe('written');
    // Groups with no records are still reported skipped, never dropped.
    expect(out.childResults.borrower).toBe('skipped');
  });
  it('duplicate_blocked unless an explicit override is supplied (no re-board)', async () => {
    let creates = 0;
    const t = {
      createLoanMaster: async () => { creates += 1; return { ok: true as const, id: 'loan-1' }; },
      writeChildGroup: async () => ({ ok: true as const }),
    };
    const dup = await boardPortfolioLoan(board({ enabled: true, existingBoardingPresent: true, transport: t }));
    expect(dup.outcome).toBe('duplicate_blocked');
    expect(dup.loanId).toBeNull();
    expect(creates).toBe(0); // never created a second loan master
    const over = await boardPortfolioLoan(board({ enabled: true, existingBoardingPresent: true, overrideDuplicate: true, transport: t }));
    expect(over.outcome).toBe('boarded');
  });
  it('readback_failed when the injected loan-master readback misses (children not written)', async () => {
    let childWrites = 0;
    const out = await boardPortfolioLoan(board({
      enabled: true,
      childRecords: { borrower: [{ name: 'B' }] },
      transport: {
        createLoanMaster: async () => ({ ok: true, id: 'loan-1' }),
        writeChildGroup: async () => { childWrites += 1; return { ok: true }; },
        readLoanMaster: async () => ({ ok: true, matches: false }),
      },
    }));
    expect(out.outcome).toBe('readback_failed');
    expect(out.loanId).toBe('loan-1');
    expect(childWrites).toBe(0);
  });
  it('boards through an injected readback that matches', async () => {
    const out = await boardPortfolioLoan(board({
      enabled: true,
      transport: {
        createLoanMaster: async () => ({ ok: true, id: 'loan-1' }),
        writeChildGroup: async () => ({ ok: true }),
        readLoanMaster: async () => ({ ok: true, matches: true }),
      },
    }));
    expect(out.outcome).toBe('boarded');
  });
  it('audit_failed_partial_success when audit fails after boarding', async () => {
    const out = await boardPortfolioLoan(board({ enabled: true, auditSink: { write: async () => ({ ok: false }) } }));
    expect(out.outcome).toBe('audit_failed_partial_success');
    expect(out.loanId).toBe('loan-1');
  });
});
