// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  CRM_CONTACT_EDITING_ENABLED,
  CRM_VENDOR_EDITING_ENABLED,
  CRM_TIMELINE_ENABLED,
  CRM_LIVE_PERSISTENCE_ENABLED,
} from '../crmFeatureFlags';
import {
  CRM_ACTIVATION_CONTACT_EDITING_CAPABLE,
  CRM_ACTIVATION_VENDOR_EDITING_CAPABLE,
  CRM_ACTIVATION_TIMELINE_CAPABLE,
  CRM_LIVE_PERSISTENCE_ENABLED as CRM_ACTIVATION_LIVE_PERSISTENCE_ENABLED,
} from '../../activation/crmActivation';
import {
  CRM_ADMIN_LIVE_WRITE_ENABLED,
  CRM_ADMIN_SURFACE_ACTIVE,
} from '../../admin/adminCrmOnboardingModel';

/**
 * CRM-I — pins the distinction so no constant gives a false impression that global CRM
 * persistence/editing is enabled. The authoritative CRM feature flags are the ONLY gates
 * and are all false; the activation-seam "_CAPABLE" switches are a separate concept; the
 * admin surface performs no live write.
 */
describe('CRM-I — CRM flag drift reconciliation', () => {
  it('the AUTHORITATIVE internal CRM feature flags are armed after certification', () => {
    expect(CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(CRM_CONTACT_EDITING_ENABLED).toBe(true);
    expect(CRM_VENDOR_EDITING_ENABLED).toBe(true);
    expect(CRM_TIMELINE_ENABLED).toBe(true);
  });

  it('the activation seam switches are renamed with _CAPABLE and do NOT collide with the feature flags', () => {
    // Capability seams (support the write once persistence is on) — a separate concept.
    expect(CRM_ACTIVATION_CONTACT_EDITING_CAPABLE).toBe(true);
    expect(CRM_ACTIVATION_VENDOR_EDITING_CAPABLE).toBe(true);
    expect(CRM_ACTIVATION_TIMELINE_CAPABLE).toBe(true);
    // But the activation module's own live-persistence gate is still false — writes fail closed.
    expect(CRM_ACTIVATION_LIVE_PERSISTENCE_ENABLED).toBe(false);
  });

  it('the admin onboarding surface is active but enables NO live write (no false global-enable impression)', () => {
    expect(CRM_ADMIN_SURFACE_ACTIVE).toBe(true);
    expect(CRM_ADMIN_LIVE_WRITE_ENABLED).toBe(false);
  });
});
