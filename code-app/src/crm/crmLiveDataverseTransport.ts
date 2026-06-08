/**
 * Phase 141L — CRM live Dataverse transport seam.
 *
 * A narrow transport interface the app runtime or tests inject. It exposes only
 * safe low-level operations and is constrained so it can ONLY ever touch the
 * `cr664_crm*` entity sets — never `cr664_loandeal`, client, banker,
 * platformuser, team, or systemuser tables, and never a delete.
 *
 * NOTE: this module imports NO generated Dataverse service and performs NO
 * `fetch` itself. The real client is injected at enable time (and is never wired
 * by default), so the build has no hard dependency on a runtime SDK. Entity-set
 * names are resolved from a hardcoded CRM allow-list — never from UI input.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Only the 10 `cr664_crm*` entity sets are allowed; anything else fails closed.
 *   - No delete operation exists anywhere in the seam.
 *   - No arbitrary entity-set string from the UI; the allow-list is the gate.
 */

import { CRM_ENTITIES } from './crmDataverseMapper';

// ---------------------------------------------------------------------------
// Entity-set allow-list
// ---------------------------------------------------------------------------

/** The ONLY entity sets this transport may ever read or write. */
export const CRM_ALLOWED_ENTITY_SETS: readonly string[] = Object.freeze([
  'cr664_crmorganizations',
  'cr664_crmpersons',
  'cr664_crmcontactpoints',
  'cr664_crmrelationships',
  'cr664_crmroleassignments',
  'cr664_crmcommunicationpreferences',
  'cr664_crmcontactauthorizations',
  'cr664_crmvendorprofiles',
  'cr664_crmtimelineevents',
  'cr664_crmauditentries',
]);

/** Entity sets that must NEVER be written by the CRM adapter (explicit deny). */
export const CRM_DISALLOWED_ENTITY_SETS: readonly string[] = Object.freeze([
  'cr664_loandeals',
  'cr664_clientrelationships',
  'cr664_bankers',
  'cr664_platformusers',
  'cr664_teams',
  'systemusers',
  'cr664_portfolioboardedloans',
]);

/** Map an allow-listed CRM logical name to its entity-set (plural) name. */
const ENTITY_SET_BY_LOGICAL: Readonly<Record<string, string>> = Object.freeze({
  [CRM_ENTITIES.organization]: 'cr664_crmorganizations',
  [CRM_ENTITIES.person]: 'cr664_crmpersons',
  [CRM_ENTITIES.contactPoint]: 'cr664_crmcontactpoints',
  [CRM_ENTITIES.relationship]: 'cr664_crmrelationships',
  [CRM_ENTITIES.roleAssignment]: 'cr664_crmroleassignments',
  [CRM_ENTITIES.communicationPreference]: 'cr664_crmcommunicationpreferences',
  [CRM_ENTITIES.contactAuthorization]: 'cr664_crmcontactauthorizations',
  [CRM_ENTITIES.vendorProfile]: 'cr664_crmvendorprofiles',
  [CRM_ENTITIES.timelineEvent]: 'cr664_crmtimelineevents',
  [CRM_ENTITIES.auditEntry]: 'cr664_crmauditentries',
});

export function isAllowedCrmEntitySet(entitySetName: string): boolean {
  return CRM_ALLOWED_ENTITY_SETS.includes(entitySetName);
}

/**
 * Resolve the entity-set name for a CRM logical table name. Returns undefined
 * for any non-CRM table, so the adapter fails closed rather than touching it.
 */
export function crmEntitySetForLogicalName(logicalName: string): string | undefined {
  return ENTITY_SET_BY_LOGICAL[logicalName];
}

// ---------------------------------------------------------------------------
// Transport interface (NO delete)
// ---------------------------------------------------------------------------

export interface CrmTransportResult {
  ok: boolean;
  id?: string;
  record?: Record<string, unknown>;
  records?: readonly Record<string, unknown>[];
  error?: string;
}

/**
 * The narrow transport the app runtime or tests inject. It deliberately exposes
 * NO delete operation, so a destructive write is structurally impossible.
 */
export interface CrmDataverseTransport {
  createRecord(
    entitySetName: string,
    payload: Record<string, unknown>,
  ): Promise<CrmTransportResult>;
  updateRecord(
    entitySetName: string,
    recordId: string,
    payload: Record<string, unknown>,
  ): Promise<CrmTransportResult>;
  readRecord(entitySetName: string, recordId: string): Promise<CrmTransportResult>;
  searchRecords(
    entitySetName: string,
    query: string | undefined,
  ): Promise<CrmTransportResult>;
}

/**
 * The injected low-level Dataverse client. Note: NO delete. If a real app-safe
 * Dataverse client exists, wrap it here; otherwise the live adapter remains
 * non-configured and tests inject a fake client.
 */
export interface CrmDataverseClient {
  create(
    entitySetName: string,
    payload: Record<string, unknown>,
  ): Promise<CrmTransportResult>;
  update(
    entitySetName: string,
    recordId: string,
    payload: Record<string, unknown>,
  ): Promise<CrmTransportResult>;
  retrieve(entitySetName: string, recordId: string): Promise<CrmTransportResult>;
  retrieveMultiple(
    entitySetName: string,
    query: string | undefined,
  ): Promise<CrmTransportResult>;
}

const DISALLOWED: CrmTransportResult = Object.freeze({
  ok: false,
  error: 'crm_disallowed_table',
});

/**
 * Wrap an injected low-level client into a guarded `CrmDataverseTransport`. The
 * guard rejects any entity set outside the CRM allow-list — so even a caller
 * mistake cannot write to a non-CRM table.
 */
export function createGuardedCrmTransport(
  client: CrmDataverseClient,
): CrmDataverseTransport {
  const guard = (entitySetName: string): CrmTransportResult | undefined =>
    isAllowedCrmEntitySet(entitySetName) ? undefined : DISALLOWED;
  return {
    async createRecord(entitySetName, payload) {
      return guard(entitySetName) ?? client.create(entitySetName, payload);
    },
    async updateRecord(entitySetName, recordId, payload) {
      return guard(entitySetName) ?? client.update(entitySetName, recordId, payload);
    },
    async readRecord(entitySetName, recordId) {
      return guard(entitySetName) ?? client.retrieve(entitySetName, recordId);
    },
    async searchRecords(entitySetName, query) {
      return guard(entitySetName) ?? client.retrieveMultiple(entitySetName, query);
    },
  };
}
