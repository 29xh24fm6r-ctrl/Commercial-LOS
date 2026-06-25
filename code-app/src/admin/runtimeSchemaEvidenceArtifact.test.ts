// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hydrateVerifiedCrmSchemaState,
  hydrateVerifiedBoardingSchemaState,
  type CrmSchemaVerificationEvidence,
  type BoardingSchemaVerificationEvidence,
} from './runtimeVerifiedSchemaBridge';
import { EXPECTED_CRM_SCHEMA } from '../crm/crmRuntimeSchemaGate';
import { EXPECTED_BOARDING_SCHEMA } from '../portfolioBoarding/portfolioBoardingRuntimeSchemaGate';

const ROOT = resolve(__dirname, '..', '..');
const load = (rel: string) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8').replace(/^﻿/, ''));
const CRM_ARTIFACT = 'scripts/dataverse/evidence/runtime-schema-evidence.crm.json';
const PORTFOLIO_ARTIFACT = 'scripts/dataverse/evidence/runtime-schema-evidence.portfolio.json';
const NOW = Date.parse('2026-06-25T12:00:00.000Z');

describe('Phase 247 — committed token-backed evidence artifacts', () => {
  it('the CRM artifact is honest fail-closed (token rejected, live=0/0, no measured) and does NOT hydrate', () => {
    const a = load(CRM_ARTIFACT);
    expect(a.tokenValidated).toBe(false);
    expect(a.liveTables).toEqual({ found: 0, checked: 0 });
    expect(a.measured).toBeNull();
    const r = hydrateVerifiedCrmSchemaState(a, { nowEpochMs: NOW, maxAgeMs: Number.MAX_SAFE_INTEGER });
    expect(r.hydrated).toBe(false);
  });

  it('the portfolio artifact is honest fail-closed and does NOT hydrate', () => {
    const a = load(PORTFOLIO_ARTIFACT);
    expect(a.tokenValidated).toBe(false);
    expect(a.liveTables).toEqual({ found: 0, checked: 0 });
    const r = hydrateVerifiedBoardingSchemaState(a, { nowEpochMs: NOW, maxAgeMs: Number.MAX_SAFE_INTEGER });
    expect(r.hydrated).toBe(false);
  });

  it('an AUTHORIZED token-backed measurement (live N/N + measured) hydrates — proving the export format is bridge-compatible', () => {
    const crm: CrmSchemaVerificationEvidence = {
      status: 'PASS',
      services: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
      dataSources: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
      liveTables: { found: EXPECTED_CRM_SCHEMA.tables, checked: EXPECTED_CRM_SCHEMA.tables },
      measured: { tablesFound: EXPECTED_CRM_SCHEMA.tables, columnsFound: EXPECTED_CRM_SCHEMA.columns, relationshipsFound: EXPECTED_CRM_SCHEMA.relationships, conflicts: 0 },
      verifiedAtIso: '2026-06-25T11:59:00.000Z',
    };
    expect(hydrateVerifiedCrmSchemaState(crm, { nowEpochMs: NOW }).hydrated).toBe(true);

    const portfolio: BoardingSchemaVerificationEvidence = {
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
    expect(hydrateVerifiedBoardingSchemaState(portfolio, { nowEpochMs: NOW }).hydrated).toBe(true);
  });

  it('regression: dropping a hydrating measurement back to live=0/0 fails closed again', () => {
    const crm: CrmSchemaVerificationEvidence = {
      status: 'PASS',
      services: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
      dataSources: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
      liveTables: { found: 0, checked: 0 },
      measured: { tablesFound: EXPECTED_CRM_SCHEMA.tables, columnsFound: EXPECTED_CRM_SCHEMA.columns, relationshipsFound: EXPECTED_CRM_SCHEMA.relationships, conflicts: 0 },
      verifiedAtIso: '2026-06-25T11:59:00.000Z',
    };
    expect(hydrateVerifiedCrmSchemaState(crm, { nowEpochMs: NOW }).hydrated).toBe(false);
  });
});
