/**
 * Phase 141B-H — CRM contact task engine.
 *
 * PURE derivation of the data-hygiene tasks the CRM master implies: add a
 * primary contact, verify a contact point, collect/renew an upload
 * authorization, resolve a do-not-contact conflict, or assign a relationship
 * owner. It writes NOTHING and never fakes a completed task.
 */

import type {
  CrmMaster,
  CrmEntityType,
  CrmContactTaskType,
  CrmTaskSeverity,
  CrmTaskStatus,
} from './crmTypes';
import { resolveCrmContactSubject, deriveCrmContactReadiness } from './deriveCrmReadiness';

export interface CrmContactTask {
  taskId: string;
  entityType: CrmEntityType;
  entityId: string;
  entityLabel?: string;
  taskType: CrmContactTaskType;
  severity: CrmTaskSeverity;
  status: CrmTaskStatus;
  blocker?: string;
  relatedRelationshipIds: readonly string[];
}

export interface CrmContactTaskInput {
  master: CrmMaster;
  asOfDate?: string | Date;
}

export function deriveCrmContactTasks(
  input: CrmContactTaskInput,
): readonly CrmContactTask[] {
  const { master } = input;
  const tasks: CrmContactTask[] = [];

  // People needing borrower/guarantor contact who lack usable contact or auth.
  for (const person of master.people) {
    const readiness = deriveCrmContactReadiness({
      subject: resolveCrmContactSubject(master, 'person', person.personId),
      asOfDate: input.asOfDate,
    });
    const rels = master.relationships
      .filter(
        (r) =>
          (r.fromEntityType === 'person' && r.fromEntityId === person.personId) ||
          (r.toEntityType === 'person' && r.toEntityId === person.personId),
      )
      .map((r) => r.relationshipId);

    const push = (
      taskType: CrmContactTaskType,
      severity: CrmTaskSeverity,
      blocker?: string,
    ): void => {
      tasks.push({
        taskId: `person:${person.personId}:${taskType}`,
        entityType: 'person',
        entityId: person.personId,
        entityLabel: person.fullName,
        taskType,
        severity,
        status: 'open',
        blocker,
        relatedRelationshipIds: rels,
      });
    };

    const isContactRole = person.personType === 'customer_contact' || person.personType === 'guarantor';
    if (!readiness.contactReady && isContactRole) {
      push('add_primary_contact', 'high', 'No usable contact point.');
    } else if (!readiness.hasAnyContactPoint && isContactRole) {
      push('add_primary_contact', 'medium');
    }
    // A do-not-contact person who is still an active borrower contact is a conflict.
    if (readiness.doNotContact && person.personType === 'customer_contact') {
      push('resolve_do_not_contact_conflict', 'medium', 'Do-not-contact set on an active borrower contact.');
    }
    // Upload-link blocked due to missing/expired authorization.
    if (isContactRole && readiness.contactReady && !readiness.uploadLinkReady && !readiness.doNotContact) {
      const hasAnyUploadAuth = master.contactAuthorizations.some(
        (a) => a.personId === person.personId && a.authType === 'document_upload',
      );
      if (hasAnyUploadAuth) push('renew_expired_authorization', 'medium', 'Document-upload authorization is expired/revoked.');
      else push('collect_authorization', 'medium', 'No document-upload authorization on file.');
    }
    // Contact points present but unverified.
    const hasUnverified = master.contactPoints.some(
      (c) => c.ownerType === 'person' && c.ownerId === person.personId && c.verified !== true && (c.value ?? '').trim().length > 0,
    );
    if (hasUnverified) push('verify_contact_point', 'low');
  }

  // Relationships lacking an internal owner role.
  for (const org of master.organizations) {
    if (org.orgType !== 'customer') continue;
    const hasOwner = master.roleAssignments.some(
      (ra) => ra.orgId === org.orgId && (ra.role === 'relationship_manager' || ra.role === 'portfolio_manager') && ra.active !== false,
    );
    if (!hasOwner) {
      const rels = master.relationships
        .filter((r) => r.fromEntityId === org.orgId || r.toEntityId === org.orgId)
        .map((r) => r.relationshipId);
      tasks.push({
        taskId: `org:${org.orgId}:assign_relationship_owner`,
        entityType: 'organization',
        entityId: org.orgId,
        entityLabel: org.legalName,
        taskType: 'assign_relationship_owner',
        severity: 'medium',
        status: 'open',
        blocker: 'No active relationship/portfolio manager assigned.',
        relatedRelationshipIds: rels,
      });
    }
  }

  return tasks;
}
