import { describe, it, expect } from 'vitest';
import { findDocumentReceivedByActorName } from './documentReceivedByLookup';
import type { TimelineEvent } from './activityQueries';

function event(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: 'evt-1',
    title: 'Doc',
    summary: undefined,
    eventAt: '2026-07-01T00:00:00.000Z',
    eventType: 'DocumentUploaded',
    eventTypeKey: 'DocumentUploaded',
    eventSubType: undefined,
    isSystemGenerated: false,
    actorName: 'Jordan Banker',
    relatedEntityType: 'cr664_documentchecklist',
    relatedEntityId: 'doc-1',
    ...overrides,
  };
}

describe('findDocumentReceivedByActorName', () => {
  it('returns undefined when activity is undefined or empty', () => {
    expect(findDocumentReceivedByActorName(undefined, 'doc-1')).toBeUndefined();
    expect(findDocumentReceivedByActorName([], 'doc-1')).toBeUndefined();
  });

  it('returns undefined when no event matches the document id', () => {
    const activity = [event({ relatedEntityId: 'doc-2' })];
    expect(findDocumentReceivedByActorName(activity, 'doc-1')).toBeUndefined();
  });

  it('ignores events of the wrong type or entity type', () => {
    const activity = [
      event({ eventTypeKey: 'DocumentRequested' }),
      event({ relatedEntityType: 'cr664_dealtask' }),
    ];
    expect(findDocumentReceivedByActorName(activity, 'doc-1')).toBeUndefined();
  });

  it('ignores a matching event with no actor name (fail-closed, never fabricates a name)', () => {
    const activity = [event({ actorName: undefined })];
    expect(findDocumentReceivedByActorName(activity, 'doc-1')).toBeUndefined();
  });

  it('returns the actor name for a single matching event', () => {
    const activity = [event({})];
    expect(findDocumentReceivedByActorName(activity, 'doc-1')).toBe('Jordan Banker');
  });

  it('returns the most recent actor when a document was received more than once', () => {
    const activity = [
      event({ eventAt: '2026-06-01T00:00:00.000Z', actorName: 'Older Banker' }),
      event({ eventAt: '2026-07-10T00:00:00.000Z', actorName: 'Newer Banker' }),
    ];
    expect(findDocumentReceivedByActorName(activity, 'doc-1')).toBe('Newer Banker');
  });
});
