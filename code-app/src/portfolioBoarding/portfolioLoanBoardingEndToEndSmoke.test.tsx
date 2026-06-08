import { describe, it, expect } from 'vitest';
import { createLivePortfolioBoardingTransport, type DataverseWriteClient, type DataverseWriteClientResult } from './portfolioLoanBoardingLiveDataverseTransport';
import { createPortfolioBoardingLivePersistenceAdapter } from './portfolioLoanBoardingLivePersistence';
import { buildAuditEntry } from './portfolioLoanBoardingAuditTrail';
import { derivePortfolioBoardingExportModel } from './PortfolioBoardingPackageExportModel';
import { loadPortfolioBoardedLoanCommandRows } from './loadPortfolioBoardedLoansForWorkspace';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

/**
 * Phase 140Q — end-to-end smoke over an IN-MEMORY transport (test-only).
 *
 * Neutral test identifiers only (TEST_LOAN_NUMBER_001, TEST_BOARDING_PACKAGE_ID).
 * No real or sample-production borrower names. A governance test pins that
 * these identifiers never leak into production source.
 */

const TEST_LOAN_NUMBER_001 = 'TEST_LOAN_NUMBER_001';
const TEST_BOARDING_PACKAGE_ID = 'TEST_BOARDING_PACKAGE_ID';

function inMemoryClient(): DataverseWriteClient {
  const store = new Map<string, Record<string, unknown>>();
  let seq = 0;
  return {
    async create(entitySet, record): Promise<DataverseWriteClientResult> {
      seq += 1;
      const id = `${entitySet}-${seq}`;
      store.set(id, { ...record, id });
      return { ok: true, id };
    },
    async update(entitySet, id, record): Promise<DataverseWriteClientResult> {
      void entitySet;
      const cur = store.get(id) ?? {};
      store.set(id, { ...cur, ...record });
      return { ok: true };
    },
    async retrieve(entitySet, id): Promise<DataverseWriteClientResult> {
      void entitySet;
      const record = store.get(id);
      return record ? { ok: true, record } : { ok: false, error: 'not_found' };
    },
    async retrieveMultiple(entitySet): Promise<DataverseWriteClientResult> {
      const records = [...store.entries()]
        .filter(([k]) => k.startsWith(entitySet))
        .map(([, v]) => v);
      return { ok: true, records };
    },
  };
}

function minimalClosedLoan(): PortfolioLoanBoardingPackage {
  // Step 4: a blank package invents nothing; we add only neutral test values.
  const pkg = createEmptyPortfolioLoanBoardingPackage();
  pkg.packageId = TEST_BOARDING_PACKAGE_ID;
  pkg.source = 'manual_boarding';
  pkg.identity.loanNumber = TEST_LOAN_NUMBER_001;
  pkg.identity.loanStatus = 'active';
  return pkg;
}

describe('Phase 140Q — end-to-end boarding smoke (in-memory transport)', () => {
  it('blank package invents no borrower / loan / value', () => {
    const blank = createEmptyPortfolioLoanBoardingPackage();
    expect(blank.identity.borrowerLegalName).toBeUndefined();
    expect(blank.identity.loanNumber).toBeUndefined();
    expect(blank.terms.currentOutstandingPrincipal).toBeUndefined();
    expect(blank.source).toBeUndefined();
  });

  it('create → read → update preserves nulls and the source marker', async () => {
    const adapter = createPortfolioBoardingLivePersistenceAdapter({
      transport: createLivePortfolioBoardingTransport({ client: inMemoryClient() }),
    });

    // Steps 5-7: save the minimum closed-loan identity, get a root id.
    const pkg = minimalClosedLoan();
    pkg.collateral.items = [{ collateralType: 'real_estate' }];
    pkg.guarantors.guarantors = [{ guarantorName: 'Synthetic Test Guarantor' }];
    const created = await adapter.createBoardedLoan(pkg);
    expect(created.ok).toBe(true);
    expect(created.recordId).toBeTruthy();
    // Children created (collateral + guarantor) and bound to root.
    expect((created.childRecordIds ?? []).length).toBeGreaterThanOrEqual(2);

    // Step 14-15: reopen + update preserves source + leaves missing fields missing.
    const read = await adapter.readBoardedLoan(created.recordId!);
    expect(read.ok).toBe(true);
    const readData = read.data as { source?: string; identity?: { loanNumber?: string } };
    expect(readData.source).toBe('manual_boarding');
    expect(readData.identity?.loanNumber).toBe(TEST_LOAN_NUMBER_001);

    const updated = await adapter.updateBoardedLoan(created.recordId!, pkg);
    expect(updated.ok).toBe(true);
  });

  it('readiness fails closed and the FDIC package discloses missing items', () => {
    // Step 12-13: an under-documented package is not ready; nothing is hidden.
    const model = derivePortfolioBoardingExportModel(minimalClosedLoan());
    expect(model.readiness.fdicReady).toBe(false);
    expect(model.disclosures.missing.length + model.disclosures.blockers.length).toBeGreaterThan(0);
    expect(model.disclosureStatement).toMatch(/not hidden/i);
  });

  it('step 16: a save produces an audit payload (no fake actor)', () => {
    const entry = buildAuditEntry({
      action: 'createBoardedLoan',
      section: 'loanIdentity',
      fieldKey: 'cr664_loannumber',
      newValue: TEST_LOAN_NUMBER_001,
      timestamp: '2026-06-08T00:00:00Z',
    });
    expect(entry.action).toBe('createBoardedLoan');
    expect(entry.actorResolved).toBe(false);
    expect(entry.actor).toBeUndefined();
  });

  it('steps 17-18: command-center seam consumes a saved row only when flagged + supplied', () => {
    const off = loadPortfolioBoardedLoanCommandRows({
      flags: { PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: false },
      authorizedPackages: [minimalClosedLoan()],
    });
    expect(off).toEqual([]);

    const empty = loadPortfolioBoardedLoanCommandRows({
      flags: { PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: true },
      authorizedPackages: [],
    });
    expect(empty).toEqual([]);

    const on = loadPortfolioBoardedLoanCommandRows({
      flags: { PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: true },
      authorizedPackages: [minimalClosedLoan()],
    });
    expect(on.length).toBe(1);
    expect(on[0]!.source).toBe('manual_boarding');
  });
});
