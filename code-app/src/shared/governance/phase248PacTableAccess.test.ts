// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { derivePacTableAccessReadiness } from '../../admin/pacTableAccessEvidence';
import {
  hydrateVerifiedCrmSchemaState,
  hydrateVerifiedBoardingSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
} from '../../admin/runtimeVerifiedSchemaBridge';
import { deriveProductionEnvironmentVerification, PRODUCTION_ENVIRONMENT_CERTIFICATION } from '../../admin/productionEnvironmentVerification';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const VERIFIER_REL = 'scripts/dataverse/verify-pac-table-access.ps1';
const DOC_REL = 'docs/PHASE_248_PAC_BACKED_LIVE_TABLE_ACCESS.md';

describe('Phase 248 — PAC-backed live table access governance contract', () => {
  it('records 18/18 PAC table reachability without claiming Web API metadata', () => {
    const vm = derivePacTableAccessReadiness();
    expect(vm.totalReachable).toBe(18);
    expect(vm.allTablesReachable).toBe(true);
    expect(vm.webApiMetadataMeasured).toBe(false);
  });

  it('does NOT weaken the bridge: CRM hydrates only from real full metadata, portfolio still fails closed', () => {
    // CRM hydrates from its real full token-backed metadata (Phase 253C) — NOT from PAC reachability.
    expect(hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated).toBe(true);
    // Portfolio reachability is PASS but its metadata is incomplete → still fails closed (bridge not weakened).
    expect(hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated).toBe(false);
    expect(derivePacTableAccessReadiness().runtimeHydrated).toBe(false);
  });

  it('flips no live gate and does not claim launch', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(1);
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);
  });

  it('does not touch checklist or borrower/Outlook state', () => {
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(false);
  });

  it('the PAC verifier is read-only (fetch only, no mutation, no deploy)', () => {
    const src = read(VERIFIER_REL);
    expect(src).toMatch(/pac\s+org\s+fetch/);
    expect(src).not.toMatch(/-Method\s+(Post|Patch|Delete|Put)/i);
    expect(src).not.toMatch(/New-Dataverse\w*IfMissing/);
    expect(src).not.toMatch(/(?:^|&|RUN:)\s*pac\s+code\s+push/m);
    expect(src).not.toMatch(/-Apply\b/);
  });

  it('the committed PAC artifacts are reachable-PASS with metadata UNKNOWN', () => {
    for (const rel of ['scripts/dataverse/evidence/pac-table-access.crm.json', 'scripts/dataverse/evidence/pac-table-access.portfolio.json']) {
      const a = JSON.parse(read(rel).replace(/^﻿/, ''));
      expect(a.status, rel).toBe('PASS');
      expect(a.reachable, rel).toBe(a.checked);
      expect(a.webApiMetadataMeasured, rel).toBe(false);
    }
  });

  it('the Phase 248 doc distinguishes the four evidence dimensions', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## PAC target',
      '## CRM PAC table access result',
      '## Portfolio PAC table access result',
      '## Web API metadata',
      '## Runtime hydration',
      '## Remaining blockers',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/5\s*\/\s*5/);
    expect(doc).toMatch(/13\s*\/\s*13/);
    expect(doc).toMatch(/not performed/i);
    expect(doc).toMatch(/UNKNOWN|blocked/i);
  });
});
