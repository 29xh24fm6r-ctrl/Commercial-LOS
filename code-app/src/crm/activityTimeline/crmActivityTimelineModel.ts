/**
 * Phase 143G — CRM activity / task / email timeline enrichment (READ-ONLY).
 *
 * PURE. Builds a deterministic relationship timeline from EXPLICIT local input
 * only. It sends no email, performs no Outlook/Graph or Salesforce/nCino lookup,
 * and fabricates no activity. External references (Salesforce activity / nCino
 * milestone) are LABELS only. Every outcome keeps `readOnly` true and
 * `liveCrmLookupPerformed` / `externalSystemChanged` false.
 */

export type CrmTimelineEventType =
  | 'los_task'
  | 'los_document'
  | 'borrower_message'
  | 'credit_memo'
  | 'committee_package'
  | 'salesforce_activity_reference'
  | 'ncino_milestone_reference';

export const CRM_TIMELINE_EVENT_TYPES: readonly CrmTimelineEventType[] = Object.freeze([
  'los_task', 'los_document', 'borrower_message', 'credit_memo', 'committee_package',
  'salesforce_activity_reference', 'ncino_milestone_reference',
]);

export interface CrmTimelineEventInput {
  eventType: CrmTimelineEventType;
  label: string;
  occurredAt?: string;
  source?: string;
}

export interface CrmTimelineRow {
  eventType: CrmTimelineEventType;
  label: string;
  occurredAt: string;
  source: string;
  externalReferenceOnly: boolean;
}

export interface CrmActivityTimelineResult {
  timelineRows: readonly CrmTimelineRow[];
  sourceCounts: Readonly<Record<string, number>>;
  warnings: readonly string[];
  readOnly: true;
  liveCrmLookupPerformed: false;
  externalSystemChanged: false;
}

const EXTERNAL_TYPES = new Set<CrmTimelineEventType>(['salesforce_activity_reference', 'ncino_milestone_reference']);

export function deriveCrmActivityTimeline(
  events: readonly CrmTimelineEventInput[] | null | undefined,
): CrmActivityTimelineResult {
  const warnings: string[] = ['Read-only timeline from local input only — no CRM lookup and no email send occur.'];

  if (!events || events.length === 0) {
    return { timelineRows: [], sourceCounts: {}, warnings: ['No timeline events provided.'], readOnly: true, liveCrmLookupPerformed: false, externalSystemChanged: false };
  }

  const valid = events.filter((e) => CRM_TIMELINE_EVENT_TYPES.includes(e.eventType));
  if (valid.length < events.length) warnings.push('Some events had an unsupported type and were ignored.');

  const rows: CrmTimelineRow[] = valid.map((e) => ({
    eventType: e.eventType,
    label: e.label,
    occurredAt: (e.occurredAt ?? '').trim() || 'unknown',
    source: (e.source ?? '').trim() || (EXTERNAL_TYPES.has(e.eventType) ? 'external_reference' : 'los'),
    externalReferenceOnly: EXTERNAL_TYPES.has(e.eventType),
  }));

  // Deterministic sort: most recent first, then by event type, then by label.
  rows.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
    if (a.eventType !== b.eventType) return a.eventType < b.eventType ? -1 : 1;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  const sourceCounts: Record<string, number> = {};
  for (const r of rows) sourceCounts[r.eventType] = (sourceCounts[r.eventType] ?? 0) + 1;

  return { timelineRows: rows, sourceCounts, warnings, readOnly: true, liveCrmLookupPerformed: false, externalSystemChanged: false };
}
