// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EXPECTED_CRM_SDK_SERVICES,
  EXPECTED_CRM_DATA_SOURCES,
  CRM_SDK_CONTRACT,
  crmServiceFileName,
  deriveCrmSdkRegistrationStatus,
} from './crmSdkContract';

const ROOT = resolve(__dirname, '..', '..');
const SERVICES_DIR = resolve(ROOT, 'src/generated/services');
const crmFull = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/dataverse/schema/crm-full.schema.json'), 'utf8').replace(/^﻿/, ''),
);

describe('Phase 253B — full CRM SDK / data-source contract', () => {
  it('the CRM SDK contract is 10 generated services and 10 data sources', () => {
    expect(CRM_SDK_CONTRACT).toEqual({ services: 10, dataSources: 10 });
    expect(EXPECTED_CRM_SDK_SERVICES).toHaveLength(10);
    expect(EXPECTED_CRM_DATA_SOURCES).toHaveLength(10);
  });

  it('the expected data sources / services match crm-full.schema.json entity sets', () => {
    const fullEntitySets = crmFull.tables.map((t: { entitySetName: string }) => t.entitySetName).sort();
    expect([...EXPECTED_CRM_DATA_SOURCES].sort()).toEqual(fullEntitySets);
    const fullServices = fullEntitySets.map((e: string) => crmServiceFileName(e)).sort();
    expect([...EXPECTED_CRM_SDK_SERVICES].sort()).toEqual(fullServices);
  });

  it('old 5-service / 5-data-source state is BLOCKED (fail-closed)', () => {
    const r = deriveCrmSdkRegistrationStatus({ servicesPresent: 5, dataSourcesPresent: 5 });
    expect(r.status).toBe('BLOCKED');
    expect(r.complete).toBe(false);
    expect(r.missingServices).toBe(5);
    expect(r.missingDataSources).toBe(5);
  });

  it('full 10-service / 10-data-source state is PASS', () => {
    const r = deriveCrmSdkRegistrationStatus({ servicesPresent: 10, dataSourcesPresent: 10 });
    expect(r.status).toBe('PASS');
    expect(r.complete).toBe(true);
  });

  it('a partial state (services 10 but data sources 5, or vice-versa) stays BLOCKED', () => {
    expect(deriveCrmSdkRegistrationStatus({ servicesPresent: 10, dataSourcesPresent: 5 }).status).toBe('BLOCKED');
    expect(deriveCrmSdkRegistrationStatus({ servicesPresent: 5, dataSourcesPresent: 10 }).status).toBe('BLOCKED');
  });

  it('reflects the current repo: all 10 CRM services are now generated (operator regenerated the SDK)', () => {
    const present = EXPECTED_CRM_SDK_SERVICES.filter((f) => existsSync(resolve(SERVICES_DIR, f))).length;
    // Phase 253C: the operator ran the fixed regenerate-powerapps-sdk.ps1 → all 10 services exist.
    expect(present).toBe(CRM_SDK_CONTRACT.services);
    expect(deriveCrmSdkRegistrationStatus({ servicesPresent: present, dataSourcesPresent: present }).status).toBe('PASS');
  });
});
