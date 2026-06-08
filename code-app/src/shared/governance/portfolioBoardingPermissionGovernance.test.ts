import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveBoardingAccess } from '../../portfolioBoarding/portfolioBoardingAccess';

/**
 * Phase 140M-P — Portfolio boarding PERMISSION governance.
 *
 * Pins that the operator surface never widens the existing access model:
 *   - access resolution is fail-closed (unauthorized → no surface, no create);
 *   - read-only mode never grants create authority;
 *   - the route registry (App.tsx) is NOT modified to expose the surface by
 *     default — registration stays an explicit, flag-gated operator step.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('Phase 140M-P — access resolution is fail-closed', () => {
  it('unauthorized users never see the surface and can never create', () => {
    const a = resolveBoardingAccess({
      isAuthorizedOperator: false,
      routeEnabled: true,
      livePersistenceEnabled: true,
      adapterEnabled: true,
    });
    expect(a.canViewSurface).toBe(false);
    expect(a.canCreate).toBe(false);
  });

  it('read-only mode (persistence off) never grants create authority', () => {
    const a = resolveBoardingAccess({
      isAuthorizedOperator: true,
      routeEnabled: true,
      livePersistenceEnabled: false,
      adapterEnabled: false,
    });
    expect(a.mode).toBe('read_only');
    expect(a.canViewSurface).toBe(true);
    expect(a.canCreate).toBe(false);
  });

  it('create requires authorization AND route AND live persistence AND adapter', () => {
    const grant = {
      isAuthorizedOperator: true,
      routeEnabled: true,
      livePersistenceEnabled: true,
      adapterEnabled: true,
    };
    expect(resolveBoardingAccess(grant).canCreate).toBe(true);
    expect(resolveBoardingAccess({ ...grant, adapterEnabled: false }).canCreate).toBe(false);
    expect(resolveBoardingAccess({ ...grant, routeEnabled: false }).canCreate).toBe(false);
    expect(resolveBoardingAccess({ ...grant, isAuthorizedOperator: false }).canCreate).toBe(false);
  });
});

describe('Phase 140M-P — no permission widening in the route registry', () => {
  const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');

  it('App.tsx does not register a portfolio-boarding route by default', () => {
    expect(app).not.toMatch(/portfolio-boarding/i);
    expect(app).not.toMatch(/PortfolioLoanBoardingWorkspace/);
    expect(app).not.toMatch(/FdicBoardPackageWorkspace/);
  });

  it('App.tsx keeps the existing WorkspaceGate-protected routes unchanged', () => {
    expect(app).toMatch(/WorkspaceGate/);
    expect(app).toMatch(/WORKSPACE_ROUTES\.admin/);
  });
});
