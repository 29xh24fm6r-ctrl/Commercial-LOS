// @vitest-environment node
/**
 * Phase 253P — Full portfolio runtime schema buildout: contract + fail-closed proofs.
 *
 * Proves the full portfolio runtime contract is 219 columns / 12 required relationships,
 * that the live Phase 252 spine does NOT hydrate, that a synthetic full measurement DOES,
 * that missing-column / missing-relationship evidence fails closed, that the buildout
 * script + verifier + runbook reference the complete contract, and that NO governed gate
 * is flipped (enabledCount stays 1/6, fullLaunchAchieved stays false).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hydrateVerifiedBoardingSchemaState,
  hydrateVerifiedCrmSchemaState,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  type BoardingSchemaVerificationEvidence,
} from '../admin/runtimeVerifiedSchemaBridge';
import { EXPECTED_BOARDING_SCHEMA } from './portfolioBoardingRuntimeSchemaGate';
import {
  PORTFOLIO_BOARDING_TARGET_COLUMNS,
  PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS,
} from './portfolioLoanBoardingDataverseSchemaPlan';
import { deriveFullProductionLaunchEvidence } from '../admin/fullProductionLaunchEvidence';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from './portfolioLoanBoardingFeatureFlags';

const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const FULL_SCHEMA = 'scripts/dataverse/schema/portfolio-boarding.full.schema.json';
const CREATE_SCRIPT = 'scripts/dataverse/create-full-portfolio-runtime-schema.ps1';
const VERIFY_SCRIPT = 'scripts/dataverse/verify-full-portfolio-runtime-schema.ps1';
const RUNBOOK = 'docs/PHASE_253P_FULL_PORTFOLIO_RUNTIME_SCHEMA_BUILDOUT.md';

const NOW = Date.parse('2026-06-25T12:00:00.000Z');
const fullSchema = JSON.parse(read(FULL_SCHEMA).replace(/^﻿/, ''));

/** A synthetic, fully-built portfolio measurement (the post-buildout target). */
const FULL_BOARDING: BoardingSchemaVerificationEvidence = {
  status: 'PASS',
  services: { found: EXPECTED_BOARDING_SCHEMA.tables, expected: EXPECTED_BOARDING_SCHEMA.tables },
  dataSources: { found: EXPECTED_BOARDING_SCHEMA.tables, expected: EXPECTED_BOARDING_SCHEMA.tables },
  liveTables: { found: EXPECTED_BOARDING_SCHEMA.tables, checked: EXPECTED_BOARDING_SCHEMA.tables },
  measured: {
    tablesFound: EXPECTED_BOARDING_SCHEMA.tables,
    columnsFound: EXPECTED_BOARDING_SCHEMA.columns,
    requiredRelationshipsFound: EXPECTED_BOARDING_SCHEMA.requiredRelationships,
    optionalRelationshipsFound: EXPECTED_BOARDING_SCHEMA.optionalRelationships,
    conflicts: 0,
  },
  verifiedAtIso: '2026-06-25T11:59:00.000Z',
};

describe('Phase 253P — portfolio runtime contract', () => {
  it('is exactly 13 tables / 219 columns / 12 required + 6 optional relationships', () => {
    expect(EXPECTED_BOARDING_SCHEMA).toEqual({
      tables: 13,
      columns: 219,
      requiredRelationships: 12,
      optionalRelationships: 6,
    });
    expect(PORTFOLIO_BOARDING_TARGET_COLUMNS.length).toBe(219);
    expect(PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS.filter((r) => r.required).length).toBe(12);
  });

  it('the full schema artifact advertises the same contract counts', () => {
    expect(fullSchema.expectedCounts).toEqual({
      tables: 13,
      columns: 219,
      requiredRelationships: 12,
      optionalRelationships: 6,
    });
  });
});

describe('Phase 253P — hydration fails closed on the live spine, succeeds on a full build', () => {
  it('the live Phase 252 measured spine (15 columns, 0 required rels) does NOT hydrate', () => {
    const r = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE, {
      nowEpochMs: NOW,
      maxAgeMs: Number.MAX_SAFE_INTEGER,
    });
    expect(r.hydrated).toBe(false);
    expect(r.verified).toBeNull();
    expect(r.blockers.join(' ')).toMatch(/columns|required relationships/);
  });

  it('a synthetic FULL portfolio measurement (219/12) hydrates', () => {
    const r = hydrateVerifiedBoardingSchemaState(FULL_BOARDING, { nowEpochMs: NOW });
    expect(r.hydrated).toBe(true);
    expect(r.verified?.columnsFound).toBe(219);
    expect(r.verified?.requiredRelationshipsFound).toBe(12);
    expect(r.verified?.conflicts).toBe(0);
  });

  it('missing-column evidence (218/219) fails closed', () => {
    const r = hydrateVerifiedBoardingSchemaState(
      { ...FULL_BOARDING, measured: { ...FULL_BOARDING.measured!, columnsFound: 218 } },
      { nowEpochMs: NOW },
    );
    expect(r.hydrated).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/columns/);
  });

  it('missing-required-relationship evidence (11/12) fails closed', () => {
    const r = hydrateVerifiedBoardingSchemaState(
      { ...FULL_BOARDING, measured: { ...FULL_BOARDING.measured!, requiredRelationshipsFound: 11 } },
      { nowEpochMs: NOW },
    );
    expect(r.hydrated).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/required relationships/);
  });

  it('a single live table missing (12/13) fails closed even with full columns', () => {
    const r = hydrateVerifiedBoardingSchemaState(
      { ...FULL_BOARDING, liveTables: { found: 12, checked: 13 } },
      { nowEpochMs: NOW },
    );
    expect(r.hydrated).toBe(false);
  });
});

describe('Phase 253P — the buildout artifacts reference the COMPLETE contract', () => {
  it('the full schema JSON references every plan column logical name', () => {
    const inJson = new Set<string>();
    for (const t of fullSchema.tables) for (const c of t.fullColumns) inJson.add(`${t.logicalName}.${c.logicalName}`);
    const missing = PORTFOLIO_BOARDING_TARGET_COLUMNS.map((c) => `${c.tableLogicalName}.${c.logicalName}`).filter(
      (k) => !inJson.has(k),
    );
    expect(missing).toEqual([]);
    expect(inJson.size).toBe(219);
  });

  it('the full schema JSON references every required relationship schema name', () => {
    const inJson = new Set<string>(fullSchema.relationships.map((r: any) => r.schemaName));
    const requiredPlan = PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS.filter((r) => r.required);
    for (const r of requiredPlan) expect(inJson.has(r.relationshipSchemaName), r.relationshipSchemaName).toBe(true);
    expect(fullSchema.relationships.filter((r: any) => r.required)).toHaveLength(12);
  });

  it('the buildout + verify scripts consume the generated full schema and are additive/fail-closed', () => {
    const create = read(CREATE_SCRIPT);
    const verify = read(VERIFY_SCRIPT);
    expect(create).toContain('portfolio-boarding.full.schema.json');
    expect(create).toMatch(/CREATE-MISSING-ONLY|create-missing-only/);
    expect(create).toMatch(/DRY-RUN BY DEFAULT/i);
    // The create script only POSTs new metadata; it must never PATCH or DELETE (additive only).
    expect(create).not.toMatch(/Invoke-RestMethod -Method (Patch|Delete)/);
    // The verifier is strictly read-only: it must never issue a mutating Web API call.
    expect(verify).toContain('portfolio-boarding.full.schema.json');
    expect(verify).toMatch(/READ-ONLY/i);
    expect(verify).not.toMatch(/Invoke-RestMethod -Method (Post|Patch|Delete)/);
  });

  it('the runbook documents the full contract counts and the exact operator scripts', () => {
    const doc = read(RUNBOOK);
    expect(doc).toContain('219');
    expect(doc).toContain('12');
    expect(doc).toContain('create-full-portfolio-runtime-schema.ps1');
    expect(doc).toContain('verify-full-portfolio-runtime-schema.ps1');
    // The runbook explicitly states the no-push / no-gate-flip posture.
    expect(doc).toMatch(/no .{0,4}pac code push/i);
  });
});

describe('Phase 253P — no governed gate is flipped by this phase', () => {
  it('enabledCount stays 1/6 and fullLaunchAchieved stays false', () => {
    const vm = deriveFullProductionLaunchEvidence();
    expect(vm.enabledCount).toBe(1);
    expect(vm.fullLaunchAchieved).toBe(false);
    const portfolio = vm.domains.find((d) => d.key === 'portfolioBoarding')!;
    expect(portfolio.enabled).toBe(false);
    expect(portfolio.gateFlagOn).toBe(false);
  });

  it('every portfolio boarding feature flag default remains OFF (fail-closed)', () => {
    for (const [k, v] of Object.entries(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS)) {
      expect(v, k).toBe(false);
    }
  });
});

describe('Phase 254A — relationship idempotency hotfix is wired into the scripts', () => {
  it('the create script is idempotent by the referencing lookup attribute (not just the schema name)', () => {
    const create = read(CREATE_SCRIPT);
    // Probes the referencing lookup attribute and its Targets, mirroring the CRM 253A fix.
    expect(create).toMatch(/Get-PortfolioLookupAttributeState/);
    expect(create).toMatch(/LookupAttributeMetadata\?.{0,8}\$select=Targets/);
    // Correct existing target → present (skip, no recreate); wrong type/target → fail closed.
    expect(create).toMatch(/already exists with target/);
    expect(create).toMatch(/mismatch \(fail closed\)/);
    // Never destructive.
    expect(create).not.toMatch(/Invoke-RestMethod -Method (Patch|Delete)/);
  });

  it('the verifier recognizes coverage by schema name OR correctly-targeted lookup, with a tri-state', () => {
    const verify = read(VERIFY_SCRIPT);
    expect(verify).toMatch(/Resolve-PortfolioRelCoverage/);
    expect(verify).toMatch(/LookupAttributeMetadata\?.{0,8}\$select=Targets/);
    // tri-state: present / missing / unknown / mismatch; unknown is NOT a false missing.
    expect(verify).toMatch(/'unknown'/);
    expect(verify).toMatch(/'mismatch'/);
    expect(verify).toMatch(/NOT counted as a false missing/i);
    // A wrong-target lookup must block PASS.
    expect(verify).toMatch(/mismatchRels\.Count -eq 0/);
    expect(verify).toMatch(/READ-ONLY/i);
    expect(verify).not.toMatch(/Invoke-RestMethod -Method (Post|Patch|Delete)/);
  });
});

describe('Phase 254A — hydration unchanged by the hotfix', () => {
  it('required relationship coverage is still REQUIRED for hydration (11/12 fails closed)', () => {
    const r = hydrateVerifiedBoardingSchemaState(
      { ...FULL_BOARDING, measured: { ...FULL_BOARDING.measured!, requiredRelationshipsFound: 11 } },
      { nowEpochMs: NOW },
    );
    expect(r.hydrated).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/required relationships/);
  });

  it('portfolio still does NOT hydrate until fresh measured PASS evidence is consumed', () => {
    const r = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE, {
      nowEpochMs: NOW,
      maxAgeMs: Number.MAX_SAFE_INTEGER,
    });
    expect(r.hydrated).toBe(false);
    expect(r.verified).toBeNull();
  });

  it('CRM hydration (Phase 253C) remains unchanged — the hotfix touches portfolio only', () => {
    const r = hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE, {
      nowEpochMs: NOW,
      maxAgeMs: Number.MAX_SAFE_INTEGER,
    });
    expect(r.hydrated).toBe(true);
  });
});
