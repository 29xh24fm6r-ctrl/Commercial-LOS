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
import { EXPECTED_CRM_SCHEMA } from '../../crm/crmRuntimeSchemaGate';
import { deriveProductionEnvironmentVerification, PRODUCTION_ENVIRONMENT_CERTIFICATION } from '../../admin/productionEnvironmentVerification';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';

const ROOT = resolve(__dirname, '..', '..', '..');
const BRIDGE_REL = 'src/admin/runtimeVerifiedSchemaBridge.ts';
const DOC_REL = 'docs/PHASE_246_RUNTIME_VERIFIED_STATE_BRIDGE.md';

describe('Phase 246 — runtime verified-state bridge governance contract', () => {
  it('the CURRENT recorded evidence: CRM hydrates (full schema + SDK), portfolio hydrates (full 219/12)', () => {
    // Phase 253C: CRM is full PASS (10/10 services + 10/147 measured) → hydrates.
    expect(hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated).toBe(true);
    // Phase 255B: portfolio is now the FULL build (219 columns / 12 required + 6 optional rels) → hydrates.
    expect(hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated).toBe(true);
    expect(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE.measured?.requiredRelationshipsFound).toBe(12);
  });

  it('hydrates only on a complete, fresh, all-live PASS (bridge is not a constant stub)', () => {
    const now = Date.parse('2026-06-25T00:00:00.000Z');
    const crm = hydrateVerifiedCrmSchemaState(
      {
        status: 'PASS',
        services: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
        dataSources: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
        liveTables: { found: EXPECTED_CRM_SCHEMA.tables, checked: EXPECTED_CRM_SCHEMA.tables },
        measured: { tablesFound: EXPECTED_CRM_SCHEMA.tables, columnsFound: EXPECTED_CRM_SCHEMA.columns, relationshipsFound: EXPECTED_CRM_SCHEMA.relationships, conflicts: 0 },
        verifiedAtIso: '2026-06-25T00:00:00.000Z',
      },
      { nowEpochMs: now },
    );
    expect(crm.hydrated).toBe(true);
  });

  it('Completion Phase A: the live gate flags are at safe defaults (off) though all six certified — full launch NOT achieved (1/6)', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(6);
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);
  });

  it('Completion Phase A: checklist + borrower gates are at safe defaults (off)', () => {
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(false);
  });

  it('the bridge source is pure, read-only, and fabricates no PASS or flag flip', () => {
    const src = readFileSync(resolve(ROOT, BRIDGE_REL), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/_ENABLED\s*=\s*true/);
    expect(src).not.toMatch(/from ['"][^'"]*\/generated\//);
    // Hydration is derived from the data, never a literal: the full portfolio evidence hydrates,
    // but dropping its measured columns to the old spine count fails closed (proves it is not a constant).
    expect(hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated).toBe(true);
    expect(
      hydrateVerifiedBoardingSchemaState({
        ...CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
        measured: { ...CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE.measured!, columnsFound: 15, requiredRelationshipsFound: 0 },
      }).hydrated,
    ).toBe(false);
  });

  it('the Phase 246 doc exists with the required sections', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = readFileSync(resolve(ROOT, DOC_REL), 'utf8');
    for (const section of [
      '## Why Phase 245 did not flip gates',
      '## How terminal PASS evidence becomes runtime verified state',
      '## What still must happen before CRM/portfolio live gate cutover',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/live\s*=\s*0\s*\/\s*0/);
  });
});
