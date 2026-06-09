import { describe, it, expect } from 'vitest';
import { derivePlatformViews } from './derivePlatformViews';
import { PLATFORM_VIEW_REGISTRY } from './platformViewRegistry';

/**
 * Phase 142A — platform view model pins.
 */

describe('Phase 142A — platform views', () => {
  const { integrity } = derivePlatformViews();

  it('all views have a workspace and a required permission', () => {
    expect(integrity.allHaveWorkspace).toBe(true);
    expect(integrity.allHavePermission).toBe(true);
    expect(PLATFORM_VIEW_REGISTRY.length).toBeGreaterThanOrEqual(12);
  });

  it('no user-defined / raw query strings', () => {
    expect(integrity.noRawQueryStrings).toBe(true);
    for (const v of PLATFORM_VIEW_REGISTRY) {
      for (const f of v.filters) expect(typeof f.operator).toBe('string');
    }
  });

  it('all views are read-only and reference a known object', () => {
    expect(integrity.allReadOnly).toBe(true);
    expect(integrity.allReferenceKnownObject).toBe(true);
  });

  it('every view has an honest empty state', () => {
    expect(integrity.allHaveEmptyState).toBe(true);
    expect(integrity.violations).toEqual([]);
  });
});
