import { describe, expect, it } from 'vitest';
import type {
  CrmDomainResult,
  CrmRecord,
  CrmWorkspaceData,
} from './crmWorkspaceData';
import { governedOperationalCrmPopulation } from './governedCrmPopulation';

const ready = (records: readonly CrmRecord[] = []): CrmDomainResult => ({
  status: 'ready',
  records,
});
const record = (
  id: string,
  title: string,
  related: Partial<CrmRecord> = {},
): CrmRecord => ({ id, title, detail: [], ...related });
const fixture = (
  overrides: Partial<CrmWorkspaceData> = {},
): CrmWorkspaceData => ({
  organizations: ready(),
  people: ready(),
  relationships: ready(),
  roleAssignments: ready(),
  contactPoints: ready(),
  communicationPreferences: ready(),
  contactAuthorizations: ready(),
  vendorProfiles: ready(),
  timelineEvents: ready(),
  auditEntries: ready(),
  ...overrides,
});

describe('governedOperationalCrmPopulation', () => {
  it('excludes controlled companies and cascades the exclusion to their related records', () => {
    const result = governedOperationalCrmPopulation(
      fixture({
        organizations: ready([
          record('real-org', 'OmniCare 365'),
          record('test-org', 'OGB Full Workflow Test 07172026'),
        ]),
        people: ready([
          record('real-person', 'Real Person', { organizationId: 'real-org' }),
          record('test-person', 'Test Person', { organizationId: 'test-org' }),
        ]),
        timelineEvents: ready([
          record('real-event', 'Call', { organizationId: 'real-org' }),
          record('test-event', 'Call', {
            organizationId: 'test-org',
            personId: 'test-person',
          }),
        ]),
      }),
    );

    expect(result.organizations.records.map((r) => r.id)).toEqual(['real-org']);
    expect(result.people.records.map((r) => r.id)).toEqual(['real-person']);
    expect(result.timelineEvents.records.map((r) => r.id)).toEqual([
      'real-event',
    ]);
  });

  it('does not exclude legitimate testing-related business names', () => {
    const input = fixture({
      organizations: ready([
        record('real-org', 'Northwest Testing Labs'),
      ]),
    });
    expect(governedOperationalCrmPopulation(input)).toBe(input);
  });

  it('preserves failed-domain evidence', () => {
    const failed: CrmDomainResult = {
      status: 'failed',
      records: [],
      error: 'denied',
    };
    const result = governedOperationalCrmPopulation(
      fixture({
        organizations: ready([
          record('real-org', 'OmniCare 365'),
          record('test-org', 'SYSTEM TEST - Borrower'),
        ]),
        auditEntries: failed,
      }),
    );
    expect(result.auditEntries).toEqual(failed);
  });
});
