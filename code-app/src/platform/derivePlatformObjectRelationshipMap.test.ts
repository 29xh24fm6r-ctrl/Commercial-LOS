import { describe, it, expect } from 'vitest';
import { derivePlatformObjectRelationshipMap } from './derivePlatformObjectRelationshipMap';
import type { PlatformViewerWorkspace } from './platformSurfaceTypes';

/**
 * Phase 142B — relationship map deriver pins.
 */

function edges(workspace: PlatformViewerWorkspace) {
  return derivePlatformObjectRelationshipMap({ context: { workspace } });
}

describe('Phase 142B — relationship map', () => {
  it('CRM organization → person edge appears in admin/strategy context', () => {
    const e = edges('strategy');
    expect(e.some((x) => x.fromObjectKey === 'crm_organization' && x.toObjectKey === 'crm_person')).toBe(true);
  });

  it('annual review → package / evidence / covenant edges appear', () => {
    const e = edges('strategy');
    expect(e.some((x) => x.fromObjectKey === 'annual_review' && x.toObjectKey === 'memo_package')).toBe(true);
    expect(e.some((x) => x.fromObjectKey === 'annual_review' && x.toObjectKey === 'evidence')).toBe(true);
    expect(e.some((x) => x.fromObjectKey === 'annual_review' && x.toObjectKey === 'covenant_test_result')).toBe(true);
  });

  it('a hidden target is redacted', () => {
    // Banker cannot see board/fdic packages; memo_package → board_package should redact.
    const e = edges('banker');
    const redacted = e.filter((x) => x.fromObjectKey === 'memo_package' && !x.visible);
    expect(redacted.length).toBeGreaterThan(0);
    for (const r of redacted) expect(r.toObjectKey).toBe('redacted');
  });

  it('carries no record IDs and no PII', () => {
    const serialized = JSON.stringify(edges('strategy'));
    expect(serialized).not.toMatch(/recordId|"value":|@odata|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('only emits edges whose source object is visible', () => {
    // Executive sees few/no objects → few/no edges, never a banker-only source.
    const e = edges('executive');
    expect(e.every((x) => x.fromObjectKey !== 'deal')).toBe(true);
  });
});
