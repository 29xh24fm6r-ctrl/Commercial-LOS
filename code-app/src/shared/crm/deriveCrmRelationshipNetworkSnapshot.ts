/**
 * Phase 141B-H — CRM relationship network snapshot.
 *
 * PURE projection of the CRM master into network nodes/edges + per-organization
 * rollups + portfolio-wide gaps (missing contact, do-not-contact, authorization
 * gaps). Honest: empty master → empty snapshot, no fake nodes.
 */

import type { CrmMaster, CrmOrganizationType, CrmEntityType } from './crmTypes';

export interface CrmOrgRollup {
  orgId: string;
  legalName?: string;
  orgType: CrmOrganizationType;
  peopleCount: number;
  contactPointCount: number;
  relationshipCount: number;
  hasUsableContact: boolean;
  doNotContactPeople: number;
}

export interface CrmNetworkNode {
  entityType: CrmEntityType;
  entityId: string;
  label?: string;
}

export interface CrmNetworkEdge {
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  loanId?: string;
}

export interface CrmRelationshipNetworkSnapshot {
  totalOrganizations: number;
  totalPeople: number;
  totalRelationships: number;
  totalContactPoints: number;
  orgsMissingContact: number;
  peopleDoNotContact: number;
  authorizationGaps: number;
  orgRollups: readonly CrmOrgRollup[];
  nodes: readonly CrmNetworkNode[];
  edges: readonly CrmNetworkEdge[];
  isEmpty: boolean;
}

function usableContactCount(master: CrmMaster, ownerType: CrmEntityType, ownerId: string): number {
  return master.contactPoints.filter(
    (c) =>
      c.ownerType === ownerType &&
      c.ownerId === ownerId &&
      (c.value ?? '').trim().length > 0 &&
      c.doNotUse !== true,
  ).length;
}

export function deriveCrmRelationshipNetworkSnapshot(
  master: CrmMaster,
): CrmRelationshipNetworkSnapshot {
  // Factory mission PR A — was every consumer below reading master.organizations directly, so an
  // inactive/archived organization inflated both the headline "N org(s)" stat AND the rollup table
  // beneath it identically (at least internally consistent, but silently counting non-active
  // records this repo's own convention excludes for every other entity-count surface). Filtering
  // once here keeps the summary stat and the detail table agreeing with each other.
  const activeOrganizations = master.organizations.filter((o) => o.status === 'active');
  const orgRollups: CrmOrgRollup[] = activeOrganizations.map((org) => {
    const people = master.people.filter((p) => p.orgId === org.orgId);
    const contactPointCount = master.contactPoints.filter(
      (c) => c.ownerType === 'organization' && c.ownerId === org.orgId,
    ).length;
    const relationshipCount = master.relationships.filter(
      (r) =>
        (r.fromEntityType === 'organization' && r.fromEntityId === org.orgId) ||
        (r.toEntityType === 'organization' && r.toEntityId === org.orgId),
    ).length;
    const orgHasUsable = usableContactCount(master, 'organization', org.orgId) > 0;
    const anyPersonUsable = people.some((p) => usableContactCount(master, 'person', p.personId) > 0);
    return {
      orgId: org.orgId,
      legalName: org.legalName,
      orgType: org.orgType,
      peopleCount: people.length,
      contactPointCount,
      relationshipCount,
      hasUsableContact: orgHasUsable || anyPersonUsable,
      doNotContactPeople: people.filter((p) => p.doNotContact === true).length,
    };
  });

  const nodes: CrmNetworkNode[] = [
    ...activeOrganizations.map((o) => ({
      entityType: 'organization' as CrmEntityType,
      entityId: o.orgId,
      label: o.legalName,
    })),
    ...master.people.map((p) => ({
      entityType: 'person' as CrmEntityType,
      entityId: p.personId,
      label: p.fullName,
    })),
  ];

  const edges: CrmNetworkEdge[] = master.relationships.map((r) => ({
    fromEntityId: r.fromEntityId,
    toEntityId: r.toEntityId,
    relationshipType: r.relationshipType,
    loanId: r.loanId,
  }));

  const authorizationGaps = master.people.filter((p) => {
    if (p.personType !== 'guarantor' && p.personType !== 'customer_contact') return false;
    return !master.contactAuthorizations.some(
      (a) => a.personId === p.personId && a.authType === 'document_upload' && a.revoked !== true,
    );
  }).length;

  return {
    // Factory mission PR A — was master.organizations.length unconditionally, counting
    // inactive/archived organizations alongside real active relationships. This was the one CRM
    // count surface this repo's audit history found with zero active-state filtering, unlike every
    // deal-count surface, which consistently excludes non-active/test records. Organizations have
    // no name-pattern test/smoke convention the way deals do (testDealClassification.ts is
    // deal-specific), so `status` is the only classification available; excluding non-'active' here
    // is the equivalent fix for this record type.
    totalOrganizations: activeOrganizations.length,
    totalPeople: master.people.length,
    totalRelationships: master.relationships.length,
    totalContactPoints: master.contactPoints.length,
    orgsMissingContact: orgRollups.filter((r) => !r.hasUsableContact).length,
    peopleDoNotContact: master.people.filter((p) => p.doNotContact === true).length,
    authorizationGaps,
    orgRollups,
    nodes,
    edges,
    isEmpty: nodes.length === 0,
  };
}
