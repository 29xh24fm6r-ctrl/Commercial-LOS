// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PortfolioLoanBoardingWorkspace } from './PortfolioLoanBoardingWorkspace';
import { FdicBoardPackageWorkspace } from './FdicBoardPackageWorkspace';
import { resolveBoardingAccess } from './portfolioBoardingAccess';
import {
  createDisabledPortfolioBoardingLivePersistenceAdapter,
  createPortfolioBoardingLivePersistenceAdapter,
  type PortfolioBoardingTransport,
} from './portfolioLoanBoardingLivePersistence';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

function liveAdapter() {
  const t: PortfolioBoardingTransport = {
    async create() {
      return { ok: true, id: 'x' };
    },
    async update() {
      return { ok: true };
    },
    async retrieve() {
      return { ok: true, record: {} };
    },
    async retrieveMultiple() {
      return { ok: true, records: [] };
    },
  };
  return createPortfolioBoardingLivePersistenceAdapter({ transport: t });
}

function pkg(): PortfolioLoanBoardingPackage {
  const p = createEmptyPortfolioLoanBoardingPackage();
  p.source = 'manual_boarding';
  p.identity.loanNumber = 'LN-9';
  p.identity.borrowerLegalName = 'Synthetic Obligor';
  return p;
}

// ---------------------------------------------------------------------------
// Access gating (pure)
// ---------------------------------------------------------------------------

describe('Phase 140M — access is fail-closed', () => {
  const base = { routeEnabled: true, livePersistenceEnabled: true, adapterEnabled: true };

  it('unauthorized → no surface, no create', () => {
    const a = resolveBoardingAccess({ ...base, isAuthorizedOperator: false });
    expect(a.canViewSurface).toBe(false);
    expect(a.canCreate).toBe(false);
    expect(a.mode).toBe('unauthorized');
  });

  it('authorized but route flag off → not configured, no surface', () => {
    const a = resolveBoardingAccess({ ...base, isAuthorizedOperator: true, routeEnabled: false });
    expect(a.canViewSurface).toBe(false);
    expect(a.mode).toBe('not_configured');
  });

  it('authorized + route on but persistence off → read-only, no create', () => {
    const a = resolveBoardingAccess({
      isAuthorizedOperator: true,
      routeEnabled: true,
      livePersistenceEnabled: false,
      adapterEnabled: false,
    });
    expect(a.canViewSurface).toBe(true);
    expect(a.canCreate).toBe(false);
    expect(a.mode).toBe('read_only');
  });

  it('authorized + route + persistence + adapter → live, can create', () => {
    const a = resolveBoardingAccess({ ...base, isAuthorizedOperator: true });
    expect(a.canViewSurface).toBe(true);
    expect(a.canCreate).toBe(true);
    expect(a.mode).toBe('live');
  });
});

// ---------------------------------------------------------------------------
// Workspace rendering
// ---------------------------------------------------------------------------

describe('Phase 140M — workspace renders honest states', () => {
  it('unauthorized: shows the unavailable banner, no list, no create button', () => {
    const access = resolveBoardingAccess({
      isAuthorizedOperator: false,
      routeEnabled: false,
      livePersistenceEnabled: false,
      adapterEnabled: false,
    });
    render(
      <PortfolioLoanBoardingWorkspace
        access={access}
        adapter={createDisabledPortfolioBoardingLivePersistenceAdapter()}
      />,
    );
    expect(screen.getByText(/not available for your workspace/i)).toBeInTheDocument();
    expect(screen.queryByText('Create boarded loan')).not.toBeInTheDocument();
    expect(screen.queryByText('Boarded loans')).not.toBeInTheDocument();
  });

  it('read-only: shows surface + empty list but no create affordance', () => {
    const access = resolveBoardingAccess({
      isAuthorizedOperator: true,
      routeEnabled: true,
      livePersistenceEnabled: false,
      adapterEnabled: false,
    });
    render(
      <PortfolioLoanBoardingWorkspace
        access={access}
        adapter={createDisabledPortfolioBoardingLivePersistenceAdapter()}
        packages={[]}
      />,
    );
    expect(
      screen.getByText(/live persistence is not enabled\. Boarded loans cannot be created/i),
    ).toBeInTheDocument();
    expect(screen.getByText('No boarded loans found.')).toBeInTheDocument();
    expect(screen.queryByText('Create boarded loan')).not.toBeInTheDocument();
  });

  it('live: shows the create affordance and renders authorized rows (no fake rows)', () => {
    const access = resolveBoardingAccess({
      isAuthorizedOperator: true,
      routeEnabled: true,
      livePersistenceEnabled: true,
      adapterEnabled: true,
    });
    render(
      <PortfolioLoanBoardingWorkspace access={access} adapter={liveAdapter()} packages={[pkg()]} />,
    );
    expect(screen.getByText('Create boarded loan')).toBeInTheDocument();
    expect(screen.getByText('Synthetic Obligor')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FDIC package renders read-only even when persistence is disabled
// ---------------------------------------------------------------------------

describe('Phase 140P — FDIC package renders read-only from a provided package', () => {
  it('discloses (renders) even with no persistence', () => {
    render(<FdicBoardPackageWorkspace package={pkg()} />);
    expect(screen.getByText(/Missing, stale, and exception items are disclosed/i)).toBeInTheDocument();
    // The package is under-documented → not FDIC ready (fail-closed).
    expect(screen.getByText(/FDIC not ready/i)).toBeInTheDocument();
  });
});
