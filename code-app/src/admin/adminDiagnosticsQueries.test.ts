import { describe, it, expect, vi, beforeEach } from 'vitest';

// adminDiagnosticsQueries.ts imports six generated services at module top
// level; each transitively pulls in @microsoft/power-apps, which Vitest
// cannot resolve in this environment (see ReleaseReadinessGate.test.tsx's
// header comment for the same constraint). Mock all six so the module loads.
vi.mock('../generated/services/Cr664_dataqualityflagsService', () => ({
  Cr664_dataqualityflagsService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_alertqueuesService', () => ({
  Cr664_alertqueuesService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_systemsettingsService', () => ({
  Cr664_systemsettingsService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_kpithresholdconfigurationsService', () => ({
  Cr664_kpithresholdconfigurationsService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_profitabilityrefreshstatusesService', () => ({
  Cr664_profitabilityrefreshstatusesService: { getAll: vi.fn() },
}));

import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { loadLatestCapabilityWrite, summarizeAuditFailure } from './adminDiagnosticsQueries';

const getAllMock = vi.mocked(Cr664_auditeventsService.getAll);

/**
 * Factory Arc Phase 4 — Platform Operations Workspace's "latest write per
 * capability" query. Scoped to loadLatestCapabilityWrite only (the function
 * this phase added); the rest of adminDiagnosticsQueries.ts is pre-existing
 * and out of phase scope.
 */
describe('loadLatestCapabilityWrite', () => {
  beforeEach(() => {
    getAllMock.mockReset();
  });

  it('filters by sourceProcess prefix and outcome, ordered newest-first, top 1', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] } as unknown as ReturnType<
      typeof Cr664_auditeventsService.getAll
    > extends Promise<infer R> ? R : never);

    await loadLatestCapabilityWrite('NewDealCreateAdapter/', 'success');

    expect(getAllMock).toHaveBeenCalledTimes(1);
    const call = getAllMock.mock.calls[0]![0] as { filter: string; orderBy: string[]; top: number };
    expect(call.filter).toContain("startswith(cr664_sourcescreensourceprocess, 'NewDealCreateAdapter/')");
    expect(call.filter).toContain('cr664_outcomestatus eq 788190000');
    expect(call.orderBy).toEqual(['cr664_changeddate desc']);
    expect(call.top).toBe(1);
  });

  it('a failure query excludes the succeeded outcome instead of matching one', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] } as unknown as ReturnType<
      typeof Cr664_auditeventsService.getAll
    > extends Promise<infer R> ? R : never);

    await loadLatestCapabilityWrite('documentUploadAction/', 'failure');

    const call = getAllMock.mock.calls[0]![0] as { filter: string };
    expect(call.filter).toContain('cr664_outcomestatus ne 788190000');
  });

  it('maps a found row to actor/at/correlationId, preferring actorusername over changedbyname', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        {
          cr664_actorusername: 'mpaller@oldglorybank.com',
          cr664_changedbyname: 'System',
          cr664_changeddate: '2026-07-10T12:00:00Z',
          cr664_correlationid: 'corr-77',
        },
      ],
    } as unknown as ReturnType<typeof Cr664_auditeventsService.getAll> extends Promise<infer R> ? R : never);

    const row = await loadLatestCapabilityWrite('StageAdvanceWriteDependency/', 'success');

    expect(row).toEqual({
      actor: 'mpaller@oldglorybank.com',
      at: '2026-07-10T12:00:00Z',
      correlationId: 'corr-77',
    });
  });

  it('falls back to changedbyname when actorusername is absent', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [{ cr664_changedbyname: 'System', cr664_changeddate: '2026-07-10T12:00:00Z' }],
    } as unknown as ReturnType<typeof Cr664_auditeventsService.getAll> extends Promise<infer R> ? R : never);

    const row = await loadLatestCapabilityWrite('checklistWriteDependency/', 'success');
    expect(row?.actor).toBe('System');
  });

  it('returns null (not a fabricated evidence row) when nothing matches', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] } as unknown as ReturnType<
      typeof Cr664_auditeventsService.getAll
    > extends Promise<infer R> ? R : never);

    const row = await loadLatestCapabilityWrite('nothing-matches-this/', 'success');
    expect(row).toBeNull();
  });

  it('throws on a transport failure rather than silently reporting no evidence', async () => {
    getAllMock.mockResolvedValue({
      success: false,
      error: { message: 'not_registered: cr664_auditevents' },
    } as unknown as ReturnType<typeof Cr664_auditeventsService.getAll> extends Promise<infer R> ? R : never);

    await expect(loadLatestCapabilityWrite('NewDealCreateAdapter/', 'success')).rejects.toThrow(
      /not_registered/,
    );
  });
});

describe('summarizeAuditFailure', () => {
  it('maps raw Dataverse memo-length JSON into an operator-safe message', () => {
    const raw = JSON.stringify({
      error: {
        code: '0x80044331',
        message:
          "A validation error occurred. The length of the 'cr664_memotext' attribute of the 'cr664_creditmemo1' entity exceeded the maximum allowed length of '2000'.",
        '@Microsoft.PowerApps.CDS.ErrorDetails.ApiExceptionSourceKey':
          'Plugin/Microsoft.Crm.ObjectModel.TargetAttributeValidationPlugin',
      },
    });

    const out = summarizeAuditFailure(raw);

    expect(out).toBe(
      'Credit memo draft exceeded the former text limit. The save path now stores a bounded summary and preserves the full memo in sections.',
    );
    expect(out).not.toContain('0x80044331');
    expect(out).not.toContain('TargetAttributeValidationPlugin');
    expect(out).not.toContain('cr664_memotext');
  });
});
