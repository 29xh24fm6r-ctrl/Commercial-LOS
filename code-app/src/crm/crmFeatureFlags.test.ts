import { describe, it, expect } from 'vitest';
import {
  CRM_ROUTE_ENABLED,
  CRM_LIVE_PERSISTENCE_ENABLED,
  CRM_CONTACT_EDITING_ENABLED,
  CRM_VENDOR_EDITING_ENABLED,
  CRM_TIMELINE_ENABLED,
  CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED,
  CRM_FEATURE_FLAG_DEFAULTS,
  deriveCrmFeatureFlagState,
} from './crmFeatureFlags';

/**
 * Phase 141L — CRM feature flags default safe/off and fail closed.
 */

describe('Phase 141L — CRM feature flag defaults', () => {
  it('every default constant is off', () => {
    expect(CRM_ROUTE_ENABLED).toBe(false);
    expect(CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(CRM_CONTACT_EDITING_ENABLED).toBe(false);
    expect(CRM_VENDOR_EDITING_ENABLED).toBe(false);
    expect(CRM_TIMELINE_ENABLED).toBe(false);
    expect(CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED).toBe(false);
  });

  it('the default state object is fully disabled', () => {
    expect(Object.values(CRM_FEATURE_FLAG_DEFAULTS).every((v) => v === false)).toBe(true);
  });

  it('no config → everything disabled', () => {
    const s = deriveCrmFeatureFlagState();
    expect(s.CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(s.CRM_ROUTE_ENABLED).toBe(false);
    expect(s.CRM_CONTACT_EDITING_ENABLED).toBe(false);
  });
});

describe('Phase 141L — CRM feature flag dependency rules', () => {
  it('persistence is disabled by default and only enabled with an exact true', () => {
    expect(deriveCrmFeatureFlagState({ livePersistenceEnabled: false }).CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(deriveCrmFeatureFlagState({ livePersistenceEnabled: true }).CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
  });

  it('the route stays disabled in this phase even if the config asks for it', () => {
    expect(deriveCrmFeatureFlagState({ routeEnabled: true }).CRM_ROUTE_ENABLED).toBe(false);
  });

  it('editing cannot be enabled unless persistence is enabled', () => {
    const withoutPersistence = deriveCrmFeatureFlagState({
      contactEditingEnabled: true,
      vendorEditingEnabled: true,
      timelineEnabled: true,
    });
    expect(withoutPersistence.CRM_CONTACT_EDITING_ENABLED).toBe(false);
    expect(withoutPersistence.CRM_VENDOR_EDITING_ENABLED).toBe(false);
    expect(withoutPersistence.CRM_TIMELINE_ENABLED).toBe(false);

    const withPersistence = deriveCrmFeatureFlagState({
      livePersistenceEnabled: true,
      contactEditingEnabled: true,
    });
    expect(withPersistence.CRM_CONTACT_EDITING_ENABLED).toBe(true);
  });
});
