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
  const orgRollups: CrmOrgRollup[] = master.organizations.map((org) => {
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
    ...master.organizations.map((o) => ({
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
    totalOrganizations: master.organizations.length,
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
