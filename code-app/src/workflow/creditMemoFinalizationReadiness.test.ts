import { describe, it, expect } from 'vitest';
import {
  currentCreditMemo,
  evaluateCreditMemoFinalizationReadiness,
} from './creditMemoFinalizationReadiness';
import type { CreditMemoData, CreditMemoSummary } from '../deals/creditMemoQueries';

function memo(overrides: Partial<CreditMemoSummary> = {}): CreditMemoSummary {
  return {
    id: 'memo-1',
    name: 'Acme Corp — Credit Memo',
    status: 'Draft',
    statusKey: 'draft',
    memoType: 'Standard',
    version: 1,
    generatedAt: '2026-07-20T00:00:00.000Z',
    modifiedOn: '2026-07-20T00:00:00.000Z',
    borrowerSafe: false,
    textPreview: 'Preview text',
    fullText: 'Full memo text',
    ...overrides,
  };
}

function data(memos: CreditMemoSummary[]): CreditMemoData {
  return { memos, sections: [] };
}

describe('currentCreditMemo', () => {
  it('returns undefined when there are no memos', () => {
    expect(currentCreditMemo(undefined)).toBeUndefined();
    expect(currentCreditMemo(data([]))).toBeUndefined();
  });

  it('picks the highest-version memo regardless of input order', () => {
    const v1 = memo({ id: 'memo-1', version: 1 });
    const v3 = memo({ id: 'memo-3', version: 3 });
    const v2 = memo({ id: 'memo-2', version: 2 });
    expect(currentCreditMemo(data([v1, v3, v2]))?.id).toBe('memo-3');
  });
});

describe('evaluateCreditMemoFinalizationReadiness', () => {
  it('fails closed when no memo has ever been drafted', () => {
    const r = evaluateCreditMemoFinalizationReadiness(undefined);
    expect(r.memoFinalized.met).toBe(false);
    expect(r.currentMemo).toBeUndefined();
    expect(r.memoFinalized.reason).toMatch(/no credit memo/i);
  });

  it('fails closed when the current (highest-version) memo is still Draft', () => {
    const r = evaluateCreditMemoFinalizationReadiness(data([memo({ statusKey: 'draft', version: 2 })]));
    expect(r.memoFinalized.met).toBe(false);
    expect(r.memoFinalized.reason).toMatch(/v2/);
    expect(r.memoFinalized.reason).toMatch(/draft/i);
  });

  it('fails closed when the current memo is Stale', () => {
    const r = evaluateCreditMemoFinalizationReadiness(data([memo({ statusKey: 'stale', version: 4 })]));
    expect(r.memoFinalized.met).toBe(false);
    expect(r.memoFinalized.reason).toMatch(/stale/i);
  });

  it('is met when the current (highest-version) memo is Final', () => {
    const r = evaluateCreditMemoFinalizationReadiness(data([memo({ statusKey: 'final', version: 2 })]));
    expect(r.memoFinalized.met).toBe(true);
    expect(r.memoFinalized.reason).toBe('');
    expect(r.currentMemo?.version).toBe(2);
  });

  it('never fabricates met from an OLDER final memo when a newer draft supersedes it', () => {
    const olderFinal = memo({ id: 'memo-1', version: 1, statusKey: 'final' });
    const newerDraft = memo({ id: 'memo-2', version: 2, statusKey: 'draft' });
    const r = evaluateCreditMemoFinalizationReadiness(data([olderFinal, newerDraft]));
    expect(r.memoFinalized.met).toBe(false);
    expect(r.currentMemo?.id).toBe('memo-2');
  });
});
