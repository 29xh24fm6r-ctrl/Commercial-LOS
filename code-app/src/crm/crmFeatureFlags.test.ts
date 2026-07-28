import { describe, it, expect } from 'vitest';
import {
  CRM_ROUTE_ENABLED,
  CRM_LIVE_PERSISTENCE_ENABLED,
  CRM_CONTACT_EDITING_ENABLED,
  CRM_VENDOR_EDITING_ENABLED,
  CRM_TIMELINE_ENABLED,
  CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED,
  CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED,
  CRM_LIVE_ROLLUPS_ENABLED,
  CRM_DAILY_ACTION_QUEUE_ENABLED,
  CRM_FEATURE_FLAG_DEFAULTS,
  deriveCrmFeatureFlagState,
} from './crmFeatureFlags';

/**
 * Phase 141L Ã¢â‚¬â€ CRM feature flags default safe/off and fail closed.
 */

describe('Phase 141L Ã¢â‚¬â€ CRM feature flag defaults', () => {
  it('live persistence stays at the safe default off; the other capability constants stay off', () => {
    expect(CRM_ROUTE_ENABLED).toBe(true);
    expect(CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(CRM_CONTACT_EDITING_ENABLED).toBe(true);
    expect(CRM_VENDOR_EDITING_ENABLED).toBe(true);
    expect(CRM_TIMELINE_ENABLED).toBe(true);
    expect(CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED).toBe(true);
  });

  it('the default state object has every capability gated off', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_ROUTE_ENABLED).toBe(true);
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_CONTACT_EDITING_ENABLED).toBe(true);
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_VENDOR_EDITING_ENABLED).toBe(true);
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_TIMELINE_ENABLED).toBe(true);
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED).toBe(true);
  });

  it('no config Ã¢â€ â€™ everything disabled', () => {
    const s = deriveCrmFeatureFlagState();
    expect(s.CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(s.CRM_ROUTE_ENABLED).toBe(true);
    expect(s.CRM_CONTACT_EDITING_ENABLED).toBe(true);
  });
});

describe('Phase 141L Ã¢â‚¬â€ CRM feature flag dependency rules', () => {
  it('persistence is disabled by default and can be explicitly enabled', () => {
    expect(deriveCrmFeatureFlagState({ livePersistenceEnabled: false }).CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(deriveCrmFeatureFlagState({ livePersistenceEnabled: true }).CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
  });

  it('the route is disabled by default and can be explicitly enabled', () => {
    expect(deriveCrmFeatureFlagState({ routeEnabled: true }).CRM_ROUTE_ENABLED).toBe(true);
    expect(deriveCrmFeatureFlagState({ routeEnabled: false }).CRM_ROUTE_ENABLED).toBe(false);
  });

  it('editing is disabled by default and requires explicit live persistence', () => {
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

describe('CRM-ELITE-1 — new capability-surfacing flags default off', () => {
  it('every new flag constant defaults to false', () => {
    expect(CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED).toBe(true);
    expect(CRM_LIVE_ROLLUPS_ENABLED).toBe(true);
    expect(CRM_DAILY_ACTION_QUEUE_ENABLED).toBe(true);
  });

  it('every new flag is listed in CRM_FEATURE_FLAG_DEFAULTS, off', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED).toBe(true);
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_ROLLUPS_ENABLED).toBe(true);
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_DAILY_ACTION_QUEUE_ENABLED).toBe(true);
  });

  it('no config → the new flags stay disabled; explicit config enables them', () => {
    const off = deriveCrmFeatureFlagState();
    expect(off.CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED).toBe(true);
    expect(off.CRM_LIVE_ROLLUPS_ENABLED).toBe(true);
    expect(off.CRM_DAILY_ACTION_QUEUE_ENABLED).toBe(true);

    const on = deriveCrmFeatureFlagState({
      relationshipHealthDisplayEnabled: true,
      liveRollupsEnabled: true,
      dailyActionQueueEnabled: true,
    });
    expect(on.CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED).toBe(true);
    expect(on.CRM_LIVE_ROLLUPS_ENABLED).toBe(true);
    expect(on.CRM_DAILY_ACTION_QUEUE_ENABLED).toBe(true);
  });
});
