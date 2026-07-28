import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CRM_ADMIN_CONNECTOR_MODE,
  CRM_ADMIN_LIVE_WRITE_ENABLED,
  CRM_ADMIN_SURFACE_ACTIVE,
  CRM_LIVE_PERSISTENCE_DEFAULT,
  CRM_ONBOARDING_DISABLED_REASON,
  CRM_ONBOARDING_NEXT_STEPS,
  CRM_ONBOARDING_READINESS,
  CRM_ONBOARDING_REQUIRED_DATA_GROUPS,
} from './adminCrmOnboardingModel';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';

/**
 * Phase 169E -- Admin CRM Onboarding model (Case B, disabled-by-default).
 */

describe('Phase 229 -- internal OGB CRM admin active', () => {
  it('the admin surface is active for governed internal CRM management but enables NO live write (CRM-I)', () => {
    expect(CRM_ADMIN_SURFACE_ACTIVE).toBe(true);
    // Live CRM writes are identity-gated in the CRM Hub, never from this admin surface.
    expect(CRM_ADMIN_LIVE_WRITE_ENABLED).toBe(false);
  });

  it('reads the certified live persistence flag, not a hardcoded value', () => {
    expect(CRM_LIVE_PERSISTENCE_DEFAULT).toBe(
      CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED,
    );
    expect(CRM_LIVE_PERSISTENCE_DEFAULT).toBe(true);
  });

  it('reports the external connector as disabled_by_default', () => {
    expect(CRM_ADMIN_CONNECTOR_MODE).toBe('disabled_by_default');
  });

  it('explains the governed internal CRM activation reason', () => {
    expect(CRM_ONBOARDING_DISABLED_REASON).toMatch(/live/i);
    expect(CRM_ONBOARDING_DISABLED_REASON).toMatch(/certification/i);
    expect(CRM_ONBOARDING_DISABLED_REASON).toMatch(/Salesforce|nCino/i);
  });
});

describe('Phase 169E -- readiness and data groups', () => {
  it('reports the CRM stack and internal persistence active while the external connector stays off', () => {
    const live = CRM_ONBOARDING_READINESS.find(
      (r) => r.label === 'Live runtime persistence enabled',
    );
    const connector = CRM_ONBOARDING_READINESS.find(
      (r) => r.label === 'External CRM connector enabled',
    );
    expect(live?.present).toBe(true);
    expect(connector?.present).toBe(false);
    expect(CRM_ONBOARDING_READINESS.some((r) => r.label === 'Persistence adapter' && r.present)).toBe(true);
  });

  it('lists all ten required CRM onboarding data groups', () => {
    const labels = CRM_ONBOARDING_REQUIRED_DATA_GROUPS.map((g) => g.label);
    expect(CRM_ONBOARDING_REQUIRED_DATA_GROUPS.length).toBe(10);
    for (const expected of [
      'Organizations',
      'People',
      'Contact points',
      'Relationships',
      'Role assignments',
      'Communication preferences',
      'Contact authorizations',
      'Vendor profiles',
      'Timeline events',
      'Audit entries',
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it('lists the three remaining operational follow-ups', () => {
    expect(CRM_ONBOARDING_NEXT_STEPS.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(CRM_ONBOARDING_NEXT_STEPS[2]!.title).toMatch(/CRM Hub/i);
  });
});

describe('Phase 169E -- model source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'adminCrmOnboardingModel.ts'), 'utf8');

  it('hardcodes no Dataverse GUID', () => {
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });

  it('introduces no fetch / XHR / Graph / Dataverse write primitives', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
  });
});
