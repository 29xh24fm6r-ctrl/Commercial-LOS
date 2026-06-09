import { describe, it, expect } from 'vitest';
import { derivePlatformObjectCatalog } from './derivePlatformObjectCatalog';
import { PLATFORM_OBJECT_REGISTRY } from './platformObjectRegistry';
import type { PlatformViewerWorkspace } from './platformSurfaceTypes';

/**
 * Phase 142B — object catalog deriver pins.
 */

function catalog(workspace: PlatformViewerWorkspace) {
  return derivePlatformObjectCatalog({ context: { workspace } });
}
function keys(workspace: PlatformViewerWorkspace) {
  return catalog(workspace).map((o) => o.objectKey);
}

describe('Phase 142B — object catalog', () => {
  it('banker sees banker-relevant objects only (no manager-only objects)', () => {
    const k = keys('banker');
    expect(k).toContain('deal');
    expect(k).toContain('crm_organization');
    expect(k).not.toContain('fdic_package');
    expect(k).not.toContain('board_package');
    expect(k).not.toContain('portfolio_boarded_loan');
    for (const o of catalog('banker')) expect(['banker', 'shared']).toContain(o.ownerWorkspace);
  });

  it('manager sees manager / portfolio-safe objects', () => {
    const k = keys('manager');
    expect(k).toContain('fdic_package');
    expect(k).toContain('board_package');
    expect(k).toContain('portfolio_boarded_loan');
  });

  it('executive sees an executive-safe catalog only (no banker/manager-owned)', () => {
    const k = keys('executive');
    expect(k).not.toContain('deal');
    expect(k).not.toContain('fdic_package');
  });

  it('admin / strategy can see the full catalog (metadata only)', () => {
    expect(keys('admin')).toHaveLength(PLATFORM_OBJECT_REGISTRY.length);
    expect(keys('strategy')).toHaveLength(PLATFORM_OBJECT_REGISTRY.length);
  });

  it('writeEnabledDefault remains false for every object', () => {
    for (const o of catalog('strategy')) expect(o.writeEnabledDefault).toBe(false);
  });

  it('object visibility exposes metadata only (no record data)', () => {
    const serialized = JSON.stringify(catalog('strategy'));
    expect(serialized).not.toMatch(/"records"|"value":|recordId/);
  });

  it('uses no fake source tables and invents no routes', () => {
    for (const o of catalog('strategy')) {
      if (o.sourceTable) expect(o.sourceTable.startsWith('cr664_') || o.sourceTable === 'systemuser').toBe(true);
      expect('route' in o).toBe(false);
    }
  });
});
