import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveManagerOperatingCommandCenterModel } from '../../manager/managerOperatingCommandCenterModel';
import { deriveExecutiveRestartReadinessModel } from '../../executive/executiveRestartReadinessModel';

const SRC = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

const READONLY_FILES = [
  '../../manager/managerOperatingCommandCenterModel.ts',
  '../../manager/ManagerOperatingCommandCenter.tsx',
  '../../executive/executiveRestartReadinessModel.ts',
  '../../executive/ExecutiveRestartReadinessCommandCenter.tsx',
];

describe('Phase 233 — manager + executive operating readiness activation contract', () => {
  it('the Manager Operating Command Center is mounted in the manager workspace', () => {
    const ws = SRC('../../workspaces/ManagerWorkspace.tsx');
    expect(ws).toMatch(/import \{ ManagerOperatingCommandCenter \}/);
    expect(ws).toMatch(/<ManagerOperatingCommandCenter \/>/);
    // Mounted only in manager mode so it never disrupts the portfolio surface.
    expect(ws).toMatch(/!isPortfolio && <ManagerOperatingCommandCenter \/>/);
  });

  it('the Executive Restart Readiness Command Center is mounted high in the executive workspace', () => {
    const ws = SRC('../../workspaces/ExecutiveWorkspace.tsx');
    expect(ws).toMatch(/import \{ ExecutiveRestartReadinessCommandCenter \}/);
    expect(ws).toMatch(/<ExecutiveRestartReadinessCommandCenter \/>/);
    // High visibility: it sits right after the lead Executive Command Center.
    expect(ws.indexOf('<ExecutiveRestartReadinessCommandCenter />')).toBeGreaterThan(
      ws.indexOf('<ExecutiveCommandCenter />'),
    );
    expect(ws.indexOf('<ExecutiveRestartReadinessCommandCenter />')).toBeLessThan(
      ws.indexOf('<PortfolioSummary />'),
    );
  });

  it('adds no hidden write primitives, fetches, SDK calls, external sync, or borrower sends', () => {
    for (const file of READONLY_FILES) {
      const src = SRC(file);
      expect(src, file).not.toMatch(/\bfetch\s*\(/);
      expect(src, file).not.toMatch(/XMLHttpRequest/);
      expect(src, file).not.toMatch(/graph\.microsoft\.com/i);
      expect(src, file).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
      expect(src, file).not.toMatch(/\bsendMail\b|\bsendBorrower/i);
      expect(src, file).not.toMatch(/@microsoft\/power-apps/);
      expect(src, file).not.toMatch(/from ['"][^'"]*\/generated\//);
    }
  });

  it('does not widen routes or permissions (no route/permission/role mutation in these surfaces)', () => {
    for (const file of READONLY_FILES) {
      const src = SRC(file);
      expect(src, file).not.toMatch(/WORKSPACE_ROUTES|deriveWorkspaceLinks|useEntitledRoutes/);
      expect(src, file).not.toMatch(/grantEntitlement|grantRole|addRole|securityRole/i);
    }
  });

  it('implies no external Salesforce / nCino vendor dependency', () => {
    const managerVm = deriveManagerOperatingCommandCenterModel();
    const execVm = deriveExecutiveRestartReadinessModel();
    expect(JSON.stringify(managerVm)).not.toMatch(/salesforce|ncino/i);
    // The executive view explicitly asserts no external Salesforce or nCino sync.
    expect(execVm.leadershipAssurances.join(' ')).toMatch(/Salesforce or nCino/);
  });

  it('surfaces are read-only and point to existing operating surfaces, not a parallel engine', () => {
    const managerVm = deriveManagerOperatingCommandCenterModel();
    expect(managerVm.supervisionAnchors).toContain('manager-bloomberg-control-panel');
    expect(managerVm.supervisionAnchors).toContain('crm-manager-working-surface');

    const execVm = deriveExecutiveRestartReadinessModel();
    // The executive model summarizes admin activation readiness as a clean
    // projection over the SAME shared feature-flag sources, without importing a
    // role directory (Phase 48 role isolation) and without re-implementing gates.
    const modelSrc = SRC('../../executive/executiveRestartReadinessModel.ts');
    expect(modelSrc).toMatch(/crmFeatureFlags|dealOriginationFeatureFlags|portfolioLoanBoardingFeatureFlags/);
    expect(modelSrc).not.toMatch(/from ['"]\.\.\/(banker|manager|team|executive|admin)\//);
    expect(execVm.domains.map((d) => d.id)).toContain('admin-activation');
  });

  it('reflects the Phase 256B launched live-write domains while New Deal create stays gated', () => {
    const managerVm = deriveManagerOperatingCommandCenterModel();
    const byId = new Map(managerVm.domains.map((d) => [d.id, d]));
    // Phase 256B launched checklist, CRM writeback, borrower send, and portfolio boarding.
    for (const id of ['document-readiness', 'crm-writeback', 'borrower-communication', 'portfolio-boarding']) {
      expect(byId.get(id)?.state, id).toBe('operational');
    }
    // New Deal create stays gated by its global constant.
    expect(byId.get('new-deal-intake')?.state).toBe('gated');

    // The overall executive restart posture stays gated activation while New Deal create is gated.
    const execVm = deriveExecutiveRestartReadinessModel();
    expect(execVm.overallState).toBe('gated-activation');
  });
});
