// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hydrateVerifiedCrmSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  type CrmSchemaVerificationEvidence,
} from '../../admin/runtimeVerifiedSchemaBridge';
import { EXPECTED_CRM_SCHEMA } from '../../crm/crmRuntimeSchemaGate';
import { deriveProductionEnvironmentVerification, PRODUCTION_ENVIRONMENT_CERTIFICATION } from '../../admin/productionEnvironmentVerification';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../../portfolioBoarding/portfolioLoanBoardingFeatureFlags';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const CREATE_REL = 'scripts/dataverse/create-full-crm-runtime-schema.ps1';
const VERIFY_REL = 'scripts/dataverse/verify-full-crm-schema.ps1';
const SCHEMA_REL = 'scripts/dataverse/schema/crm-full.schema.json';
const DOC_REL = 'docs/PHASE_253_FULL_CRM_RUNTIME_SCHEMA_BUILDOUT.md';
const NOW = Date.parse('2026-06-25T13:00:00.000Z');

describe('Phase 253 — full CRM schema buildout governance contract', () => {
  it('the current full CRM evidence hydrates; a spine measurement (5/40) does NOT', () => {
    // Phase 253C: the committed CRM evidence is the full schema + SDK → hydrates.
    expect(hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated).toBe(true);
    const spine: CrmSchemaVerificationEvidence = {
      status: 'BLOCKED',
      services: { found: 5, expected: 10 },
      dataSources: { found: 5, expected: 10 },
      liveTables: { found: 5, checked: 5 },
      measured: { tablesFound: 5, columnsFound: 40, relationshipsFound: 0, conflicts: 0 },
      verifiedAtIso: '2026-06-25T12:59:00.000Z',
    };
    expect(hydrateVerifiedCrmSchemaState(spine, { nowEpochMs: NOW }).hydrated).toBe(false);
    const full: CrmSchemaVerificationEvidence = {
      status: 'PASS',
      services: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
      dataSources: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
      liveTables: { found: EXPECTED_CRM_SCHEMA.tables, checked: EXPECTED_CRM_SCHEMA.tables },
      measured: { tablesFound: EXPECTED_CRM_SCHEMA.tables, columnsFound: EXPECTED_CRM_SCHEMA.columns, relationshipsFound: EXPECTED_CRM_SCHEMA.relationships, conflicts: 0 },
      verifiedAtIso: '2026-06-25T12:59:00.000Z',
    };
    expect(hydrateVerifiedCrmSchemaState(full, { nowEpochMs: NOW }).hydrated).toBe(true);
  });

  it('the launched platform has the CRM + portfolio gates flipped and claims full launch (Phase 256B)', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(6);
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(6);
    expect(verification.fullLaunchReady).toBe(true);
  });

  it('the create script is additive, create-missing-only, and never deletes/renames or pushes', () => {
    const src = read(CREATE_REL);
    // No destructive metadata operations.
    expect(src).not.toMatch(/-Method\s+(Delete|Put|Patch)/i);
    expect(src).not.toMatch(/\bRemove-Item\b|\bDELETE\b/);
    expect(src).not.toMatch(/(?:^|&|RUN:)\s*pac\s+code\s+push/m);
    // Dry-run default + create-missing-only discipline.
    expect(src).toMatch(/CREATE-MISSING-ONLY/);
    expect(src).toMatch(/IfMissing/);
    expect(src).toMatch(/DRY-RUN BY DEFAULT/i);
  });

  it('the create script is idempotent by relationship schema AND referencing lookup attribute (Phase 253A)', () => {
    const src = read(CREATE_REL);
    // Inspects the referencing lookup attribute + its Targets, not just the relationship schema name.
    expect(src).toMatch(/LookupAttributeMetadata/);
    expect(src).toMatch(/Get-CrmLookupAttributeState/);
    // Existing lookup with the expected target counts present; wrong target fails closed.
    expect(src).toMatch(/targets\s+-contains\s+\$r\.toTable/);
    expect(src).toMatch(/mismatch/);
    // No destructive metadata op even on the relationship path.
    expect(src).not.toMatch(/-Method\s+(Delete|Put|Patch)/i);
  });

  it('the verify script recognizes lookup-attribute coverage without weakening target validation', () => {
    const src = read(VERIFY_REL);
    expect(src).toMatch(/Get-RelPresence/);
    expect(src).toMatch(/LookupAttributeMetadata/);
    // Coverage requires the lookup to target the EXPECTED entity (target validation intact).
    expect(src).toMatch(/-contains\s+\$r\.toTable/);
  });

  it('the verify script is read-only (GET only, no mutation, no push) and fails closed', () => {
    const src = read(VERIFY_REL);
    expect(src).not.toMatch(/-Method\s+(Post|Patch|Delete|Put)/i);
    expect(src).not.toMatch(/(?:^|&|RUN:)\s*pac\s+code\s+push/m);
    expect(src).toMatch(/Invoke-DataverseGet|Test-DataverseTable/);
    // STATUS=PASS requires the full contract; UNKNOWN when no token.
    expect(src).toMatch(/\$complete\b/);
  });

  it('the schema + scripts reference the full CRM contract (10 / 147 / 28)', () => {
    const schema = JSON.parse(read(SCHEMA_REL).replace(/^﻿/, ''));
    expect(schema.expected).toEqual({ tables: 10, columns: 147, relationships: 28 });
    for (const rel of [CREATE_REL, VERIFY_REL]) {
      const src = read(rel);
      expect(src, rel).toMatch(/10 tables/);
      expect(src, rel).toMatch(/147 columns/);
      expect(src, rel).toMatch(/28 relationships/);
    }
  });

  it('the Phase 253 doc records the delta, operator commands, and that no gate/push happened', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## CRM schema delta',
      '## Operator commands to apply the full CRM schema',
      '## Verification commands',
      '## Remaining blockers',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/10 tables/);
    expect(doc).toMatch(/147 columns/);
    expect(doc).toMatch(/28 relationships/);
    expect(doc).toMatch(/not performed/i);
  });
});
