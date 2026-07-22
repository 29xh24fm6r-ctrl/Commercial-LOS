import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { getAll: vi.fn() },
}));

import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { loadDealActivity } from './activityQueries';

const getAll = vi.mocked(Cr664_dealtimelineeventsService.getAll);

/**
 * P0-5 — audit-trail user attribution. The acting user's display name must come from the
 * cr664_EventBy LOOKUP's FormattedValue annotation (what the governed writes actually set), NOT the
 * unpopulated cr664_eventbyname text column. "Unknown user" is reserved for the genuinely-unresolved
 * case (the render adds that fallback).
 */

function rowsResult(rows: Array<Record<string, unknown>>) {
  return { success: true, data: rows } as unknown as Awaited<
    ReturnType<typeof Cr664_dealtimelineeventsService.getAll>
  >;
}

function baseRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cr664_dealtimelineeventid: 'tl-1',
    cr664_title: 'Note added',
    cr664_summary: 'Called borrower',
    cr664_eventat: '2026-06-20T10:00:00Z',
    cr664_eventtype: 788190002,
    cr664_issystemgenerated: false,
    ...over,
  };
}

beforeEach(() => getAll.mockReset());

describe('loadDealActivity — actor attribution (P0-5)', () => {
  it('resolves actorName from the cr664_EventBy lookup FormattedValue (the acting user)', async () => {
    getAll.mockResolvedValue(
      rowsResult([
        baseRow({
          _cr664_eventby_value: 'user-1',
          '_cr664_eventby_value@OData.Community.Display.V1.FormattedValue': 'Dana Banker',
        }),
      ]),
    );
    const [event] = await loadDealActivity('deal-1');
    expect(event.actorName).toBe('Dana Banker');
  });

  it('falls back to the legacy cr664_eventbyname column when the FormattedValue is absent', async () => {
    getAll.mockResolvedValue(rowsResult([baseRow({ cr664_eventbyname: 'Legacy Name' })]));
    const [event] = await loadDealActivity('deal-1');
    expect(event.actorName).toBe('Legacy Name');
  });

  it('leaves actorName undefined ONLY when the actor is genuinely unresolved (no lookup, no name)', async () => {
    // Fail-closed write path: EventBy lookup omitted, no name column. The render shows "Unknown user".
    getAll.mockResolvedValue(rowsResult([baseRow()]));
    const [event] = await loadDealActivity('deal-1');
    expect(event.actorName).toBeUndefined();
  });

  it('does NOT read the unpopulated name column when the lookup FormattedValue is present (no false blank)', async () => {
    getAll.mockResolvedValue(
      rowsResult([
        baseRow({
          _cr664_eventby_value: 'user-2',
          '_cr664_eventby_value@OData.Community.Display.V1.FormattedValue': 'Morgan Lee',
          cr664_eventbyname: '', // the blank text column that caused the original "Unknown user" bug
        }),
      ]),
    );
    const [event] = await loadDealActivity('deal-1');
    expect(event.actorName).toBe('Morgan Lee');
  });
});
