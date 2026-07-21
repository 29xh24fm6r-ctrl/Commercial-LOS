import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 170L — banker pipeline display-value hydration tests.
 *
 * Pins the New Deal smoke read-model parity fix: `loadBankerPipeline`
 * (→ `toPipelineDeal`) must resolve stage / status via the same
 * formatted-value-first → SDK-shadow fallback the deal detail loader
 * (Phase 122C) and the team/manager loaders (Phase 125B / 128B) use.
 *
 * Before this phase the banker pipeline read ONLY the `<attr>name`
 * shadow fields, which the live env leaves empty for lookup columns —
 * so the Phase 170K smoke deal (created via cr664_StageReference /
 * cr664_StatusReference) showed "Stage not set" in Morning catch-up and
 * "Status not set" on the Active Deals pipeline even though the deal's
 * StageReference / StatusReference formatted values exist.
 */

const { getAllMock } = vi.hoisted(() => ({ getAllMock: vi.fn() }));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: getAllMock },
}));

import { loadBankerPipeline } from './dealQueries';
import { deriveBankerMorningCatchUp } from '../shared/activity/bankerMorningCatchUp';

const SMOKE_DEAL_ID = 'ca41e0df-9869-f111-ab0c-70a8a59be491';

function dealRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cr664_loandealid: SMOKE_DEAL_ID,
    cr664_dealname: '[SMOKE TEST - PHASE 170K - DO NOT USE] TEST - New Deal Smoke 170K',
    cr664_clientname: undefined,
    cr664_amount: 250_000,
    cr664_targetclosedate: '2026-07-01',
    cr664_stageentrydate: '2026-06-15',
    modifiedon: '2026-06-15T00:00:00Z',
    cr664_collateralsummary: undefined,
    statecode: 0,
    cr664_closedflag: undefined,
    cr664_isterminalstatus: false,
    // SDK shadow fields — empty in the live env (the bug this phase fixes).
    cr664_stagereferencename: undefined,
    cr664_statusreferencename: undefined,
    statuscodename: undefined,
    ...over,
  };
}

beforeEach(() => {
  getAllMock.mockReset();
});

describe('Phase 170L — loadBankerPipeline stage/status hydration', () => {
  it('1. hydrates stage from the cr664_StageReference lookup formatted value', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue':
            'TEST - Stage Phase 121',
        }),
      ],
    });
    const out = await loadBankerPipeline('banker-1', { includeTestDeals: true });
    expect(out[0].stage).toBe('TEST - Stage Phase 121');
  });

  it('2. hydrates status from the cr664_StatusReference lookup formatted value', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_statusreference_value@OData.Community.Display.V1.FormattedValue':
            'TEST — Status Phase 121',
        }),
      ],
    });
    const out = await loadBankerPipeline('banker-1', { includeTestDeals: true });
    expect(out[0].status).toBe('TEST — Status Phase 121');
  });

  it('prefers the lookup formatted value over the legacy shadow field', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue':
            'TEST - Stage Phase 121',
          cr664_stagereferencename: 'WRONG SHADOW',
        }),
      ],
    });
    const out = await loadBankerPipeline('banker-1', { includeTestDeals: true });
    expect(out[0].stage).toBe('TEST - Stage Phase 121');
  });

  it('preserves the legacy shadow fallback when the lookup value is absent', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          cr664_stagereferencename: 'Legacy Stage',
          cr664_statusreferencename: 'Legacy Status',
        }),
      ],
    });
    const out = await loadBankerPipeline('banker-1', { includeTestDeals: true });
    expect(out[0].stage).toBe('Legacy Stage');
    expect(out[0].status).toBe('Legacy Status');
  });

  it('status falls back lookup → shadow → statuscode formatted value', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          'statuscode@OData.Community.Display.V1.FormattedValue': 'Active',
        }),
      ],
    });
    const out = await loadBankerPipeline('banker-1', { includeTestDeals: true });
    expect(out[0].status).toBe('Active');
  });

  it('treats an empty-string annotation as absent (falls through)', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue': '',
          cr664_stagereferencename: 'Shadow Stage Wins',
        }),
      ],
    });
    const out = await loadBankerPipeline('banker-1', { includeTestDeals: true });
    expect(out[0].stage).toBe('Shadow Stage Wins');
  });

  it('6. surfaces honest undefined and never leaks a GUID when no display value exists', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [dealRow()] });
    const out = await loadBankerPipeline('banker-1', { includeTestDeals: true });
    expect(out[0].stage).toBeUndefined();
    expect(out[0].status).toBeUndefined();
    // The deal id is still carried, but must never leak into stage/status.
    expect(out[0].id).toBe(SMOKE_DEAL_ID);
    for (const field of [out[0].stage, out[0].status]) {
      if (field !== undefined) {
        expect(field).not.toMatch(/^[0-9a-f-]{36}$/i);
      }
    }
  });
});

describe('Phase 170L — end-to-end: hydrated pipeline suppresses the missing-stage signal', () => {
  function deriveFrom(deals: Awaited<ReturnType<typeof loadBankerPipeline>>) {
    return deriveBankerMorningCatchUp(
      {
        deals: deals.map((d) => ({
          id: d.id,
          name: d.name,
          stage: d.stage,
          targetCloseDate: d.targetCloseDate,
          stageEntryDate: d.stageEntryDate,
          lastActivityOn: d.lastActivityOn,
          clientName: d.clientName,
          amount: d.amount,
          collateralSummary: d.collateralSummary,
        })),
        tasks: [],
        outstandingDocuments: [],
        pendingReviewDocuments: [],
        memos: [],
        memoSections: [],
        bankerName: 'Matthew Paller',
      },
      new Date('2026-06-16T00:00:00Z'),
    );
  }

  it('3. no "Stage not set" item when only the StageReference formatted value exists', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue':
            'TEST - Stage Phase 121',
        }),
      ],
    });
    const items = deriveFrom(await loadBankerPipeline('banker-1', { includeTestDeals: true }));
    expect(items.some((i) => i.title === 'Stage not set')).toBe(false);
  });

  it('4. still emits "Stage not set" when neither lookup nor shadow has a stage', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [dealRow()] });
    const items = deriveFrom(await loadBankerPipeline('banker-1', { includeTestDeals: true }));
    expect(items.some((i) => i.title === 'Stage not set')).toBe(true);
  });
});

describe('Phase 170L — read-only / scope discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'dealQueries.ts'), 'utf8');

  it('7. + New Deal create stays disabled in the app truth model', async () => {
    const { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } = await import(
      '../admin/adminNewDealIntakeModel'
    );
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });

  it('8. the banker pipeline loader is read-only (no create/patch/delete)', () => {
    expect(SRC).not.toMatch(/\bcreate\s*\(|createRecord|update\s*\(|updateRecord|delete\s*\(|deleteRecord/i);
    expect(SRC).not.toMatch(/method:\s*'(POST|PATCH|DELETE)'/);
    // It reads via the generated service getAll only.
    expect(SRC).toMatch(/Cr664_loandealsService\.getAll/);
  });

  it('9. touches no Advance Stage / stage-progression logic and leaks no GUID label', () => {
    expect(SRC).not.toMatch(/advance\s*stage|stagehistory|stage\s*progression|cr664_stagereferences\b/i);
    // Hydration reads the deal-reference lookup formatted value, never a raw id.
    expect(SRC).toMatch(/getLookupFormattedValue\(raw, 'cr664_stagereference'\)/);
    expect(SRC).not.toMatch(/_cr664_stagereference_value['"`]\s*\]/); // never surfaces the raw _value id
  });
});

describe('P1-11 — loadBankerPipeline excludes classified test/smoke deals by default', () => {
  beforeEach(() => getAllMock.mockReset());

  it('EXCLUDES the [SMOKE TEST ...] deal from the normal (default) banker pipeline', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [dealRow()] });
    const out = await loadBankerPipeline('banker-1');
    expect(out).toHaveLength(0); // the supervised smoke deal must not inflate operational counts
  });

  it('INCLUDES it under the authorized admin opt-in (nothing is deleted)', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [dealRow()] });
    const out = await loadBankerPipeline('banker-1', { includeTestDeals: true });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(SMOKE_DEAL_ID);
  });

  it('keeps a real operational deal alongside an excluded smoke deal', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [dealRow(), dealRow({ cr664_loandealid: 'real-1', cr664_dealname: 'Acme Expansion' })],
    });
    const out = await loadBankerPipeline('banker-1');
    expect(out.map((d) => d.name)).toEqual(['Acme Expansion']);
  });
});
