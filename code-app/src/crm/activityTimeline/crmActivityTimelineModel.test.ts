import { describe, it, expect } from 'vitest';
import { deriveCrmActivityTimeline, type CrmTimelineEventInput } from './crmActivityTimelineModel';

const EVENTS: CrmTimelineEventInput[] = [
  { eventType: 'los_task', label: 'Collect financials', occurredAt: '2026-01-10' },
  { eventType: 'credit_memo', label: 'Memo generated', occurredAt: '2026-02-01' },
  { eventType: 'salesforce_activity_reference', label: 'SF call logged', occurredAt: '2026-01-20' },
  { eventType: 'ncino_milestone_reference', label: 'nCino stage advanced', occurredAt: '2026-01-25' },
];

describe('Phase 143G — CRM activity timeline model', () => {
  it('returns an honest empty timeline when no events are provided', () => {
    const r = deriveCrmActivityTimeline([]);
    expect(r.timelineRows).toEqual([]);
    expect(r.readOnly).toBe(true);
  });

  it('sorts rows deterministically (most recent first) and counts sources', () => {
    const r = deriveCrmActivityTimeline(EVENTS);
    expect(r.timelineRows[0].occurredAt).toBe('2026-02-01');
    expect(r.sourceCounts.los_task).toBe(1);
    expect(r.sourceCounts.salesforce_activity_reference).toBe(1);
    // Deterministic across runs.
    expect(r.timelineRows.map((x) => x.label)).toEqual(deriveCrmActivityTimeline(EVENTS).timelineRows.map((x) => x.label));
  });

  it('marks external Salesforce/nCino events as reference-only labels', () => {
    const r = deriveCrmActivityTimeline(EVENTS);
    expect(r.timelineRows.find((x) => x.eventType === 'salesforce_activity_reference')?.externalReferenceOnly).toBe(true);
    expect(r.timelineRows.find((x) => x.eventType === 'los_task')?.externalReferenceOnly).toBe(false);
  });

  it('keeps live CRM lookup and external change false', () => {
    const r = deriveCrmActivityTimeline(EVENTS);
    expect(r.liveCrmLookupPerformed).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });

  it('ignores unsupported event types', () => {
    const r = deriveCrmActivityTimeline([...EVENTS, { eventType: 'wire_transfer' as unknown as CrmTimelineEventInput['eventType'], label: 'bad' }]);
    expect(r.timelineRows.length).toBe(EVENTS.length);
    expect(r.warnings.join(' ').toLowerCase()).toMatch(/unsupported type/);
  });
});
