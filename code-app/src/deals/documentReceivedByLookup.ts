import type { TimelineEvent } from './activityQueries';

/**
 * D8 remediation — "who received this document" attribution.
 *
 * `cr664_documentchecklist` has no `receivedby`-style column (only
 * `cr664_receiveddate`; `cr664_reviewer` is the sole identity column on that
 * table, per `documentActions.ts`'s deliberate "does NOT touch ... any other
 * field" scope note). markDocumentReceived already emits a real
 * `cr664_DealTimelineEvent` (`DocumentUploaded` type, `relatedEntityId` =
 * documentId, `EventBy` bound to the resolved actor) alongside the audit
 * event — so the actor is already captured and queryable without any new
 * schema. This derives "received by" from that existing timeline feed
 * instead of adding a column.
 *
 * Pure: no IO. Picks the most recent matching event by `eventAt` in case a
 * document was ever received more than once (e.g. after a correction).
 */
export function findDocumentReceivedByActorName(
  activity: readonly TimelineEvent[] | undefined,
  documentId: string,
): string | undefined {
  if (!activity || activity.length === 0) return undefined;
  const matches = activity.filter(
    (event) =>
      event.eventTypeKey === 'DocumentUploaded' &&
      event.relatedEntityType === 'cr664_documentchecklist' &&
      event.relatedEntityId === documentId &&
      Boolean(event.actorName),
  );
  if (matches.length === 0) return undefined;
  const latest = matches.reduce((best, current) =>
    Date.parse(current.eventAt) > Date.parse(best.eventAt) ? current : best,
  );
  return latest.actorName;
}
