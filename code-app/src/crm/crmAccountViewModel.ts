/**
 * Phase 193D — CRM Account / Contact / Coverage view-model.
 *
 * Pure. Assembles whatever authorized/loaded spine data is on hand into a render
 * model with explicit MISSING / PROVISIONAL markers. It fabricates nothing: a
 * field with no value renders as `missing`, a provisional Account identity (from
 * the borrower/client stub) renders as `provisional`, and absent sections are
 * named in `missingSections`. No emails, phones, titles, or company data are
 * invented.
 */

import type {
  CrmAccount,
  CrmContact,
  CrmCoverageTeamMember,
  CrmDealRelationship,
  CrmRelationshipHealth,
  CrmRelationshipRole,
  CrmSourceFact,
} from './crmSalesforceSpineModel';

export type CrmFieldState = 'present' | 'missing' | 'provisional';

export interface CrmField {
  label: string;
  value: string | null;
  state: CrmFieldState;
}

export interface CrmContactRow {
  id: string;
  fields: CrmField[];
}

export interface CrmCoverageRow {
  id: string;
  fields: CrmField[];
}

export interface CrmRelatedDealRow {
  dealId: string;
  accountProvisional: boolean;
}

export interface CrmAccountSurfaceInput {
  account: CrmAccount | null;
  contacts?: CrmContact[];
  coverageTeam?: CrmCoverageTeamMember[];
  relatedDeals?: CrmDealRelationship[];
  relationshipHealth?: CrmRelationshipHealth | null;
  roles?: CrmRelationshipRole[];
  sourceFacts?: CrmSourceFact[];
}

export interface CrmAccountSurfaceViewModel {
  hasAccount: boolean;
  isProvisional: boolean;
  accountIdentity: CrmField[];
  contacts: CrmContactRow[];
  coverage: CrmCoverageRow[];
  relatedDeals: CrmRelatedDealRow[];
  roles: CrmField[];
  relationshipHealth: CrmField[];
  sourceFacts: string[];
  missingSections: string[];
  emptyStateCopy: string | null;
}

function field(label: string, value: string | null | undefined, provisional = false): CrmField {
  const v = value ?? null;
  if (provisional && v !== null) return { label, value: v, state: 'provisional' };
  return { label, value: v, state: v !== null && v !== '' ? 'present' : 'missing' };
}

export function deriveCrmAccountSurfaceViewModel(
  input: CrmAccountSurfaceInput,
): CrmAccountSurfaceViewModel {
  const account = input.account ?? null;
  const isProvisional = account?.isProvisional === true;
  const missingSections: string[] = [];

  const accountIdentity: CrmField[] = account
    ? [
        field('Name', account.name, isProvisional),
        field('Type', account.accountType),
        field('Legal name', account.legalName),
        field('Industry', account.industry),
        field('Relationship start', account.relationshipStartDate),
        field('Identity source', isProvisional ? 'borrower/client stub (provisional)' : 'seeded CRM account'),
      ]
    : [];

  const contacts: CrmContactRow[] = (input.contacts ?? []).map((c) => ({
    id: c.id,
    fields: [
      field('Name', c.fullName),
      field('Title', c.title),
      field('Account', c.accountId),
      // The spine model carries no decision-influence field; surfaced as missing
      // rather than invented.
      field('Decision influence', null),
      field('Source', c.origin),
    ],
  }));
  if (contacts.length === 0) missingSections.push('contacts');

  const coverage: CrmCoverageRow[] = (input.coverageTeam ?? []).map((m) => ({
    id: m.id,
    fields: [
      field('Member', m.name),
      field('Type', m.memberType),
      field('Coverage role', m.coverageRole),
      field('Authorized source', m.sourceLogicalName),
      // Effective dates are surfaced only when present in the data.
      field('Effective date', null),
    ],
  }));
  if (coverage.length === 0) missingSections.push('coverageTeam');

  const relatedDeals: CrmRelatedDealRow[] = (input.relatedDeals ?? []).map((d) => ({
    dealId: d.dealId,
    accountProvisional: d.accountIsProvisional,
  }));
  if (relatedDeals.length === 0) missingSections.push('relatedDeals');

  const roles: CrmField[] = (input.roles ?? []).map((r) =>
    field(r.roleType, r.active ? 'active' : 'inactive'),
  );
  if (roles.length === 0) missingSections.push('relationshipRoles');

  const health = input.relationshipHealth ?? null;
  const relationshipHealth: CrmField[] = health
    ? [
        field('Health band', health.band),
        field('Provisional', health.isProvisional ? 'yes' : 'no'),
        ...health.signals.map((s, i) => field(`Signal ${i + 1}`, s)),
      ]
    : [];
  if (!health) missingSections.push('relationshipHealth');

  const sourceFacts = (input.sourceFacts ?? []).map((f) => f.statement);
  if (sourceFacts.length === 0) missingSections.push('sourceFacts');

  return {
    hasAccount: account !== null,
    isProvisional,
    accountIdentity,
    contacts,
    coverage,
    relatedDeals,
    roles,
    relationshipHealth,
    sourceFacts,
    missingSections,
    emptyStateCopy: account ? null : 'No CRM account is linked yet. Link a borrower/client stub or seed the CRM spine to populate this surface.',
  };
}
