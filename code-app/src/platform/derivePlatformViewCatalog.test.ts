import { describe, it, expect } from 'vitest';
import { derivePlatformViewCatalog } from './derivePlatformViewCatalog';
import type { PlatformViewerWorkspace } from './platformSurfaceTypes';

/**
 * Phase 142B — view catalog deriver pins.
 */

function views(workspace: PlatformViewerWorkspace) {
  return derivePlatformViewCatalog({ context: { workspace } });
}
function keys(workspace: PlatformViewerWorkspace) {
  return views(workspace).map((v) => v.viewKey);
}

describe('Phase 142B — view catalog', () => {
  it('banker sees banker views (active deals / annual reviews due)', () => {
    const k = keys('banker');
    expect(k).toContain('banker_active_deals');
    expect(k).toContain('banker_annual_reviews_due');
  });

  it('manager sees exception / portfolio / package views', () => {
    const k = keys('manager');
    expect(k).toContain('manager_exception_queue');
    expect(k).toContain('fdic_package_readiness');
  });

  it('a blocked permission hides the view from a non-owning workspace', () => {
    // Banker does not see manager-only exception/FDIC views.
    const k = keys('banker');
    expect(k).not.toContain('manager_exception_queue');
    expect(k).not.toContain('fdic_package_readiness');
  });

  it('every view is read-only with no arbitrary query string and no invented route', () => {
    for (const v of views('strategy')) {
      expect(v.readOnly).toBe(true);
      for (const f of v.filters) expect(typeof f.operator).toBe('string');
      expect(v.route).toBeUndefined();
    }
  });

  it('admin / strategy sees the full view catalog', () => {
    expect(views('strategy').length).toBeGreaterThanOrEqual(12);
  });
});
