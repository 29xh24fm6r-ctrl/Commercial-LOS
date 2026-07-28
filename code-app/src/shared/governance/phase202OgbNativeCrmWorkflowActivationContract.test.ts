import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveOgbCrmWorkflowActivation } from '../../admin/ogbCrmWorkflowActivationModel';
import { deriveReleaseGovernanceSnapshot } from '../../admin/releaseGovernanceSnapshot';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import { BANKER_CREATE_PILOT_ENABLED } from '../../deals/bankerCreatePilotConfig';
import { CRM_LIVE_PERSISTENCE_ENABLED } from '../../crm/crmFeatureFlags';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';

/**
 * PHASE 202 — OGB-native CRM + lending workflow activation contract.
 *
 * The internal OGB CRM + lending workflow read surfaces are active (read-only),
 * reframed away from "external connection disabled" / external Salesforce/nCino
 * brand copy on the user-facing surfaces. Unsafe write categories stay gated.
 * No fake data, no broad write enablement, no entitlement/route widening.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_202_OGB_NATIVE_CRM_WORKFLOW_ACTIVATION.md';
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

const BANKER_PANEL = read('src/banker/BankerCrmIntelligencePanel.tsx');
const BANKER_SURFACE = read('src/crm/workspaceIntegration/CrmBankerWorkingSurface.tsx');
const PREVIEW_INPUTS = read('src/crm/workspaceIntegration/crmWorkspacePreviewInputs.ts');
const ACTIVATION_PANEL = read('src/admin/OgbCrmWorkflowActivationPanel.tsx');
const ADMIN_WORKSPACE = read('src/workspaces/AdminWorkspace.tsx');
const APP = read('src/App.tsx');
const ADMIN_OPS = read('src/admin/AdminOperationsConsole.tsx');

/** User-facing production CRM surfaces that must read as internal-active. */
const USER_FACING = [BANKER_PANEL, BANKER_SURFACE, PREVIEW_INPUTS, ACTIVATION_PANEL];

describe('202 — doc + snapshot', () => {
  it('the Phase 202 doc exists', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });
  it('the snapshot references Phase 202', () => {
    expect(SNAPSHOT).toMatch(/PHASE_202_OGB_NATIVE_CRM_WORKFLOW_ACTIVATION/);
  });
});

describe('202 — internal activation model', () => {
  const a = deriveOgbCrmWorkflowActivation();

  it('internal OGB CRM + lending workflow are active', () => {
    expect(a.internalCrmActive).toBe(true);
    expect(a.internalWorkflowActive).toBe(true);
  });

  it('write categories are gated (safe default); certified pilot is enabled', () => {
    expect(a.writebackStatus).toBe('gated');
    expect(a.checklistGenerationStatus).toBe('gated');
    expect(a.borrowerCommunicationStatus).toBe('gated');
    expect(a.pilotCreateStatus).toBe('enabled');
  });

  it('is derived from the real gate constants', () => {
    expect(CRM_LIVE_PERSISTENCE_ENABLED).toBe(false); // writeback gated (safe default)
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(BANKER_CREATE_PILOT_ENABLED).toBe(true); // certified pilot
  });

  it('surfaces honest remaining-gated blockers (broad workflow writes stay gated)', () => {
    expect(a.remainingBlockers.join(' ')).toMatch(/broad workflow writes gated/i);
    expect(a.remainingBlockers.length).toBeGreaterThan(0);
  });
});

describe('202 — historical activation surface retained + admin route gated', () => {
  it('AdminWorkspace retires the competing activation panel in favor of final certification', () => {
    expect(ADMIN_WORKSPACE).not.toContain('OgbCrmWorkflowActivationPanel');
    expect(ADMIN_WORKSPACE).toContain('FinalOperatingCertificationPanel');
  });
  it('the admin workspace is reached only through the admin-gated route (no widening)', () => {
    expect(APP).toMatch(/<WorkspaceGate allowed=\{WORKSPACE_ROUTES\.admin\}>\s*<AdminWorkspace\s*\/>/);
    expect(Object.keys(WORKSPACE_ROUTES)).toHaveLength(5);
    // Admin console re-derives admin authorization (fails closed for non-admin).
    expect(ADMIN_OPS).toMatch(/isAdminConsoleAuthorized/);
  });
  it('the activation panel exposes no action control', () => {
    expect(ACTIVATION_PANEL).not.toMatch(/<button/);
    expect(ACTIVATION_PANEL).not.toMatch(/onClick|onSubmit/);
    expect(ACTIVATION_PANEL).not.toMatch(/createRecordAsync|updateRecordAsync|getClient|\bfetch\(/);
  });
});

describe('202 — user-facing surfaces are OGB-native active (no external/brand copy)', () => {
  it('no production CRM surface renders "external connection disabled" or "Preview-only" posture', () => {
    for (const src of USER_FACING) {
      expect(src).not.toMatch(/external connection disabled/i);
      expect(src).not.toMatch(/Preview-only\b/);
    }
  });

  it('the rendered-output brand-absence checks are enforced by the surface tests', () => {
    // The authoritative "no Salesforce/nCino in rendered HTML" assertions live in
    // the component tests (which render real output). Pin that they remain.
    const bankerPanelTest = read('src/banker/BankerCrmIntelligencePanel.test.tsx');
    const bankerSurfaceTest = read('src/crm/workspaceIntegration/CrmBankerWorkingSurface.test.tsx');
    expect(bankerPanelTest).toMatch(/not\.toMatch\(\/\\bSalesforce\\b\/i?\)/);
    expect(bankerPanelTest).toMatch(/not\.toMatch\(\/\\bnCino\\b\/i?\)/);
    expect(bankerSurfaceTest).toMatch(/not\.toMatch\(\/\\bSalesforce\\b\/\)/);
    expect(bankerSurfaceTest).toMatch(/not\.toMatch\(\/\\bnCino\\b\/\)/);
  });

  it('the banker CRM surfaces present an active CRM + loan workflow posture (bank-user copy)', () => {
    expect(PREVIEW_INPUTS).toMatch(/CRM is active/);
    expect(PREVIEW_INPUTS).toMatch(/Loan workflow is active/);
    expect(BANKER_PANEL).toMatch(/CRM active/);
    expect(BANKER_PANEL).toMatch(/Loan workflow is active/);
    expect(BANKER_SURFACE).toMatch(/CRM is active/);
  });

  it('the launch-readiness CRM domain label is OGB-native (no external brand)', () => {
    const r = deriveReleaseGovernanceSnapshot();
    const crm = r.domains.find((d) => d.id === 'crm-salesforce-ncino')!;
    expect(crm.label).not.toMatch(/Salesforce|nCino/);
    expect(crm.label).toMatch(/OGB CRM/);
  });
});

describe('202 — governance posture preserved', () => {
  it('full-system readiness remains deterministic CONDITIONAL_GO', () => {
    expect(deriveReleaseGovernanceSnapshot().recommendation).toBe('CONDITIONAL_GO');
  });
  it('no fake-data identifiers in the reframed surfaces', () => {
    const FAKE = /\b(sampleDeals|demoData|mockClients|fakeBorrower|sampleData|seedData|FAKE_DATA)\b/;
    for (const src of [...USER_FACING, read('src/admin/ogbCrmWorkflowActivationModel.ts')]) {
      expect(src).not.toMatch(FAKE);
    }
  });
});
