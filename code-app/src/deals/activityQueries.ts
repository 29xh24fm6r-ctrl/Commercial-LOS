import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';

export type TimelineEventTypeKey =
  | 'CallLogged'
  | 'EmailLogged'
  | 'NoteLogged'
  | 'MeetingLogged'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'StageChanged'
  | 'BlockerOpened'
  | 'BlockerResolved'
  | 'DocumentRequested'
  | 'DocumentUploaded'
  | 'DocumentGenerated'
  | 'ApprovalSubmitted'
  | 'ApprovalDecision'
  | 'BorrowerUpdateSent';

/**
 * One row of the deal's canonical timeline ledger. Sourced directly
 * from cr664_DealTimelineEvent — Microsoft's "Activity Intelligence"
 * canonical ledger described in SPEC.md. Single source: every event
 * type the deal experiences flows through this entity, so we don't
 * union additional tables in this phase.
 */
export interface TimelineEvent {
  id: string;
  title: string;
  summary: string | undefined;
  eventAt: string;
  eventType: string | undefined;
  eventTypeKey: TimelineEventTypeKey | undefined;
  eventSubType: string | undefined;
  isSystemGenerated: boolean;
  actorName: string | undefined;
  relatedEntityType: string | undefined;
  relatedEntityId: string | undefined;
}

const EVENT_TYPE_MAP: Record<number, TimelineEventTypeKey> = {
  788190000: 'CallLogged',
  788190001: 'EmailLogged',
  788190002: 'NoteLogged',
  788190003: 'MeetingLogged',
  788190004: 'TaskCreated',
  788190005: 'TaskCompleted',
  788190006: 'StageChanged',
  788190007: 'BlockerOpened',
  788190008: 'BlockerResolved',
  788190009: 'DocumentRequested',
  788190010: 'DocumentUploaded',
  788190011: 'DocumentGenerated',
  788190012: 'ApprovalSubmitted',
  788190013: 'ApprovalDecision',
  788190014: 'BorrowerUpdateSent',
};

function lookupEventTypeKey(v: unknown): TimelineEventTypeKey | undefined {
  if (typeof v === 'number') return EVENT_TYPE_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return EVENT_TYPE_MAP[Number(v)];
  return undefined;
}

/**
 * AdminOnly visibility scope option value on cr664_VisibilityScope.
 * Banker workspace explicitly excludes admin-only events from its
 * timeline — per SPEC W3 (workspace leakage prevention).
 */
const VISIBILITY_ADMIN_ONLY = 788190003;

/**
 * Load all visible timeline events for the given deal. Caller must
 * have already authorized read access to dealId via loadDealForBanker;
 * DealDataProvider only mounts after BankerDealWorkspace is 'ready'.
 *
 * Filters:
 *   _cr664_deal_value eq <dealId>            scope to authorized deal
 *   statecode eq 0                            active rows only
 *   cr664_visibilityscope ne <AdminOnly>      banker doesn't see admin-only
 *
 * Returns newest-first via server-side ordering, no client-side sort
 * needed.
 */
export async function loadDealActivity(dealId: string): Promise<TimelineEvent[]> {
  const result = await Cr664_dealtimelineeventsService.getAll({
    filter: [
      `_cr664_deal_value eq ${dealId}`,
      `statecode eq 0`,
      `cr664_visibilityscope ne ${VISIBILITY_ADMIN_ONLY}`,
    ].join(' and '),
    orderBy: ['cr664_eventat desc'],
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load activity');
  }

  return (result.data ?? []).map(
    (e): TimelineEvent => ({
      id: e.cr664_dealtimelineeventid,
      title: e.cr664_title,
      summary: e.cr664_summary,
      eventAt: e.cr664_eventat,
      eventType: e.cr664_eventtypename,
      eventTypeKey: lookupEventTypeKey(e.cr664_eventtype),
      eventSubType: e.cr664_eventsubtype,
      isSystemGenerated: e.cr664_issystemgenerated === true,
      actorName: e.cr664_eventbyname,
      relatedEntityType: e.cr664_relatedentitytype,
      relatedEntityId: e.cr664_relatedentityid,
    }),
  );
}
