import { describe, it, expect } from 'vitest';
import { deriveCrmSyncPreviewPlan } from './crmSyncPreviewPlan';

describe('Phase 143D — CRM sync preview plan', () => {
  it('returns an empty preview with no deal identity', () => {
    const r = deriveCrmSyncPreviewPlan({});
    expect(r.rows).toEqual([]);
    expect(r.previewOnly).toBe(true);
  });

  it('uses would_* operations and never live-write verbs', () => {
    const r = deriveCrmSyncPreviewPlan({ dealId: 'D1', contactCount: 2, documentChecklistPresent: true });
    expect(r.rows.some((row) => row.operation === 'would_create')).toBe(true);
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/"operation":"(created|updated|linked)"/);
    expect(s.toLowerCase()).not.toMatch(/synced successfully|pushed successfully/);
  });

  it('links an existing account / relationship instead of creating', () => {
    const r = deriveCrmSyncPreviewPlan({ dealId: 'D1', existingSalesforceAccount: true, existingNcinoRelationship: true });
    expect(r.rows.find((x) => x.entity === 'account')?.operation).toBe('would_link');
    expect(r.rows.find((x) => x.entity === 'ncino_relationship')?.operation).toBe('would_link');
  });

  it('blocks all write-preview items when conflicts are present', () => {
    const r = deriveCrmSyncPreviewPlan({ dealId: 'D1', hasConflicts: true, contactCount: 2 });
    expect(r.blockedCount).toBeGreaterThan(0);
    expect(r.rows.find((x) => x.entity === 'account')?.operation).toBe('blocked');
  });

  it('keeps every live-effect flag false', () => {
    const r = deriveCrmSyncPreviewPlan({ dealId: 'D1' });
    expect(r.liveWritePerformed).toBe(false);
    expect(r.crmRecordCreated).toBe(false);
    expect(r.crmRecordUpdated).toBe(false);
    expect(r.crmRecordLinked).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });
});
