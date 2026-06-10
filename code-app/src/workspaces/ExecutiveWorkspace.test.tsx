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

describe('Phase 134A — ExecutiveWorkspace shell is read-only', () => {
  it('introduces no raw write affordance (<button>/<form>/onClick/onSubmit)', () => {
    // The Lending OS sidebar placeholders live in LendingOSLayout (a
    // separate component); the workspace shell itself adds none.
    expect(CODE).not.toMatch(/<button\b/i);
    expect(CODE).not.toMatch(/<form\b/i);
    expect(CODE).not.toMatch(/\bonClick\b/);
    expect(CODE).not.toMatch(/\bonSubmit\b/);
  });

  it('imports no write surface (modal / governed-write / email send)', () => {
    expect(CODE).not.toMatch(/Modal['"]/);
    expect(CODE).not.toMatch(/SendEmailV2|Office365/);
    expect(CODE).not.toMatch(/from ['"][^'"]*\/generated\//);
  });
});

describe('Phase 135B — Executive final demo polish', () => {
  it('frames the workspace as a board-safe, read-only overview', () => {
    expect(SRC).toMatch(/Board-safe executive overview/);
    expect(SRC).toMatch(/read-only/i);
    // Still says the view is derived only from authorized records (honesty).
    expect(SRC).toMatch(/authorized to this workspace/i);
  });

  it('does not duplicate the cockpit subtitle sentence verbatim in the page header', () => {
    // The cockpit owns the "Strategic, read-only roll-up …" sentence; the
    // page header must not repeat it verbatim (a demo-quality dedup).
    expect(SRC).not.toMatch(
      /Strategic, read-only roll-up of lending activity, exposure,\s*risk posture, operations health, and data quality/,
    );
  });

  it('keeps the read-only board-safe eyebrow', () => {
    expect(SRC).toMatch(/Board-safe view/);
  });
});

describe('Phase 142I — executive product strategy surface wiring (static source)', () => {
  it('reads the product-strategy surface param and renders the strategy surface', () => {
    expect(SRC).toMatch(/useSearchParams/);
    expect(SRC).toMatch(/isProductStrategySurface/);
    expect(SRC).toMatch(/<ExecutiveProductStrategyWorkspace/);
  });

  it('adds a read-only product strategy navigation card to the executive route', () => {
    expect(SRC).toMatch(/<ProductStrategyNavigationCard/);
    expect(SRC).toMatch(/PRODUCT_STRATEGY_SURFACE_URL/);
  });

  it('keeps the default executive command center as the non-strategy content', () => {
    // The default branch still leads with the command center before the
    // legacy detail cards — the strategy surface is additive, not a replacement.
    expect(SRC).toMatch(/<ExecutiveCommandCenter\s*\/>/);
    const cockpitIdx = SRC.indexOf('<ExecutiveCommandCenter');
    const portfolioIdx = SRC.indexOf('<PortfolioSummary');
    expect(cockpitIdx).toBeLessThan(portfolioIdx);
  });

  it('introduces no write affordance for the surface wiring', () => {
    expect(CODE).not.toMatch(/<button\b/i);
    expect(CODE).not.toMatch(/\bonClick\b/);
    expect(CODE).not.toMatch(/\bonSubmit\b/);
  });

  it('keeps the surface under the executive route (currentRoute stays executive)', () => {
    expect(SRC).toMatch(/currentRoute:\s*WORKSPACE_ROUTES\.executive/);
    // No banker/team/admin route is referenced; manager is only the existing
    // portfolio-switcher probe, never the strategy surface target.
    expect(CODE).not.toMatch(/WORKSPACE_ROUTES\.(banker|team|admin)/);
  });
});

describe('BUGFIX-CRM-VISIBLE — Executive workspace mounts the read-only CRM strategy surface', () => {
  it('imports and renders CrmExecutiveWorkingSurface with an honest preview input', () => {
    expect(SRC).toMatch(/import\s*\{\s*CrmExecutiveWorkingSurface\s*\}/);
    expect(SRC).toMatch(/executiveCrmPreviewInput/);
    expect(SRC).toMatch(/<CrmExecutiveWorkingSurface\s+input=\{executiveCrmPreviewInput\(\)\}/);
  });

  it('does not introduce sync/push/write/enable-live controls around the CRM surface', () => {
    expect(SRC).not.toMatch(/syncNow|pushNow|writeNow|enableLive/);
  });
});
