// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCrmSdkRegistrationStatus, CRM_SDK_CONTRACT } from '../../crm/crmSdkContract';
import { deriveProductionEnvironmentVerification, PRODUCTION_ENVIRONMENT_CERTIFICATION } from '../../admin/productionEnvironmentVerification';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../../crm/crmFeatureFlags';
import { hydrateVerifiedCrmSchemaState, CURRENT_CRM_VERIFICATION_EVIDENCE } from '../../admin/runtimeVerifiedSchemaBridge';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const REGEN_REL = 'scripts/dataverse/regenerate-powerapps-sdk.ps1';
const VERIFY_REL = 'scripts/dataverse/verify-full-crm-schema.ps1';
const EXPORT_REL = 'scripts/dataverse/export-runtime-schema-evidence.ps1';
const DOC_REL = 'docs/PHASE_253_FULL_CRM_RUNTIME_SCHEMA_BUILDOUT.md';

describe('Phase 253B — CRM SDK/data-source registration governance contract', () => {
  it('the regeneration path enumerates the FULL CRM schema (10 tables), not the 5-table spine', () => {
    const src = read(REGEN_REL);
    expect(src).toMatch(/crm-full\.schema\.json/);
    expect(src).not.toMatch(/'crm-spine\.schema\.json'/);
  });

  it('the export measures the full CRM schema so services/data sources count against 10', () => {
    const src = read(EXPORT_REL);
    expect(src).toMatch(/crm-full\.schema\.json/);
  });

  it('old 5/10 SDK state stays BLOCKED; only 10/10 passes (fail-closed)', () => {
    expect(deriveCrmSdkRegistrationStatus({ servicesPresent: 5, dataSourcesPresent: 5 }).status).toBe('BLOCKED');
    expect(deriveCrmSdkRegistrationStatus({ servicesPresent: 5, dataSourcesPresent: 10 }).status).toBe('BLOCKED');
    expect(deriveCrmSdkRegistrationStatus({ servicesPresent: 10, dataSourcesPresent: 10 }).status).toBe('PASS');
    expect(CRM_SDK_CONTRACT.services).toBe(10);
  });

  it('the verifier is stabilized: transient metadata errors become UNKNOWN, never false-missing', () => {
    const src = read(VERIFY_REL);
    // Tri-state probe: non-404 errors are 'unknown', not 'missing'.
    expect(src).toMatch(/return 'unknown'/);
    expect(src).toMatch(/return 'missing'/);
    // Any inconclusive check forces STATUS=UNKNOWN (retry), not a missing-schema FAIL.
    expect(src).toMatch(/\$unknown\s*-gt\s*0.*'UNKNOWN'/s);
    // A measured block is only emitted on a conclusive run (no inconclusive checks).
    expect(src).toMatch(/\$tokenOk\s*-and\s*\$unknown\s*-eq\s*0/);
    // PAC reachability vs token-backed metadata are treated distinctly.
    expect(src).toMatch(/PAC fetch reachability/);
  });

  it('CRM evidence hydrates only at full SDK (10/10); a 5/10 registration still fails closed', () => {
    // Phase 253C: the committed CRM evidence is full PASS (services 10/10) → hydrates.
    expect(hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated).toBe(true);
    // Regressing the SDK registration to 5/10 blocks hydration (fail-closed).
    const blocked = { ...CURRENT_CRM_VERIFICATION_EVIDENCE, status: 'BLOCKED' as const, services: { found: 5, expected: 10 } };
    expect(hydrateVerifiedCrmSchemaState(blocked).hydrated).toBe(false);
  });

  it('the launched platform has the CRM gate flipped and claims full launch (Phase 256B)', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(6);
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(6);
    expect(verification.fullLaunchReady).toBe(true);
  });

  it('no activation script performs pac code push', () => {
    for (const rel of [REGEN_REL, VERIFY_REL, EXPORT_REL]) {
      expect(read(rel), rel).not.toMatch(/(?:^|&|RUN:)\s*pac\s+code\s+push/m);
    }
  });

  it('the doc records the Phase 253B SDK registration fix', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    expect(doc).toContain('## Phase 253B');
    expect(doc).toMatch(/10 generated services|10 CRM/);
    expect(doc).toMatch(/not performed/i);
  });
});
