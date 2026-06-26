import { describe, it, expect } from 'vitest';
import {
  mapOrganization,
  mapPerson,
  mapRelationship,
  mapVendorProfile,
  mapTimelineEvent,
  CRM_DOMAINS,
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
    } as never);
    expect(r.title).toBe('Dana Banker');
    expect(r.subtitle).toBe('CFO');
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
    } as never);
    expect(r.title).toBe('Note added');
    expect(r.occurredAt).toBe('2026-06-20T10:00:00Z');
  });
});
