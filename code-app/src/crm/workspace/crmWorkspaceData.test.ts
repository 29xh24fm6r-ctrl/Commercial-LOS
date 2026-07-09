import { describe, it, expect } from 'vitest';
import {
  mapOrganization,
  mapPerson,
  mapRelationship,
  mapRoleAssignment,
  mapContactPoint,
  mapCommunicationPreference,
  mapContactAuthorization,
  mapVendorProfile,
  mapTimelineEvent,
  mapAuditEntry,
  CRM_DOMAINS,
  type CrmRecord,
} from './crmWorkspaceData';

/**
 * Phase 258 — CRM workspace mappers project live rows to bank-user records.
 */

describe('Phase 258 — CRM domain mappers', () => {
  it('exposes all 10 CRM domains', () => {
    expect(CRM_DOMAINS.map((d) => d.key)).toEqual([
      'organizations',
      'people',
      'relationships',
      'roleAssignments',
      'contactPoints',
      'communicationPreferences',
      'contactAuthorizations',
      'vendorProfiles',
      'timelineEvents',
      'auditEntries',
    ]);
  });

  it('maps an organization to title/subtitle/detail', () => {
    const r = mapOrganization({
      cr664_crmorganizationid: 'org-1',
      cr664_displayname: 'Acme Holdings LLC',
      cr664_legalname: 'Acme Holdings, LLC',
      cr664_industry: 'Manufacturing',
      cr664_organizationtype: 'Borrower',
      cr664_taxidpresent: true,
      cr664_name: 'Acme',
    } as never);
    expect(r.id).toBe('org-1');
    expect(r.title).toBe('Acme Holdings LLC');
    expect(r.subtitle).toBe('Manufacturing');
    expect(r.detail).toContainEqual({ label: 'Legal name', value: 'Acme Holdings, LLC' });
    expect(r.detail).toContainEqual({ label: 'Tax ID on file', value: 'Yes' });
  });

  it('maps a person, falling back to first+last when no display name', () => {
    const r = mapPerson({
      cr664_crmpersonid: 'p-1',
      cr664_firstname: 'Dana',
      cr664_lastname: 'Banker',
      cr664_title: 'CFO',
      _cr664_employerorganization_value: 'org-9',
    } as never);
    expect(r.title).toBe('Dana Banker');
    expect(r.subtitle).toBe('CFO');
    // Employer-org FK is threaded through for drawer filtering (no new reads).
    expect(r.organizationId).toBe('org-9');
  });

  it('maps a relationship with an Active badge', () => {
    const r = mapRelationship({
      cr664_crmrelationshipid: 'rel-1',
      cr664_name: 'Acme ⇄ Dana',
      cr664_relationshiptype: 'Guarantor',
      cr664_role: 'Primary',
      cr664_active: true,
    } as never);
    expect(r.title).toBe('Acme ⇄ Dana');
    expect(r.badge).toBe('Active');
  });

  it('maps a vendor with an Approved badge', () => {
    const r = mapVendorProfile({
      cr664_crmvendorprofileid: 'v-1',
      cr664_name: 'Title Co',
      cr664_vendortype: 'Title',
      cr664_approvedvendor: true,
    } as never);
    expect(r.badge).toBe('Approved');
  });

  it('maps a timeline event with an occurredAt for ordering', () => {
    const r = mapTimelineEvent({
      cr664_crmtimelineeventid: 't-1',
      cr664_eventtype: 'Note added',
      cr664_summary: 'Called borrower',
      cr664_occurredat: '2026-06-20T10:00:00Z',
      _cr664_organization_value: 'org-9',
      _cr664_person_value: 'per-3',
    } as never);
    expect(r.title).toBe('Note added');
    expect(r.occurredAt).toBe('2026-06-20T10:00:00Z');
    // Org/person FKs + event type threaded through for drawer filtering + activity/task split.
    expect(r.organizationId).toBe('org-9');
    expect(r.personId).toBe('per-3');
    expect(r.eventType).toBe('Note added');
  });
});

describe('null-injection fuzz — Dataverse returns null, every mapper must stay honest and never crash', () => {
  // Dataverse empties come back as `null` (not undefined). A row where EVERY field is null is the
  // worst case; the ErrorBoundary-crash hazard lives here. Each mapper must produce a valid record.
  const mappers: ReadonlyArray<readonly [string, (row: never) => CrmRecord]> = [
    ['organization', mapOrganization],
    ['person', mapPerson],
    ['relationship', mapRelationship],
    ['roleAssignment', mapRoleAssignment],
    ['contactPoint', mapContactPoint],
    ['communicationPreference', mapCommunicationPreference],
    ['contactAuthorization', mapContactAuthorization],
    ['vendorProfile', mapVendorProfile],
    ['timelineEvent', mapTimelineEvent],
    ['auditEntry', mapAuditEntry],
  ];
  const allNullRow = new Proxy({}, { get: () => null }) as never;

  for (const [name, map] of mappers) {
    it(`${name}: an all-null row maps to an honest record without throwing`, () => {
      let rec: CrmRecord | undefined;
      expect(() => { rec = map(allNullRow); }).not.toThrow();
      // Always a non-empty fallback title (never blank, never null).
      expect(typeof rec!.title).toBe('string');
      expect(rec!.title.length).toBeGreaterThan(0);
      // Detail is always an array, and an empty/missing field is OMITTED — never rendered as a
      // null/undefined value row.
      expect(Array.isArray(rec!.detail)).toBe(true);
      for (const r of rec!.detail) expect(typeof r.value).toBe('string');
      // Optional string fields, when present, are strings (no null leak into the view type).
      for (const v of [rec!.badge, rec!.subtitle, rec!.occurredAt, rec!.organizationId, rec!.personId]) {
        expect(v === undefined || typeof v === 'string').toBe(true);
      }
    });
  }
});
