import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 133A — ExecutiveWorkspace shell + isolation pins (static source).
 *
 * Render-level behavior of the cockpit is covered by
 * ExecutiveCommandCenter.test.tsx. This file locks the workspace shell
 * contract that is awkward to assert through a full render (the
 * workspace pulls in bootstrap + entitlement + SDK-backed providers).
 */

const SRC = readFileSync(
  resolve(__dirname, 'ExecutiveWorkspace.tsx'),
  'utf8',
);
// Comment-stripped copy for the isolation scan — the file's doc-comment
// names the forbidden providers as explicit non-goals.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /(^|\s)\/\/.*$/gm,
  '$1',
);

describe('Phase 133A — ExecutiveWorkspace shell', () => {
  it('renders inside LendingOSLayout (dark sidebar shell)', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*LendingOSLayout[^}]*\}\s+from\s+['"][^'"]*LendingOSLayout['"]/,
    );
    expect(SRC).toMatch(/<LendingOSLayout/);
    expect(SRC).toMatch(/workspaceName=\{?["']Executive Workspace["']\}?/);
  });

  it('renders the ExecutiveCommandCenter as the first cockpit', () => {
    expect(SRC).toMatch(/<ExecutiveCommandCenter\s*\/>/);
    const cockpitIdx = SRC.indexOf('<ExecutiveCommandCenter');
    const portfolioIdx = SRC.indexOf('<PortfolioSummary');
    expect(cockpitIdx).toBeGreaterThan(-1);
    // Command center mounts before the legacy detail cards.
    if (portfolioIdx > -1) expect(cockpitIdx).toBeLessThan(portfolioIdx);
  });

  it('wires the workspace switcher from the entitlement source', () => {
    expect(SRC).toMatch(/useEntitledRoutes/);
    expect(SRC).toMatch(/deriveWorkspaceLinks/);
    expect(SRC).toMatch(/WorkspaceSwitcher/);
    expect(SRC).toMatch(/currentRoute:\s*WORKSPACE_ROUTES\.executive/);
  });

  it('shows the signed-in identity', () => {
    expect(SRC).toMatch(/useExecutive\(\)/);
    expect(SRC).toMatch(/\{fullName\}/);
    expect(SRC).toMatch(/\{upn\}/);
  });

  it('does NOT render data before authorization (data provider nested inside the identity provider)', () => {
    const provIdx = SRC.indexOf('<ExecutiveProvider>');
    const dataIdx = SRC.indexOf('<ExecutiveDataProvider>');
    const contentIdx = SRC.indexOf('<ExecutiveWorkspaceContent');
    expect(provIdx).toBeGreaterThan(-1);
    expect(dataIdx).toBeGreaterThan(provIdx);
    expect(contentIdx).toBeGreaterThan(dataIdx);
  });

  it('preserves SPEC W2 isolation — no manager/banker operational provider import', () => {
    expect(CODE).not.toMatch(/ManagerProvider|ManagerDataProvider|useManagerData/);
    expect(CODE).not.toMatch(/BankerProvider|useBanker\b/);
  });
});
