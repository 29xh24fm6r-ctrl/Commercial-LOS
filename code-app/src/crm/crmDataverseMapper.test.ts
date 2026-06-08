import { describe, it, expect } from 'vitest';
import {
  mapOrganizationToDataverse,
  mapPersonToDataverse,
  mapContactPointToDataverse,
  mapRelationshipToDataverse,
  mapCommunicationPreferenceToDataverse,
  mapContactAuthorizationToDataverse,
  mapVendorProfileToDataverse,
  mapAuditEntryToDataverse,
  redactSensitive,
  CrmSensitiveValueError,
  CRM_ENTITIES,
} from './crmDataverseMapper';
import type {
  CrmOrganization,
  CrmPerson,
  CrmContactPoint,
  CrmRelationship,
  CrmCommunicationPreference,
  CrmContactAuthorization,
  CrmVendorProfile,
  CrmAuditEntry,
} from '../shared/crm/crmTypes';

/**
 * Phase 141L — CRM Dataverse mapper pins.
 *
 * Maps domain records to `cr664_crm*` payloads with nulls preserved, binds only
 * to allow-listed targets, tax identity kept as a boolean, and sensitive audit
 * values redacted.
 */

describe('Phase 141L — CRM mapper forward mapping', () => {
  it('maps an organization with nulls preserved', () => {
    const org: CrmOrganization = { orgId: 'ORG1', orgType: 'customer', status: 'active' };
    const { entityName, fields } = mapOrganizationToDataverse(org);
    expect(entityName).toBe(CRM_ENTITIES.organization);
    expect(fields.cr664_organizationidtext).toBe('ORG1');
    // Absent optional fields are explicitly null, never omitted.
    expect(fields.cr664_legalname).toBeNull();
    expect(fields.cr664_dbaname).toBeNull();
    expect(fields.cr664_taxidpresent).toBeNull();
    // cr664_name reuses an existing identifier — never invented.
    expect(fields.cr664_name).toBe('ORG1');
  });

  it('maps a person with an employer organization bind', () => {
    const person: CrmPerson = { personId: 'P1', orgId: 'ORG1', personType: 'customer_contact', status: 'active' };
    const { fields } = mapPersonToDataverse(person);
    expect(fields['cr664_EmployerOrganization@odata.bind']).toBe('/cr664_crmorganizations(ORG1)');
    expect(fields.cr664_personidtext).toBe('P1');
  });

  it('maps a contact point with do-not-contact and restricted use', () => {
    const cp = {
      contactPointId: 'CP1',
      ownerType: 'person',
      ownerId: 'P1',
      channel: 'email',
      doNotUse: true,
      restrictedUse: true,
    } as unknown as CrmContactPoint;
    const { fields } = mapContactPointToDataverse(cp);
    expect(fields.cr664_donotcontact).toBe(true);
    expect(fields.cr664_restricteduse).toBe(true);
    // No value provided → preserved as null (never invented).
    expect(fields.cr664_value).toBeNull();
  });

  it('maps communication preference JSON fields', () => {
    const pref: CrmCommunicationPreference = {
      prefId: 'PREF1',
      ownerType: 'person',
      ownerId: 'P1',
      preferredChannel: 'mail',
      doNotEmail: true,
    };
    const { fields } = mapCommunicationPreferenceToDataverse(pref);
    expect(JSON.parse(fields.cr664_allowedmethodsjson as string)).toEqual(['mail']);
    expect(JSON.parse(fields.cr664_prohibitedmethodsjson as string)).toEqual(['email']);
  });

  it('maps authorization flags', () => {
    const auth: CrmContactAuthorization = {
      authId: 'A1',
      personId: 'P1',
      authType: 'document_upload',
    };
    const { fields } = mapContactAuthorizationToDataverse(auth);
    expect(fields.cr664_authorizedforuploadlinks).toBe(true);
    expect(fields.cr664_authorizedforfinancialrequests).toBeNull();

    const revoked: CrmContactAuthorization = { authId: 'A2', personId: 'P1', authType: 'document_upload', revoked: true };
    expect(mapContactAuthorizationToDataverse(revoked).fields.cr664_authorizedforuploadlinks).toBe(false);
  });

  it('maps a vendor profile', () => {
    const vendor: CrmVendorProfile = { vendorId: 'V1', orgId: 'ORG1', vendorType: 'cpa', approvedVendor: true };
    const { entityName, fields } = mapVendorProfileToDataverse(vendor);
    expect(entityName).toBe(CRM_ENTITIES.vendorProfile);
    expect(fields.cr664_approvedvendor).toBe(true);
    expect(fields['cr664_Organization@odata.bind']).toBe('/cr664_crmorganizations(ORG1)');
  });

  it('maps a relationship to organization / person / loan binds — only allow-listed targets', () => {
    const rel: CrmRelationship = {
      relationshipId: 'R1',
      fromEntityType: 'organization',
      fromEntityId: 'ORG1',
      toEntityType: 'person',
      toEntityId: 'P1',
      relationshipType: 'guarantor',
      loanId: 'LOAN1',
    };
    const { fields } = mapRelationshipToDataverse(rel);
    expect(fields['cr664_SourceOrganization@odata.bind']).toBe('/cr664_crmorganizations(ORG1)');
    expect(fields['cr664_TargetPerson@odata.bind']).toBe('/cr664_crmpersons(P1)');
    expect(fields['cr664_BoardedLoan@odata.bind']).toBe('/cr664_portfolioboardedloans(LOAN1)');
    // No bind ever targets a disallowed table.
    const bindValues = Object.entries(fields)
      .filter(([k]) => k.endsWith('@odata.bind'))
      .map(([, val]) => val as string);
    for (const target of ['loandeals', 'clientrelationships', 'teams', 'bankers', 'platformusers', 'systemusers']) {
      expect(bindValues.some((bv) => bv.includes(target))).toBe(false);
    }
  });

  it('maps an audit entry with redaction', () => {
    const entry: CrmAuditEntry = {
      action: 'update',
      timestamp: '2026-06-08T00:00:00Z',
      previousValueSummary: 'old',
      newValueSummary: 'new',
      redacted: true,
    };
    const { fields } = mapAuditEntryToDataverse(entry);
    expect(fields.cr664_redacted).toBe(true);
    expect(fields.cr664_previousvaluesummary).toBe('[redacted]');
    expect(fields.cr664_newvaluesummary).toBe('[redacted]');
  });

  it('redacts emails / phones in non-redacted audit summaries too', () => {
    expect(redactSensitive('contact a-b.c@x-y.com please')).toContain('[redacted]');
    expect(redactSensitive('call 555-123-4567 now')).toContain('[redacted]');
    expect(redactSensitive(undefined)).toBeNull();
  });

  it('rejects a full tax id field if present', () => {
    const org = { orgId: 'ORG1', orgType: 'customer', status: 'active', taxId: '12-3456789' } as unknown as CrmOrganization;
    expect(() => mapOrganizationToDataverse(org)).toThrow(CrmSensitiveValueError);
  });
});

describe('Phase 141L — CRM mapper invents no fake data', () => {
  it('the mapper never emits a sample email / phone / dollar value', () => {
    const org: CrmOrganization = { orgId: 'ORG1', orgType: 'customer', status: 'active' };
    const person: CrmPerson = { personId: 'P1', personType: 'customer_contact', status: 'active' };
    const serialized = JSON.stringify([
      mapOrganizationToDataverse(org),
      mapPersonToDataverse(person),
    ]);
    expect(serialized).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(serialized).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
    expect(serialized).not.toMatch(/\$\s*\d/);
  });
});
