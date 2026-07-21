// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Governance initiative (2026-07-21) — dedicated test file (not the main
 * buildLiveCanonicalTransitionDeps.test.ts) so mocking GOVERNANCE_REASON_FIELD_ENABLED=true here
 * can never leak into or shadow the main file's flag-off assertions.
 */
const { loandealsUpdate, stageGetAll, statusGetAll } = vi.hoisted(() => ({
  loandealsUpdate: vi.fn(),
  stageGetAll: vi.fn(),
  statusGetAll: vi.fn(),
}));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { update: loandealsUpdate },
}));
vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: stageGetAll },
}));
vi.mock('../generated/services/Cr664_dealstatusreferencesService', () => ({
  Cr664_dealstatusreferencesService: { getAll: statusGetAll },
}));
vi.mock('./dealOriginationFeatureFlags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dealOriginationFeatureFlags')>();
  return { ...actual, GOVERNANCE_REASON_FIELD_ENABLED: true };
});

import { buildLiveCanonicalTransitionDeps } from './buildLiveCanonicalTransitionDeps';
import { GOVERNED_TRANSITION_REASON_COLUMN } from './governedTransitionReasonSchema';

beforeEach(() => {
  loandealsUpdate.mockReset().mockResolvedValue({ success: true, data: {} });
  stageGetAll.mockReset().mockResolvedValue({
    success: true,
    data: [{ cr664_dealstagereferenceid: 'stg-underwriting', cr664_code: 'UNDERWRITING', cr664_activeflag: true }],
  });
  statusGetAll.mockReset().mockResolvedValue({
    success: true,
    data: [
      { cr664_dealstatusreferenceid: 'sts-declined', cr664_code: 'DECLINED', cr664_activeflag: true },
      { cr664_dealstatusreferenceid: 'sts-withdrawn', cr664_code: 'WITHDRAWN', cr664_activeflag: true },
    ],
  });
});

describe('buildLiveCanonicalTransitionDeps — reason field write, once GOVERNANCE_REASON_FIELD_ENABLED is armed', () => {
  it('writes the combined reason code + detail onto the SAME loan-deal update the enforcement plugin inspects', async () => {
    const { transport } = buildLiveCanonicalTransitionDeps({ actorSystemUserId: 'su-1', actorEmail: 'banker@ogb.example' });
    await transport.applyTransition({
      dealId: 'deal-1',
      transition: 'DECLINE',
      fromStage: 'UNDERWRITING',
      newStatus: 'DECLINED',
      reasonCode: 'DSCR_TOO_LOW',
      reasonText: 'DSCR 0.9',
      entryDateIso: '2026-07-21T00:00:00Z',
    });
    expect(loandealsUpdate).toHaveBeenCalledTimes(1);
    const patch = loandealsUpdate.mock.calls[0][1];
    expect(patch[GOVERNED_TRANSITION_REASON_COLUMN]).toBe('DSCR_TOO_LOW — DSCR 0.9');
  });

  it('writes free-text-only reasons (RETURN/WITHDRAW) unchanged', async () => {
    const { transport } = buildLiveCanonicalTransitionDeps({ actorSystemUserId: 'su-1', actorEmail: 'banker@ogb.example' });
    await transport.applyTransition({
      dealId: 'deal-1',
      transition: 'RETURN',
      fromStage: 'CREDIT_APPROVAL',
      toStage: 'UNDERWRITING',
      newStatus: 'OPEN',
      reasonText: 'need updated financials',
      entryDateIso: '2026-07-21T00:00:00Z',
    });
    const patch = loandealsUpdate.mock.calls[0][1];
    expect(patch[GOVERNED_TRANSITION_REASON_COLUMN]).toBe('need updated financials');
  });

  it('never writes an empty/whitespace-only reason', async () => {
    const { transport } = buildLiveCanonicalTransitionDeps({ actorSystemUserId: 'su-1', actorEmail: 'banker@ogb.example' });
    await transport.applyTransition({
      dealId: 'deal-1',
      transition: 'WITHDRAW',
      fromStage: 'COMMITMENT',
      newStatus: 'WITHDRAWN',
      reasonText: '   ',
      entryDateIso: '2026-07-21T00:00:00Z',
    });
    const patch = loandealsUpdate.mock.calls[0][1];
    expect(patch[GOVERNED_TRANSITION_REASON_COLUMN]).toBeUndefined();
  });
});
