// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./DealDataProvider', () => ({ useDealData: vi.fn() }));
vi.mock('../banker/BankerContext', () => ({ useOptionalBanker: vi.fn() }));

const updateMock = vi.fn();
vi.mock('./write/updateDealProfile', () => ({ updateDealProfile: (...a: unknown[]) => updateMock(...a) }));
vi.mock('./write/buildLiveUpdateDealProfileDeps', () => ({ buildLiveUpdateDealProfileDeps: () => ({}) }));

// Reference option loader is mocked so the modal's per-category dropdown-gating
// is driven by the test (real options vs unavailable/empty) with no SDK.
const loadRefMock = vi.fn();
vi.mock('./write/dealReferenceOptions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./write/dealReferenceOptions')>();
  return { ...actual, loadLiveDealReferenceOptionsByCategory: (...a: unknown[]) => loadRefMock(...a) };
});

// CRM/NAICS industry projection is mocked so the modal's Industry banners are
// driven by the test with no SDK.
const projMock = vi.fn();
vi.mock('../crm/dealIndustryProjection', () => ({
  loadLiveDealIndustryProjection: (...a: unknown[]) => projMock(...a),
}));

import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { DealProfileEditLauncher } from './DealProfileEditModal';
import type { DealDetail } from './dealQueries';
import { deriveDealCockpitMetrics } from './dealCockpitMetrics';

const useDealDataMock = vi.mocked(useDealData);
const useBankerMock = vi.mocked(useOptionalBanker);

function deal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'OmniCare 365 WC',
    clientName: 'OmniCare 365',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    bankerName: 'M. Paller',
    targetCloseDate: undefined,
    productType: undefined,
    loanStructure: undefined,
    customerType: undefined,
    industry: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    createdOn: undefined,
    stageEntryDate: undefined,
    isClosed: false,
    ...over,
  };
}

const applyPatch = vi.fn();
function setContext(d: DealDetail) {
  useDealDataMock.mockReturnValue({
    deal: d,
    tasks: { kind: 'loading' },
    documents: { kind: 'loading' },
    creditMemo: { kind: 'loading' },
    activity: { kind: 'loading' },
    refresh: vi.fn(),
    applyVerifiedDealPatch: applyPatch,
  } as unknown as ReturnType<typeof useDealData>);
}
function setBanker(over: Partial<ReturnType<typeof useOptionalBanker>> = {}) {
  useBankerMock.mockReturnValue({
    bankerId: 'b1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...over,
  } as ReturnType<typeof useOptionalBanker>);
}

const REF_OPTIONS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'SBA 7(a)', code: 'SBA_7A', active: true },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Term Loan', code: 'TERM_LOAN', active: true },
];

type RefResult = { kind: 'ready'; options: typeof REF_OPTIONS } | { kind: 'empty'; reason: string } | { kind: 'unavailable'; reason: string };

/** Build a per-category loader result; unspecified fields fall back to `base`. */
function byCategory(over: Partial<Record<'productType' | 'loanStructure' | 'pricingType', RefResult>>, base: RefResult) {
  return {
    productType: over.productType ?? base,
    loanStructure: over.loanStructure ?? base,
    pricingType: over.pricingType ?? base,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockReset();
  // Default: every category is unavailable (fields stay read-only) unless a test
  // opts into ready options.
  loadRefMock.mockResolvedValue(byCategory({}, { kind: 'unavailable', reason: 'datasource not registered' }));
  // Default: no CRM link, so no Industry projection banner unless a test opts in.
  projMock.mockResolvedValue({ kind: 'no-crm-link' });
});

describe('DealProfileEditLauncher — entry point', () => {
  it('shows "Complete Deal Profile" when tracked editable fields are missing', () => {
    setContext(deal());
    setBanker();
    render(<DealProfileEditLauncher source="missing-fields" />);
    const btn = screen.getByRole('button', { name: /Complete Deal Profile/i });
    expect(btn.getAttribute('data-deal-profile-launch')).toBe('missing-fields');
  });

  it('shows "Edit Deal Profile" when every editable field is populated', () => {
    setContext(deal({
      targetCloseDate: '2026-09-30', customerType: 'New', industry: 'Retail',
      guarantorStructure: 'Limited', collateralSummary: 'A/R',
      productType: 'SBA 7(a)', loanStructure: 'Term Loan', pricingType: 'Variable',
    }));
    setBanker();
    render(<DealProfileEditLauncher source="deal-summary" />);
    expect(screen.getByRole('button', { name: /Edit Deal Profile/i })).toBeInTheDocument();
  });

  it('an unauthorized user sees the exact reason and NO action button', () => {
    setContext(deal());
    setBanker({ systemUserId: undefined, writeDisabledReason: 'No Dataverse identity for your sign-in.' });
    render(<DealProfileEditLauncher source="attention-console" />);
    expect(screen.queryByRole('button', { name: /Deal Profile/i })).toBeNull();
    expect(screen.getByText(/No Dataverse identity for your sign-in/i)).toBeInTheDocument();
  });
});

describe('DealProfileEditModal — fields + governed save', () => {
  it('renders every tracked editable field (and read-only reference fields)', async () => {
    setContext(deal());
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="missing-fields" />);
    await user.click(screen.getByRole('button', { name: /Complete Deal Profile/i }));

    for (const f of ['targetCloseDate', 'customerType', 'industry', 'guarantorStructure', 'collateralSummary']) {
      expect(document.querySelector(`[data-deal-profile-field="${f}"]`)).not.toBeNull();
    }
    // Reference lookups shown read-only (no fabricated dropdown).
    for (const f of ['productType', 'loanStructure', 'pricingType']) {
      expect(document.querySelector(`[data-deal-profile-field-readonly="${f}"]`)).not.toBeNull();
      expect(document.querySelector(`[data-deal-profile-field="${f}"]`)).toBeNull();
    }
    // No amount / stage / status / client / banker editors exist.
    for (const f of ['amount', 'stage', 'status', 'clientName', 'bankerName']) {
      expect(document.querySelector(`[data-deal-profile-field="${f}"]`)).toBeNull();
    }
  });

  it('saves changed fields via the governed adapter and merges the verified readback (no reload)', async () => {
    setContext(deal());
    setBanker();
    updateMock.mockResolvedValue({
      kind: 'updated',
      dealId: 'deal-1',
      correlationId: 'dp-1',
      verified: { industry: 'Retail', collateralSummary: 'A/R, inventory' },
      changedLabels: ['Industry', 'Collateral'],
      auditId: 'a-1',
    });
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="missing-fields" />);
    await user.click(screen.getByRole('button', { name: /Complete Deal Profile/i }));

    await user.selectOptions(document.querySelector('[data-deal-profile-field="industry"]') as HTMLSelectElement, 'Retail');
    await user.type(document.querySelector('[data-deal-profile-field="collateralSummary"]') as HTMLTextAreaElement, 'A/R, inventory');
    await user.click(document.querySelector('[data-deal-profile-save]') as HTMLButtonElement);

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    // Only the changed fields are sent; forbidden fields never appear.
    const arg = updateMock.mock.calls[0][0] as { dealId: string; patch: Record<string, unknown> };
    expect(arg.dealId).toBe('deal-1');
    expect(arg.patch).toEqual({ industry: 'Retail', collateralSummary: 'A/R, inventory' });
    expect(arg.patch).not.toHaveProperty('amount');
    expect(arg.patch).not.toHaveProperty('clientName');

    // The verified readback is merged into the cockpit deal row (no browser reload).
    expect(applyPatch).toHaveBeenCalledWith({ industry: 'Retail', collateralSummary: 'A/R, inventory' });
    expect(await screen.findByText(/Deal profile saved/i)).toBeInTheDocument();
  });

  it('Save is disabled until a field changes', async () => {
    setContext(deal());
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="deal-summary" />);
    await user.click(screen.getByRole('button', { name: /Complete Deal Profile/i }));
    expect(document.querySelector('[data-deal-profile-save]')).toBeDisabled();
  });

  it('a readback mismatch is an honest failure and does NOT update the cockpit', async () => {
    setContext(deal());
    setBanker();
    updateMock.mockResolvedValue({ kind: 'readback-mismatch', field: 'industry', correlationId: 'dp-2' });
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="missing-fields" />);
    await user.click(screen.getByRole('button', { name: /Complete Deal Profile/i }));
    await user.selectOptions(document.querySelector('[data-deal-profile-field="industry"]') as HTMLSelectElement, 'Retail');
    await user.click(document.querySelector('[data-deal-profile-save]') as HTMLButtonElement);

    await waitFor(() =>
      expect(document.querySelector('[data-deal-profile-outcome="readback-mismatch"]')).not.toBeNull(),
    );
    expect(applyPatch).not.toHaveBeenCalled();
    expect(screen.queryByText(/Deal profile saved/i)).toBeNull();
  });
});

describe('DealProfileEditModal — governed reference lookups', () => {
  it('renders reference dropdowns ONLY when real registered options load', async () => {
    loadRefMock.mockResolvedValue(byCategory({}, { kind: 'ready', options: REF_OPTIONS }));
    setContext(deal());
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="deal-summary" />);
    await user.click(screen.getByRole('button', { name: /Complete Deal Profile/i }));

    // Each reference field becomes an editable <select> with the REAL option names.
    for (const f of ['productType', 'loanStructure', 'pricingType']) {
      const sel = await waitFor(() => {
        const el = document.querySelector(`[data-deal-profile-field="${f}"]`);
        if (!el) throw new Error('not yet');
        return el as HTMLSelectElement;
      });
      expect(sel.tagName).toBe('SELECT');
      expect(sel.textContent).toContain('SBA 7(a)');
      expect(sel.textContent).toContain('Term Loan');
      // Not read-only anymore.
      expect(document.querySelector(`[data-deal-profile-field-readonly="${f}"]`)).toBeNull();
    }
  });

  it('keeps reference fields READ-ONLY with the exact reason when the list is unavailable', async () => {
    loadRefMock.mockResolvedValue(byCategory({}, { kind: 'unavailable', reason: 'cr664_producttypereferences not registered' }));
    setContext(deal());
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="missing-fields" />);
    await user.click(screen.getByRole('button', { name: /Complete Deal Profile/i }));
    await waitFor(() =>
      expect(document.querySelector('[data-deal-profile-reference-reason="productType"]')?.textContent).toMatch(
        /not registered/i,
      ),
    );
    // No dropdown was rendered — the field cannot be completed.
    expect(document.querySelector('[data-deal-profile-field="productType"]')).toBeNull();
  });

  it('keeps reference fields read-only with the seed reason when the list is empty', async () => {
    loadRefMock.mockResolvedValue(byCategory({}, { kind: 'empty', reason: 'No active reference rows exist yet. Seed them first.' }));
    setContext(deal());
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="missing-fields" />);
    await user.click(screen.getByRole('button', { name: /Complete Deal Profile/i }));
    await waitFor(() =>
      expect(document.querySelector('[data-deal-profile-reference-reason="loanStructure"]')?.textContent).toMatch(
        /Seed them first/i,
      ),
    );
  });

  it('saves a selected reference as an @odata.bind selection with the loaded allow-list', async () => {
    // productType has the two values; the other categories are empty, so the
    // union allow-list is exactly the two productType ids.
    loadRefMock.mockResolvedValue(
      byCategory({ productType: { kind: 'ready', options: REF_OPTIONS } }, { kind: 'empty', reason: 'none yet' }),
    );
    setContext(deal());
    setBanker();
    updateMock.mockResolvedValue({
      kind: 'updated', dealId: 'deal-1', correlationId: 'dp-1',
      verified: { productType: 'SBA 7(a)' }, changedLabels: ['Product type'], auditId: 'a-1',
    });
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="deal-summary" />);
    await user.click(screen.getByRole('button', { name: /Complete Deal Profile/i }));
    const sel = await waitFor(() => {
      const el = document.querySelector('[data-deal-profile-field="productType"]');
      if (!el) throw new Error('not yet');
      return el as HTMLSelectElement;
    });
    await user.selectOptions(sel, '11111111-1111-1111-1111-111111111111');
    await user.click(document.querySelector('[data-deal-profile-save]') as HTMLButtonElement);

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const arg = updateMock.mock.calls[0][0] as {
      referencePatch: Record<string, unknown>;
      allowedReferenceIds: string[];
    };
    expect(arg.referencePatch).toEqual({
      productType: { id: '11111111-1111-1111-1111-111111111111', name: 'SBA 7(a)' },
    });
    expect(arg.allowedReferenceIds).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
    expect(applyPatch).toHaveBeenCalledWith({ productType: 'SBA 7(a)' });
  });

  it('warns honestly when the deal carries an inactive value not in the active list', async () => {
    // Active options do NOT include the deal's current productType → it is inactive.
    loadRefMock.mockResolvedValue(byCategory({ productType: { kind: 'ready', options: REF_OPTIONS } }, { kind: 'empty', reason: 'none yet' }));
    setContext(deal({
      targetCloseDate: '2026-09-30', customerType: 'New', industry: 'Retail',
      guarantorStructure: 'Limited', collateralSummary: 'A/R',
      productType: 'Retired Product', loanStructure: 'Term loan', pricingType: 'Fixed',
    }));
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="deal-summary" />);
    await user.click(screen.getByRole('button', { name: /Edit Deal Profile/i }));

    const warn = await waitFor(() => {
      const el = document.querySelector('[data-deal-profile-reference-inactive="productType"]');
      if (!el) throw new Error('not yet');
      return el as HTMLElement;
    });
    expect(warn.textContent).toMatch(/inactive/i);
    // The current (inactive) value is still shown as the keep-current option.
    const sel = document.querySelector('[data-deal-profile-field="productType"]') as HTMLSelectElement;
    expect(sel.textContent).toMatch(/Retired Product/);
    expect(sel.textContent).toMatch(/\(inactive\)/);
  });
});

describe('DealProfileEditModal — CRM/NAICS industry projection (Phase 4B)', () => {
  const derived = { kind: 'derived', naicsCode: '333111', sectorCode: '31-33', sectorTitle: 'Manufacturing', dealIndustry: 'Manufacturing' };

  it('shows the CRM/NAICS source when the deal industry already matches', async () => {
    projMock.mockResolvedValue(derived);
    setContext(deal({ industry: 'Manufacturing' }));
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="deal-summary" />);
    await user.click(screen.getByRole('button', { name: /Deal Profile/i }));
    const src = await waitFor(() => {
      const el = document.querySelector('[data-deal-industry-source="crm-naics"]');
      if (!el) throw new Error('not yet');
      return el as HTMLElement;
    });
    expect(src.textContent).toMatch(/Manufacturing/);
    expect(document.querySelector('[data-deal-industry-conflict]')).toBeNull();
  });

  it('suggests + applies the CRM/NAICS industry when the deal has none (governed write, no reload)', async () => {
    projMock.mockResolvedValue(derived);
    setContext(deal({ industry: undefined }));
    setBanker();
    updateMock.mockResolvedValue({
      kind: 'updated', dealId: 'deal-1', correlationId: 'dp-1',
      verified: { industry: 'Manufacturing' }, changedLabels: ['Industry'], auditId: 'a-1',
    });
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="missing-fields" />);
    await user.click(screen.getByRole('button', { name: /Deal Profile/i }));

    const apply = await waitFor(() => {
      const el = document.querySelector('[data-deal-industry-apply]');
      if (!el) throw new Error('not yet');
      return el as HTMLButtonElement;
    });
    await user.click(apply);

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    // Applies ONLY the mapped deal industry option, via the governed adapter.
    expect((updateMock.mock.calls[0][0] as { patch: Record<string, unknown> }).patch).toEqual({ industry: 'Manufacturing' });
    // The verified value merges into the cockpit (no reload).
    expect(applyPatch).toHaveBeenCalledWith({ industry: 'Manufacturing' });
  });

  it('warns on a CRM/deal industry conflict', async () => {
    projMock.mockResolvedValue(derived);
    setContext(deal({ industry: 'Retail' }));
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="deal-summary" />);
    await user.click(screen.getByRole('button', { name: /Deal Profile/i }));
    const conflict = await waitFor(() => {
      const el = document.querySelector('[data-deal-industry-conflict]');
      if (!el) throw new Error('not yet');
      return el as HTMLElement;
    });
    expect(conflict.textContent).toMatch(/CRM says/i);
    expect(conflict.textContent).toMatch(/Manufacturing/);
    expect(conflict.textContent).toMatch(/Retail/);
    // Apply is offered to reconcile.
    expect(document.querySelector('[data-deal-industry-apply]')).not.toBeNull();
  });

  it('shows an honest "no mapped industry" state (no apply, no fabrication)', async () => {
    projMock.mockResolvedValue({ kind: 'no-mapping', naicsCode: '541511', sectorCode: '54', sectorTitle: 'Professional, Scientific, and Technical Services' });
    setContext(deal({ industry: undefined }));
    setBanker();
    const user = userEvent.setup();
    render(<DealProfileEditLauncher source="missing-fields" />);
    await user.click(screen.getByRole('button', { name: /Deal Profile/i }));
    await waitFor(() =>
      expect(document.querySelector('[data-deal-industry-nomapping]')?.textContent).toMatch(/no mapped deal industry/i),
    );
    // No apply button, no fabricated derived industry.
    expect(document.querySelector('[data-deal-industry-apply]')).toBeNull();
    expect(document.querySelector('[data-deal-industry-source]')).toBeNull();
  });
});

describe('cockpit missing-count drops after a verified save (pure)', () => {
  it('merging the verified patch removes those fields from the missing list', () => {
    const before = deal();
    const metricsInput = { tasks: undefined, documents: undefined, creditMemo: undefined, activity: undefined };
    const beforeMissing = deriveDealCockpitMetrics({ deal: before, ...metricsInput }).missingFieldLabels;
    expect(beforeMissing).toContain('Industry');
    expect(beforeMissing).toContain('Collateral');

    const after = { ...before, industry: 'Retail', collateralSummary: 'A/R' };
    const afterMissing = deriveDealCockpitMetrics({ deal: after, ...metricsInput }).missingFieldLabels;
    expect(afterMissing).not.toContain('Industry');
    expect(afterMissing).not.toContain('Collateral');
    expect(afterMissing.length).toBeLessThan(beforeMissing.length);
  });

  it('selecting all three reference lookups drops the last 3 missing fields to 0', () => {
    // A deal already complete except the three reference lookups (the OmniCare 3).
    const before = deal({
      targetCloseDate: '2026-09-30', customerType: 'New', industry: 'Retail',
      guarantorStructure: 'Limited', collateralSummary: 'A/R',
      productType: undefined, loanStructure: undefined, pricingType: undefined,
    });
    const metricsInput = { tasks: undefined, documents: undefined, creditMemo: undefined, activity: undefined };
    const beforeMissing = deriveDealCockpitMetrics({ deal: before, ...metricsInput }).missingFieldLabels;
    expect(beforeMissing).toEqual(expect.arrayContaining(['Product type', 'Loan structure', 'Pricing type']));

    // Verified reference names merged via applyVerifiedDealPatch.
    const after = { ...before, productType: 'SBA 7(a)', loanStructure: 'Term Loan', pricingType: 'Variable' };
    const afterMissing = deriveDealCockpitMetrics({ deal: after, ...metricsInput }).missingFieldLabels;
    expect(afterMissing).toHaveLength(0);
  });
});
