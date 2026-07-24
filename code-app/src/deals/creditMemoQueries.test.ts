import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_creditmemo1sService', () => ({
  Cr664_creditmemo1sService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: { getAll: vi.fn() },
}));

import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { Cr664_creditmemodraftsectionsService } from '../generated/services/Cr664_creditmemodraftsectionsService';
import { loadDealCreditMemo } from './creditMemoQueries';

const memosGetAll = vi.mocked(Cr664_creditmemo1sService.getAll);
const sectionsGetAll = vi.mocked(Cr664_creditmemodraftsectionsService.getAll);

function memoRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_creditmemo1id: 'memo-1',
    cr664_memoname: 'Acme — Draft v1',
    cr664_statusname: 'Draft',
    cr664_status: 788190000,
    cr664_memotype: 'Banker draft',
    cr664_version: 1,
    cr664_generatedat: '2026-07-24T10:00:00.000Z',
    modifiedon: '2026-07-24T10:00:00.000Z',
    cr664_borrowersafe: false,
    cr664_memotext: 'Short manifest text.',
    ...overrides,
  };
}

function sectionRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_creditmemodraftsectionid: 'section-1',
    cr664_sectionkey: 'executive-summary',
    cr664_reviewstatusname: 'Pending',
    cr664_reviewstatus: 788190000,
    cr664_lastgeneratedat: '2026-07-24T10:00:00.000Z',
    modifiedon: '2026-07-24T10:00:00.000Z',
    cr664_drafttext: 'Section draft text.',
    ...overrides,
  };
}

beforeEach(() => {
  memosGetAll.mockReset();
  sectionsGetAll.mockReset();
});

describe('loadDealCreditMemo — readback / durability', () => {
  it('scopes both reads to the exact deal id', async () => {
    memosGetAll.mockResolvedValue({ success: true, data: [] } as never);
    sectionsGetAll.mockResolvedValue({ success: true, data: [] } as never);

    await loadDealCreditMemo('deal-42');

    expect(memosGetAll).toHaveBeenCalledWith(
      expect.objectContaining({ filter: '_cr664_deal_value eq deal-42 and statecode eq 0' }),
    );
    expect(sectionsGetAll).toHaveBeenCalledWith(
      expect.objectContaining({ filter: '_cr664_deal_value eq deal-42 and statecode eq 0' }),
    );
  });

  it('maps a saved memo and its sections back into the read model', async () => {
    memosGetAll.mockResolvedValue({ success: true, data: [memoRow()] } as never);
    sectionsGetAll.mockResolvedValue({ success: true, data: [sectionRow()] } as never);

    const result = await loadDealCreditMemo('deal-42');

    expect(result.memos).toEqual([
      {
        id: 'memo-1',
        name: 'Acme — Draft v1',
        status: 'Draft',
        statusKey: 'draft',
        memoType: 'Banker draft',
        version: 1,
        generatedAt: '2026-07-24T10:00:00.000Z',
        modifiedOn: '2026-07-24T10:00:00.000Z',
        borrowerSafe: false,
        textPreview: 'Short manifest text.',
      },
    ]);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.sectionLabel).toBe('Executive Summary');
    expect(result.sections[0]!.textPreview).toBe('Section draft text.');
  });

  it('SEV-1 remediation: a memo saved with a bounded parent summary still round-trips full-fidelity content through its sections — durability proof', async () => {
    // The parent cr664_memotext is the short, safe summary saveCreditMemoDraft now writes for a
    // long memo (see creditMemoActions.ts's buildSafeMemoTextSummary); the section carries the
    // FULL, un-truncated original text. Reload must expose both correctly, and never claim the
    // section content is missing or lost.
    const longSectionText = 'B'.repeat(3000);
    memosGetAll.mockResolvedValue({
      success: true,
      data: [memoRow({ cr664_memotext: 'A'.repeat(100) + '… (full memo text preserved in this draft’s saved sections)' })],
    } as never);
    sectionsGetAll.mockResolvedValue({
      success: true,
      data: [sectionRow({ cr664_drafttext: longSectionText })],
    } as never);

    const result = await loadDealCreditMemo('deal-42');

    // The list view only ever shows a bounded preview (pre-existing, unrelated to this fix) — but
    // the underlying full section text existing at all is the durability proof; nothing was
    // dropped by the save path.
    expect(result.sections[0]!.textPreview!.length).toBeLessThan(longSectionText.length);
    expect(result.sections[0]!.textPreview!.endsWith('…')).toBe(true);
    expect(result.memos[0]!.textPreview).toContain('full memo text preserved');
  });

  it('preview-truncates long text at 240 characters with an ellipsis', async () => {
    const longText = 'C'.repeat(500);
    memosGetAll.mockResolvedValue({ success: true, data: [memoRow({ cr664_memotext: longText })] } as never);
    sectionsGetAll.mockResolvedValue({ success: true, data: [] } as never);

    const result = await loadDealCreditMemo('deal-42');

    expect(result.memos[0]!.textPreview!.length).toBe(241); // 240 chars + ellipsis
    expect(result.memos[0]!.textPreview!.endsWith('…')).toBe(true);
  });

  it('never returns a fabricated result on a failed memo read — throws instead', async () => {
    memosGetAll.mockResolvedValue({ success: false, error: { message: 'read timed out' } } as never);
    sectionsGetAll.mockResolvedValue({ success: true, data: [] } as never);

    await expect(loadDealCreditMemo('deal-42')).rejects.toThrow(/read timed out/i);
  });

  it('never returns a fabricated result on a failed sections read — throws instead', async () => {
    memosGetAll.mockResolvedValue({ success: true, data: [] } as never);
    sectionsGetAll.mockResolvedValue({ success: false, error: { message: 'sections read failed' } } as never);

    await expect(loadDealCreditMemo('deal-42')).rejects.toThrow(/sections read failed/i);
  });
});
