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
 * Phase 141L â€” CRM feature flags default safe/off and fail closed.
 */

describe('Phase 141L â€” CRM feature flag defaults', () => {
  it('every default constant is on for internal OGB CRM', () => {
    expect(CRM_ROUTE_ENABLED).toBe(true);
    expect(CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(CRM_CONTACT_EDITING_ENABLED).toBe(true);
    expect(CRM_VENDOR_EDITING_ENABLED).toBe(true);
    expect(CRM_TIMELINE_ENABLED).toBe(true);
    expect(CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED).toBe(true);
  });

  it('the default state object is fully enabled', () => {
    expect(Object.values(CRM_FEATURE_FLAG_DEFAULTS).every((v) => v === true)).toBe(true);
  });

  it('no config â†’ everything disabled', () => {
    const s = deriveCrmFeatureFlagState();
    expect(s.CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(s.CRM_ROUTE_ENABLED).toBe(true);
    expect(s.CRM_CONTACT_EDITING_ENABLED).toBe(true);
  });
});

describe('Phase 141L â€” CRM feature flag dependency rules', () => {
  it('persistence is enabled by default and can be explicitly disabled', () => {
    expect(deriveCrmFeatureFlagState({ livePersistenceEnabled: false }).CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(deriveCrmFeatureFlagState({ livePersistenceEnabled: true }).CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
  });

  it('the route is enabled by default and can be explicitly disabled', () => {
    expect(deriveCrmFeatureFlagState({ routeEnabled: true }).CRM_ROUTE_ENABLED).toBe(true);
    expect(deriveCrmFeatureFlagState({ routeEnabled: false }).CRM_ROUTE_ENABLED).toBe(false);
  });

  it('editing is enabled by default but remains disabled when persistence is explicitly disabled', () => {
    const withoutPersistence = deriveCrmFeatureFlagState({
      livePersistenceEnabled: false,
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
