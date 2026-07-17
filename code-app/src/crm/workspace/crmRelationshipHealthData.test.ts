import { describe, it, expect } from 'vitest';
import { deriveOrgHealthInputs, deriveAccountRollupRecords } from './crmRelationshipHealthData';
import type { CrmWorkspaceData, CrmDomainKey, CrmRecord } from './crmWorkspaceData';

const NOW = '2026-07-17T00:00:00.000Z';

function rec(id: string, title: string, extra: Partial<CrmRecord> = {}): CrmRecord {
  return { id, title, detail: [], ...extra };
}

function ready(records: CrmRecord[]) {
  return { status: 'ready' as const, records };
}

function failed() {
  return { status: 'failed' as const, records: [] as CrmRecord[], error: 'boom' };
}

/** Full "everything ready" fixture: one org (o1) with a person, a relationship, and two timeline events. */
function fullFixture(): CrmWorkspaceData {
  return {
    organizations: ready([rec('o1', 'Acme Holdings')]),
    people: ready([rec('p1', 'Jane Doe', { organizationId: 'o1' })]),
    relationships: ready([rec('rel1', 'Acme Coverage', { organizationId: 'o1' })]),
    roleAssignments: ready([]),
    contactPoints: ready([]),
    communicationPreferences: ready([]),
    contactAuthorizations: ready([]),
    vendorProfiles: ready([]),
    timelineEvents: ready([
      rec('a1', 'call', { organizationId: 'o1', eventType: 'call', occurredAt: '2026-07-01T00:00:00.000Z' }),
      rec('a2', 'note', { organizationId: 'o1', eventType: 'note', occurredAt: '2026-07-10T00:00:00.000Z' }),
      rec('tk1', 'follow-up-task', { organizationId: 'o1', eventType: 'follow-up-task' }),
    ]),
    auditEntries: ready([]),
  };
}

function emptyDomainsFixture(): CrmWorkspaceData {
  return {
    organizations: ready([rec('o1', 'Acme Holdings')]),
    people: ready([]),
    relationships: ready([]),
    roleAssignments: ready([]),
    contactPoints: ready([]),
    communicationPreferences: ready([]),
    contactAuthorizations: ready([]),
    vendorProfiles: ready([]),
    timelineEvents: ready([]),
    auditEntries: ready([]),
  };
}

describe('deriveOrgHealthInputs', () => {
  it('derives real counts and the latest activity timestamp when every domain is ready', () => {
    const [result] = deriveOrgHealthInputs(fullFixture(), NOW);
    expect(result.organizationId).toBe('o1');
    expect(result.organizationName).toBe('Acme Holdings');
    expect(result.input.contactCount).toBe(1);
    expect(result.input.coverageCount).toBe(1);
    expect(result.input.activityCount).toBe(2);
    expect(result.input.lastActivityIso).toBe('2026-07-10T00:00:00.000Z'); // the later of the two activity events
    expect(result.input.openTaskCount).toBe(1);
    expect(result.input.hasAccount).toBe(true);
    expect(result.input.accountProvisional).toBe(false);
  });

  it('returns an evidenced real zero (not undefined) for an org with no linked people/relationships/events', () => {
    const [result] = deriveOrgHealthInputs(emptyDomainsFixture(), NOW);
    expect(result.input.contactCount).toBe(0);
    expect(result.input.coverageCount).toBe(0);
    expect(result.input.activityCount).toBe(0);
    expect(result.input.lastActivityIso).toBeNull();
    expect(result.input.openTaskCount).toBe(0);
  });

  it('overdueTaskCount is always undefined — a schema gap, not a bug (no status/completed field on timeline events)', () => {
    const [full] = deriveOrgHealthInputs(fullFixture(), NOW);
    const [empty] = deriveOrgHealthInputs(emptyDomainsFixture(), NOW);
    expect(full.input.overdueTaskCount).toBeUndefined();
    expect(empty.input.overdueTaskCount).toBeUndefined();
  });

  it('accountProvisional is always false — no provisional-account concept exists in this schema', () => {
    const [result] = deriveOrgHealthInputs(fullFixture(), NOW);
    expect(result.input.accountProvisional).toBe(false);
  });

  it('returns no results when the organizations domain itself failed to load', () => {
    const data = { ...fullFixture(), organizations: failed() };
    expect(deriveOrgHealthInputs(data, NOW)).toEqual([]);
  });

  describe('null-injection fuzz — one failed domain at a time leaves its CrmHealthInput field undefined, never 0', () => {
    const cases: Array<{ domain: CrmDomainKey; assert: (input: ReturnType<typeof deriveOrgHealthInputs>[number]['input']) => void }> = [
      {
        domain: 'people',
        assert: (input) => expect(input.contactCount).toBeUndefined(),
      },
      {
        domain: 'relationships',
        assert: (input) => expect(input.coverageCount).toBeUndefined(),
      },
      {
        domain: 'timelineEvents',
        assert: (input) => {
          expect(input.activityCount).toBeUndefined();
          expect(input.lastActivityIso).toBeUndefined();
          expect(input.openTaskCount).toBeUndefined();
        },
      },
    ];

    for (const { domain, assert } of cases) {
      it(`${domain} status:'failed' → corresponding CrmHealthInput field(s) are undefined`, () => {
        const data = { ...fullFixture(), [domain]: failed() };
        const [result] = deriveOrgHealthInputs(data, NOW);
        assert(result.input);
      });
    }
  });
});

describe('deriveAccountRollupRecords', () => {
  it('assembles rollup records via the existing deriveCrmRelationshipHealth band, teamId always null', () => {
    const orgHealthInputs = deriveOrgHealthInputs(fullFixture(), NOW);
    const bankerIdByOrgId = new Map([['o1', 'banker-1']]);
    const [row] = deriveAccountRollupRecords(orgHealthInputs, bankerIdByOrgId, NOW);
    expect(row.accountId).toBe('o1');
    expect(row.bankerId).toBe('banker-1');
    expect(row.teamId).toBeNull();
    expect(row.openTasks).toBe(1);
    expect(row.overdueTasks).toBe(0);
    expect(row.coverageCount).toBe(1);
    expect(['healthy', 'watch', 'at-risk', 'unknown']).toContain(row.healthBand);
  });

  it('bankerId falls back to null when the org is absent from the supplied map (never guessed)', () => {
    const orgHealthInputs = deriveOrgHealthInputs(fullFixture(), NOW);
    const [row] = deriveAccountRollupRecords(orgHealthInputs, new Map(), NOW);
    expect(row.bankerId).toBeNull();
  });
});
