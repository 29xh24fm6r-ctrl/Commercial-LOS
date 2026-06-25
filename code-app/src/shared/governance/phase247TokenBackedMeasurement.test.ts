// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
const EXPORT_REL = 'scripts/dataverse/export-runtime-schema-evidence.ps1';
const CRM_ARTIFACT = 'scripts/dataverse/evidence/runtime-schema-evidence.crm.json';
const PORTFOLIO_ARTIFACT = 'scripts/dataverse/evidence/runtime-schema-evidence.portfolio.json';
const DOC_REL = 'docs/PHASE_247_TOKEN_BACKED_LIVE_SCHEMA_MEASUREMENT.md';

describe('Phase 247 — token-backed live measurement governance contract', () => {
  it('the committed evidence artifacts are REAL token-backed measurements (not fabricated)', () => {
    for (const rel of [CRM_ARTIFACT, PORTFOLIO_ARTIFACT]) {
      const a = JSON.parse(read(rel).replace(/^﻿/, ''));
      expect(a.tokenValidated, rel).toBe(true);
      // PASS (portfolio) or BLOCKED (CRM: live schema complete but SDK registration 5/10) — both real.
      expect(['PASS', 'BLOCKED'], rel).toContain(a.status);
      expect(a.liveTables.found, rel).toBe(a.liveTables.checked);
      expect(a.liveTables.checked, rel).toBeGreaterThan(0);
      expect(a.measured, rel).not.toBeNull();
    }
  });

  it('the current committed evidence still does NOT hydrate (live spine incomplete vs the runtime plan)', () => {
    expect(hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated).toBe(false);
    expect(hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated).toBe(false);
    // Real measurement: tables live, but columns/required relationships below the plan.
    expect(CURRENT_CRM_VERIFICATION_EVIDENCE.liveTables.checked).toBeGreaterThan(0);
    expect(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE.measured?.requiredRelationshipsFound).toBe(0);
  });

  it('the export script is read-only (no mutation, no pac code push)', () => {
    const src = read(EXPORT_REL);
    expect(src).not.toMatch(/-Method\s+(Post|Patch|Delete|Put)/i);
    expect(src).not.toMatch(/New-Dataverse\w*IfMissing/);
    expect(src).not.toMatch(/pac\s+code\s+push/);
    // It only reads (WhoAmI / EntityDefinitions / RelationshipDefinitions via GET).
    expect(src).toMatch(/Invoke-DataverseGet|Test-DataverseTable/);
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

  it('does not touch or fabricate checklist or borrower/Outlook state', () => {
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(false);
  });

  it('the Phase 247 doc records the org target, command, 401 result, and remaining blockers', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## pac org target',
      '## Token-backed verifier command',
      '## CRM measured result',
      '## Portfolio measured result',
      '## Bridge hydration result',
      '## Remaining blockers',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/401/);
    expect(doc).toMatch(/live\s*=\s*0\s*\/\s*0/);
    expect(doc).toMatch(/not performed/i);
  });
});
