/**
 * Phase 193E — CRM activity / task / timeline model.
 *
 * Pure. Builds a deterministic timeline view-model from loaded CRM activities
 * and tasks, and constructs gated persistence write-requests for activities. No
 * fake history is synthesized: entries come only from provided records, and an
 * absent date/owner/status is surfaced as unknown. Tasks are not directly
 * persistable yet (no allow-listed task table) — that is reported honestly.
 */

import type { CrmActivity, CrmTask } from './crmSalesforceSpineModel';
import type { CrmSpineWriteRequest } from './crmSalesforceSpinePersistenceAdapter';
import type { CrmSpineSourceFactRef } from './crmSalesforceSpineAudit';

export type CrmTimelineEntryKind = 'activity' | 'task';

export interface CrmTimelineEntry {
  kind: CrmTimelineEntryKind;
  id: string;
  title: string | null;
  /** ISO date the entry sorts on (activity occurredAt / task dueDate); null = undated. */
  occurredAt: string | null;
  status: string | null;
  sourceLabel: string;
}

export interface CrmTimelineViewModel {
  entries: CrmTimelineEntry[];
  activityCount: number;
  taskCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  hasHistory: boolean;
  emptyCopy: string | null;
}

export interface CrmTimelineInput {
  activities?: CrmActivity[];
  tasks?: CrmTask[];
  /** Caller-provided reference time (ISO) for overdue computation; deterministic. */
  nowIso?: string | null;
}

function compareEntries(a: CrmTimelineEntry, b: CrmTimelineEntry): number {
  // Dated entries first (newest first); undated entries sort to the end.
  if (a.occurredAt && b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0;
  if (a.occurredAt && !b.occurredAt) return -1;
  if (!a.occurredAt && b.occurredAt) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function deriveCrmTimeline(input: CrmTimelineInput): CrmTimelineViewModel {
  const activities = input.activities ?? [];
  const tasks = input.tasks ?? [];
  const now = input.nowIso ?? null;

  const entries: CrmTimelineEntry[] = [
    ...activities.map((a) => ({
      kind: 'activity' as const,
      id: a.id,
      title: a.summary ?? a.activityType,
      occurredAt: a.occurredAt ?? null,
      status: a.activityType,
      sourceLabel: `activity · ${a.origin}`,
    })),
    ...tasks.map((t) => ({
      kind: 'task' as const,
      id: t.id,
      title: t.title,
      occurredAt: t.dueDate ?? null,
      status: t.status,
      sourceLabel: `task · ${t.origin}`,
    })),
  ].sort(compareEntries);

  const openTasks = tasks.filter((t) => t.status === 'open' || t.status === 'in-progress');
  const overdueTaskCount =
    now === null
      ? 0
      : openTasks.filter((t) => typeof t.dueDate === 'string' && t.dueDate < now).length;

  return {
    entries,
    activityCount: activities.length,
    taskCount: tasks.length,
    openTaskCount: openTasks.length,
    overdueTaskCount,
    hasHistory: entries.length > 0,
    emptyCopy: entries.length > 0 ? null : 'No CRM activities or tasks on record. History is shown as empty — not fabricated.',
  };
}

/**
 * Build a gated persistence write-request for a CRM activity. The activity name
 * is required (rejected by the adapter if blank — never defaulted), and the
 * caller must supply provenance.
 */
export function buildCrmActivityCreateRequest(input: {
  name: string;
  subjectEntityType: string;
  subjectEntityId: string;
  occurredAt?: string | null;
  sourceFacts: CrmSpineSourceFactRef[];
}): CrmSpineWriteRequest {
  return {
    entity: 'activity',
    fields: {
      cr664_name: input.name,
      cr664_entitytype: input.subjectEntityType,
      cr664_entityid: input.subjectEntityId,
      cr664_occurredat: input.occurredAt ?? '',
    },
    sourceFacts: input.sourceFacts,
  };
}

/** Tasks have no allow-listed Dataverse table yet; persistence is not available
 *  this phase. Surfaced honestly so a UI can disable task creation rather than
 *  fake it. */
export const CRM_TASK_PERSISTENCE_AVAILABLE = false;
