import { describe, it, expect, vi, beforeEach } from 'vitest';

// adminDiagnosticsQueries.ts (dynamically imported by platformOperationsLiveDeps.ts)
// pulls in six generated services that transitively require @microsoft/power-apps,
// which Vitest cannot resolve here — mock them so the dynamic import succeeds.
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
import { buildPlatformOperationsConsoleInput } from './platformOperationsLiveDeps';
import { PLATFORM_OPERATIONS_CAPABILITY_SPECS } from './platformOperationsCapabilitySpecs';

const getAllMock = vi.mocked(Cr664_auditeventsService.getAll);

/**
 * Factory Arc Phase 4 — platformOperationsLiveDeps.ts assembles the console
 * input for all 12 capabilities. Verifies: every capability is present, the
 * deployment commit resolves (real, from vitest.config.ts's define), the 4
 * verified-prefix capabilities get real write-evidence queries, the other 8
 * honestly report "not yet correlated" (undefined) rather than a fabricated
 * null/evidence row, and a query failure degrades that one capability's
 * fields to undefined instead of throwing the whole workspace.
 */
describe('buildPlatformOperationsConsoleInput', () => {
  beforeEach(() => {
    getAllMock.mockReset();
    getAllMock.mockResolvedValue({ success: true, data: [] } as unknown as ReturnType<
      typeof Cr664_auditeventsService.getAll
    > extends Promise<infer R> ? R : never);
  });

  it('returns one capability entry per spec, plus a resolved deployment commit', async () => {
    const input = await buildPlatformOperationsConsoleInput();
    expect(input.capabilities).toHaveLength(PLATFORM_OPERATIONS_CAPABILITY_SPECS.length);
    expect(input.deploymentCommit).not.toBeNull();
    expect(input.deploymentCommit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('shows no smoke recorded for every capability (no evidence table exists yet — never fabricated)', async () => {
    const input = await buildPlatformOperationsConsoleInput();
    for (const c of input.capabilities) {
      expect(c.latestSmoke ?? null).toBeNull();
    }
  });

  it('queries write evidence for the 5 verified-prefix capabilities', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [{ cr664_actorusername: 'op@bank.com', cr664_changeddate: '2026-07-01T00:00:00Z', cr664_correlationid: 'c-1' }],
    } as unknown as ReturnType<typeof Cr664_auditeventsService.getAll> extends Promise<infer R> ? R : never);

    const input = await buildPlatformOperationsConsoleInput();
    const byKey = new Map(input.capabilities.map((c) => [c.key, c]));

    for (const key of ['new-deal-create', 'stage-progression', 'checklist-generation', 'document-upload', 'task-generation']) {
      const c = byKey.get(key)!;
      expect(c.latestSuccessfulWrite, `${key}.latestSuccessfulWrite`).toEqual({
        actor: 'op@bank.com',
        at: '2026-07-01T00:00:00Z',
        correlationId: 'c-1',
      });
    }
  });

  it('reports "not yet correlated" (undefined) for capabilities with no verified sourceProcess prefix', async () => {
    const input = await buildPlatformOperationsConsoleInput();
    const byKey = new Map(input.capabilities.map((c) => [c.key, c]));

    for (const key of [
      'borrower-communication',
      'borrower-sms',
      'crm-manual-write',
      'crm-writeback',
      'portfolio-boarding-manual',
      'portfolio-boarding',
      'audit-event-writes',
    ]) {
      const c = byKey.get(key)!;
      expect(c.latestSuccessfulWrite, `${key}.latestSuccessfulWrite`).toBeUndefined();
      expect(c.latestFailedWrite, `${key}.latestFailedWrite`).toBeUndefined();
    }
    // No live-tracked change history exists for a TS flag constant.
    expect(byKey.get('new-deal-create')!.enabledBy).toBeNull();
    expect(byKey.get('new-deal-create')!.enabledOn).toBeNull();
  });

  it('degrades one capability to undefined write evidence on a query failure, without throwing', async () => {
    getAllMock.mockRejectedValue(new Error('not_registered: cr664_auditevents'));

    const input = await buildPlatformOperationsConsoleInput();
    const newDeal = input.capabilities.find((c) => c.key === 'new-deal-create')!;
    expect(newDeal.latestSuccessfulWrite).toBeUndefined();
    expect(newDeal.latestFailedWrite).toBeUndefined();
  });
});
