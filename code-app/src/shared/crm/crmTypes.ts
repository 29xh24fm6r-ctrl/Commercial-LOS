/**
 * Phase 141B-H — CRM Relationship Master domain model.
 *
 * The canonical model for the bank's relationships: organizations, people,
 * contact points, relationships, role assignments, communication preferences,
 * contact authorizations, vendors, customers, guarantors, internal contacts,
 * advisors, a timeline, and an audit trail.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - TYPES only. No IO, no fake data, no sample emails/phone numbers.
 *   - Missing means missing: optional fields stay undefined, never defaulted.
 *   - `doNotContact` / missing authorization are honored by the readiness
 *     engines — they are never silently overridden.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type CrmEntityType = 'organization' | 'person';

export type CrmOrganizationType =
  | 'customer'
  | 'vendor'
  | 'guarantor_entity'
  | 'advisor_firm'
  | 'internal'
  | 'other';

export type CrmPersonType =
  | 'customer_contact'
  | 'vendor_contact'
  | 'guarantor'
  | 'advisor'
  | 'internal'
  | 'other';

export type CrmContactChannel = 'email' | 'phone' | 'mail' | 'portal';

export type CrmRecordStatus = 'active' | 'inactive' | 'archived';

export type CrmRelationshipType =
  | 'borrower'
  | 'guarantor'
  | 'owner'
  | 'officer'
  | 'advisor'
  | 'vendor'
  | 'affiliate'
  | 'related_entity'
  | 'internal_owner';

export type CrmRole =
  | 'portfolio_manager'
  | 'servicing_owner'
  | 'relationship_manager'
  | 'borrower_contact'
  | 'guarantor'
  | 'advisor'
  | 'authorized_signer';

export type CrmAuthorizationType =
  | 'financial_disclosure'
  | 'document_upload'
  | 'account_servicing'
  | 'general';

export type CrmContactTaskType =
  | 'add_primary_contact'
  | 'verify_contact_point'
  | 'collect_authorization'
  | 'resolve_do_not_contact_conflict'
  | 'renew_expired_authorization'
  | 'assign_relationship_owner';

export type CrmTaskSeverity = 'low' | 'medium' | 'high';
export type CrmTaskStatus = 'open' | 'in_progress' | 'completed';

// ---------------------------------------------------------------------------
// Core records
// ---------------------------------------------------------------------------

export interface CrmOrganization {
  orgId: string;
  legalName?: string;
  dba?: string;
  orgType: CrmOrganizationType;
  naicsIndustry?: string;
  addressSummary?: string;
  status: CrmRecordStatus;
  source?: string;
}

export interface CrmPerson {
  personId: string;
  fullName?: string;
  title?: string;
  orgId?: string;
  personType: CrmPersonType;
  status: CrmRecordStatus;
  /** Person-level do-not-contact flag. Honored by the readiness engines. */
  doNotContact?: boolean;
  source?: string;
}

export interface CrmContactPoint {
  contactPointId: string;
  ownerType: CrmEntityType;
  ownerId: string;
  channel: CrmContactChannel;
  /** The address/number. NEVER seeded with a sample value in production code. */
  value?: string;
  isPrimary?: boolean;
  verified?: boolean;
  /** Channel-level suppression (e.g. bounced email). */
  doNotUse?: boolean;
  label?: string;
}

export interface CrmRelationship {
  relationshipId: string;
  fromEntityType: CrmEntityType;
  fromEntityId: string;
  toEntityType: CrmEntityType;
  toEntityId: string;
  relationshipType: CrmRelationshipType;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  /** Optional link to a portfolio loan / boarded loan. */
  loanId?: string;
}

export interface CrmRoleAssignment {
  roleId: string;
  personId: string;
  orgId?: string;
  role: CrmRole;
  scope?: string;
  active?: boolean;
}

export interface CrmCommunicationPreference {
  prefId: string;
  ownerType: CrmEntityType;
  ownerId: string;
  preferredChannel?: CrmContactChannel;
  doNotContact?: boolean;
  doNotEmail?: boolean;
  doNotCall?: boolean;
  language?: string;
  frequencyPreference?: string;
}

export interface CrmContactAuthorization {
  authId: string;
  personId: string;
  orgId?: string;
  authType: CrmAuthorizationType;
  grantedDate?: string;
  expirationDate?: string;
  revoked?: boolean;
  scope?: string;
}

export interface CrmTimelineEvent {
  eventId: string;
  entityType: CrmEntityType;
  entityId: string;
  eventType: string;
  occurredAt?: string;
  summary?: string;
  actor?: string;
}

export interface CrmAuditEntry {
  actor?: string;
  action: string;
  entityType?: CrmEntityType;
  entityId?: string;
  timestamp: string;
  fieldKey?: string;
  previousValueSummary?: string;
  newValueSummary?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Convenience views (subsets by type — no extra storage)
// ---------------------------------------------------------------------------

/** A customer / vendor / guarantor-entity / advisor-firm is a typed org. */
export type CrmVendor = CrmOrganization & { orgType: 'vendor' };
export type CrmCustomer = CrmOrganization & { orgType: 'customer' };
export type CrmAdvisorFirm = CrmOrganization & { orgType: 'advisor_firm' };

/** A guarantor / advisor / internal contact is a typed person. */
export type CrmGuarantor = CrmPerson & { personType: 'guarantor' };
export type CrmAdvisor = CrmPerson & { personType: 'advisor' };
export type CrmInternalContact = CrmPerson & { personType: 'internal' };

// ---------------------------------------------------------------------------
// The aggregate master
// ---------------------------------------------------------------------------

export interface CrmMaster {
  organizations: readonly CrmOrganization[];
  people: readonly CrmPerson[];
  contactPoints: readonly CrmContactPoint[];
  relationships: readonly CrmRelationship[];
  roleAssignments: readonly CrmRoleAssignment[];
  communicationPreferences: readonly CrmCommunicationPreference[];
  contactAuthorizations: readonly CrmContactAuthorization[];
  timeline: readonly CrmTimelineEvent[];
  audit: readonly CrmAuditEntry[];
}

/** A structurally-empty master (no records). Seeds NO data. */
export function createEmptyCrmMaster(): CrmMaster {
  return {
    organizations: [],
    people: [],
    contactPoints: [],
    relationships: [],
    roleAssignments: [],
    communicationPreferences: [],
    contactAuthorizations: [],
    timeline: [],
    audit: [],
  };
}
