// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import {
  resolvePortfolioBoardingFeatureFlags,
  PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS,
} from './portfolioLoanBoardingFeatureFlags';
import {
  buildAuditEntry,
  canApproveBoarding,
  isSensitiveFieldKey,
  REDACTED_PLACEHOLDER,
} from './portfolioLoanBoardingAuditTrail';
import { derivePortfolioBoardingExportModel } from './PortfolioBoardingPackageExportModel';
import { loadPortfolioBoardedLoanCommandRows } from './loadPortfolioBoardedLoansForWorkspace';
import { usePortfolioLoanBoardingPersistence } from './usePortfolioLoanBoardingPersistence';
import { usePortfolioLoanDocumentPersistence } from './usePortfolioLoanDocumentPersistence';
import {
  createDisabledPortfolioBoardingLivePersistenceAdapter,
  createPortfolioBoardingLivePersistenceAdapter,
  type PortfolioBoardingTransport,
} from './portfolioLoanBoardingLivePersistence';
import { createDisabledPortfolioBoardingDocumentAdapter } from './usePortfolioLoanDocumentPersistence';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

function pkgWithData(): PortfolioLoanBoardingPackage {
  const pkg = createEmptyPortfolioLoanBoardingPackage();
  pkg.source = 'manual_boarding';
  pkg.identity.loanNumber = 'LN-0001';
  pkg.identity.dealName = 'Boarding Test Facility';
  pkg.identity.borrowerLegalName = 'Synthetic Test Obligor';
  return pkg;
}

function okTransport(): PortfolioBoardingTransport {
  let n = 0;
  return {
    async create() {
      n += 1;
      return { ok: true, id: `id-${n}` };
    },
    async update() {
      return { ok: true };
    },
    async retrieve() {
      return { ok: true, record: { cr664_loannumber: 'LN-1' } };
    },
    async retrieveMultiple() {
      return { ok: true, records: [] };
    },
  };
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

describe('Phase 140M-P — feature flags default safe', () => {
  it('every flag defaults to false', () => {
    const f = PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS;
    expect(f.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(f.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(f.PORTFOLIO_BOARDING_DOCUMENT_METADATA_ENABLED).toBe(false);
    expect(f.PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED).toBe(false);
    expect(f.PORTFOLIO_BOARDING_FDIC_PACKAGE_ENABLED).toBe(false);
  });

  it('resolves disabled with no config and enables only on exact true', () => {
    expect(resolvePortfolioBoardingFeatureFlags().PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(
      resolvePortfolioBoardingFeatureFlags({ routeEnabled: true }).PORTFOLIO_BOARDING_ROUTE_ENABLED,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

describe('Phase 140M-P — audit trail', () => {
  it('builds an audit entry payload and never fabricates an actor', () => {
    const entry = buildAuditEntry({
      action: 'save',
      section: 'loanIdentity',
      fieldKey: 'cr664_loannumber',
      previousValue: undefined,
      newValue: 'LN-0001',
      timestamp: '2026-06-08T00:00:00Z',
    });
    expect(entry.action).toBe('save');
    expect(entry.newValueSummary).toBe('LN-0001');
    expect(entry.actor).toBeUndefined();
    expect(entry.actorResolved).toBe(false);
  });

  it('redacts sensitive fields (tax id) in value summaries', () => {
    expect(isSensitiveFieldKey('cr664_taxidentifier')).toBe(true);
    const entry = buildAuditEntry({
      action: 'save',
      fieldKey: 'borrower.taxIdentifier',
      newValue: '12-3456789',
      timestamp: '2026-06-08T00:00:00Z',
    });
    expect(entry.redacted).toBe(true);
    expect(entry.newValueSummary).toBe(REDACTED_PLACEHOLDER);
    expect(entry.newValueSummary).not.toContain('3456789');
  });

  it('blocks approval when an actor is required and missing', () => {
    expect(canApproveBoarding({ actor: undefined }).allowed).toBe(false);
    expect(canApproveBoarding({ actor: '  ' }).allowed).toBe(false);
    expect(canApproveBoarding({ actor: 'someone@bank.com' }).allowed).toBe(true);
    expect(canApproveBoarding({ actor: undefined, requireActor: false }).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Export model
// ---------------------------------------------------------------------------

describe('Phase 140M-P — export model discloses, never hides', () => {
  it('is a JSON view-model (no PDF) and exposes missing/stale/exception disclosures', () => {
    const model = derivePortfolioBoardingExportModel(pkgWithData(), new Date('2026-06-08T00:00:00Z'));
    expect(model.format).toBe('json-view-model');
    expect(model.disclosureStatement).toMatch(/no PDF/i);
    expect(Array.isArray(model.disclosures.missing)).toBe(true);
    expect(Array.isArray(model.disclosures.stale)).toBe(true);
    expect(Array.isArray(model.disclosures.exceptions)).toBe(true);
    // An empty/under-documented package is not FDIC ready (fail-closed).
    expect(model.readiness.fdicReady).toBe(false);
  });

  it('is deterministic for the same package + now', () => {
    const now = new Date('2026-06-08T00:00:00Z');
    const a = derivePortfolioBoardingExportModel(pkgWithData(), now);
    const b = derivePortfolioBoardingExportModel(pkgWithData(), now);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// Command-center loader
// ---------------------------------------------------------------------------

describe('Phase 140M-P — command-center loader is flag-gated', () => {
  it('returns no rows when the flag is off', () => {
    const rows = loadPortfolioBoardedLoanCommandRows({
      flags: { PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: false },
      authorizedPackages: [pkgWithData()],
    });
    expect(rows).toEqual([]);
  });

  it('returns no rows when no packages are supplied (even with the flag on)', () => {
    const rows = loadPortfolioBoardedLoanCommandRows({
      flags: { PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: true },
      authorizedPackages: [],
    });
    expect(rows).toEqual([]);
  });

  it('projects authorized packages when the flag is on, preserving the source marker', () => {
    const rows = loadPortfolioBoardedLoanCommandRows({
      flags: { PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: true },
      authorizedPackages: [pkgWithData()],
    });
    expect(rows.length).toBe(1);
    expect(rows[0]!.source).toBe('manual_boarding');
    expect(rows[0]!.loanNumber).toBe('LN-0001');
  });
});

// ---------------------------------------------------------------------------
// Persistence hooks
// ---------------------------------------------------------------------------

describe('Phase 140M-P — boarding persistence hook', () => {
  it('disabled adapter → actions fail closed and never call a transport', async () => {
    const adapter = createDisabledPortfolioBoardingLivePersistenceAdapter();
    const { result } = renderHook(() => usePortfolioLoanBoardingPersistence(adapter));
    expect(result.current.enabled).toBe(false);
    let res!: { ok: boolean; errorCode?: string };
    await act(async () => {
      res = await result.current.create(pkgWithData());
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('adapter_not_configured');
    expect(result.current.state.kind).toBe('failure');
  });

  it('live adapter → create succeeds and reports success state', async () => {
    const adapter = createPortfolioBoardingLivePersistenceAdapter({ transport: okTransport() });
    const { result } = renderHook(() => usePortfolioLoanBoardingPersistence(adapter));
    expect(result.current.enabled).toBe(true);
    await act(async () => {
      await result.current.create(pkgWithData());
    });
    expect(result.current.state.kind).toBe('success');
  });
});

describe('Phase 140M-P — document persistence hook', () => {
  it('disabled by default and reports no upload path', async () => {
    const adapter = createDisabledPortfolioBoardingDocumentAdapter();
    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(adapter, { documentMetadataEnabled: false }),
    );
    expect(result.current.enabled).toBe(false);
    expect(result.current.uploadConfigured).toBe(false);
    let res!: { ok: boolean; errorCode?: string };
    await act(async () => {
      res = await result.current.addDocument('loan-1', { documentType: 'note' });
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('not_configured');
  });
});
