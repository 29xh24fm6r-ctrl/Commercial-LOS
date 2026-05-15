import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DealDetail } from '../../deals/dealQueries';
import type {
  CreditMemoData,
  CreditMemoSectionItem,
  CreditMemoSummary,
} from '../../deals/creditMemoQueries';
import {
  checkCreditMemoConsistency,
  extractDollarAmounts,
} from './checkCreditMemoConsistency';

/**
 * Phase 73 — pure consistency-checker tests. Pure function, so
 * each test is a deterministic call against synthetic inputs.
 * Covers:
 *   - no-draft branch (hasDraftToCompare=false, empty findings)
 *   - clean memo branch (no findings)
 *   - each of the six finding types in isolation
 *   - missing-field fallbacks (deal field absent → check is skipped
 *     silently; memo field absent → check fires or skips per design)
 *   - amount-extraction edge cases ($1M / 1.5 million / $50 / bare
 *     digits NOT matched / suffix-only matches)
 *   - module hygiene: no SDK / role-module / power-apps import
 */

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Acme Working Capital',
    clientName: 'Acme Manufacturing, LLC',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-09-30T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'Two personal',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R, inventory',
    createdOn: '2026-01-15T00:00:00Z',
    stageEntryDate: '2026-05-01T00:00:00Z',
    isClosed: false,
    ...overrides,
  };
}

function memoSummary(text: string | undefined): CreditMemoSummary {
  return {
    id: 'm-' + Math.random().toString(36).slice(2, 8),
    name: 'Acme Working Capital — Draft v1',
    status: 'Draft',
    statusKey: 'draft',
    memoType: 'Banker draft',
    version: 1,
    generatedAt: '2026-06-01T00:00:00Z',
    modifiedOn: undefined,
    borrowerSafe: false,
    textPreview: text,
  };
}

function section(
  label: string,
  text: string | undefined,
): CreditMemoSectionItem {
  return {
    id: 's-' + Math.random().toString(36).slice(2, 8),
    sectionKey: label.toLowerCase().replace(/\s+/g, '-'),
    sectionLabel: label,
    reviewStatus: 'Pending',
    reviewStatusKey: 'Pending',
    lastGeneratedAt: '2026-06-01T00:00:00Z',
    modifiedOn: undefined,
    textPreview: text,
  };
}

function data(
  memos: CreditMemoSummary[] = [],
  sections: CreditMemoSectionItem[] = [],
): CreditMemoData {
  return { memos, sections };
}

// ---------------------------------------------------------------------------
// 1. No-draft and clean-memo branches
// ---------------------------------------------------------------------------

describe('Phase 73 — no-draft and clean-memo branches', () => {
  it('returns hasDraftToCompare=false when no memos and no sections exist', () => {
    const r = checkCreditMemoConsistency(baseDeal(), data());
    expect(r.hasDraftToCompare).toBe(false);
    expect(r.findings).toEqual([]);
  });

  it('returns hasDraftToCompare=false when every memo and section text is empty/whitespace', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([memoSummary('   '), memoSummary(undefined)], [section('Risk', '')]),
    );
    expect(r.hasDraftToCompare).toBe(false);
    expect(r.findings).toEqual([]);
  });

  it('returns no findings for a memo that references deal name, client, stage, amount, and has a non-empty collateral section', () => {
    const memoText =
      'Acme Working Capital. Borrower: Acme Manufacturing, LLC. ' +
      'Currently in Underwriting. Loan amount $4,500,000. ' +
      'Senior secured against A/R and inventory.';
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([memoSummary(memoText)], [section('Collateral', 'A/R, inventory')]),
    );
    expect(r.hasDraftToCompare).toBe(true);
    expect(r.findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Per-finding-type tests (in isolation)
// ---------------------------------------------------------------------------

describe('Phase 73 — deal-name-reference finding', () => {
  it('fires when deal name does not appear in the memo text', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Borrower: Acme Manufacturing, LLC. Loan $4,500,000. Underwriting.',
        ),
      ]),
    );
    const finding = r.findings.find((f) => f.id === 'deal-name-reference');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('needs-review');
    expect(finding!.fieldLabel).toBe('Deal name');
    expect(finding!.structuredValue).toBe('Acme Working Capital');
    expect(finding!.source).toBe('credit-memo-draft');
    expect(finding!.confidence).toBe('deterministic');
    expect(finding!.message).toContain('Acme Working Capital');
  });

  it('skips silently when the deal name is missing or shorter than 4 chars', () => {
    const r1 = checkCreditMemoConsistency(
      baseDeal({ name: '' }),
      data([memoSummary('something')]),
    );
    expect(r1.findings.find((f) => f.id === 'deal-name-reference')).toBeUndefined();
    const r2 = checkCreditMemoConsistency(
      baseDeal({ name: 'AC' }),
      data([memoSummary('something')]),
    );
    expect(r2.findings.find((f) => f.id === 'deal-name-reference')).toBeUndefined();
  });

  it('case-insensitive: lowercase name in memo text passes', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'acme working capital — borrower acme manufacturing, llc. underwriting. $4,500,000',
        ),
      ]),
    );
    expect(r.findings.find((f) => f.id === 'deal-name-reference')).toBeUndefined();
  });
});

describe('Phase 73 — client-name-reference finding', () => {
  it('fires when client name does not appear in the memo text', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital. Loan amount $4,500,000. Underwriting.',
        ),
      ]),
    );
    const finding = r.findings.find((f) => f.id === 'client-name-reference');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('needs-review');
    expect(finding!.structuredValue).toBe('Acme Manufacturing, LLC');
  });

  it('skips when client name is missing or too short', () => {
    const r = checkCreditMemoConsistency(
      baseDeal({ clientName: undefined }),
      data([memoSummary('something')]),
    );
    expect(r.findings.find((f) => f.id === 'client-name-reference')).toBeUndefined();
  });
});

describe('Phase 73 — stage-reference finding', () => {
  it('fires as informational when stage does not appear in memo text', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital. Borrower Acme Manufacturing, LLC. $4,500,000. A/R, inventory.',
        ),
      ]),
    );
    const finding = r.findings.find((f) => f.id === 'stage-reference');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('informational');
    expect(finding!.structuredValue).toBe('Underwriting');
  });

  it('skips when stage is missing or too short', () => {
    const r = checkCreditMemoConsistency(
      baseDeal({ stage: undefined }),
      data([memoSummary('something')]),
    );
    expect(r.findings.find((f) => f.id === 'stage-reference')).toBeUndefined();
  });
});

describe('Phase 73 — loan-amount-reference (informational, no in-range amount)', () => {
  it('fires when memo has no dollar amounts at all and deal.amount is set', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. A/R, inventory.',
        ),
      ]),
    );
    const finding = r.findings.find((f) => f.id === 'loan-amount-reference');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('informational');
    expect(finding!.structuredValue).toBe('$4,500,000');
    expect(finding!.memoValue).toBeUndefined();
  });

  it('fires when memo mentions only out-of-range amounts (e.g. a $50 fee in a $4.5M loan memo)', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. $50 wire fee. A/R, inventory.',
        ),
      ]),
    );
    const finding = r.findings.find((f) => f.id === 'loan-amount-reference');
    expect(finding).toBeDefined();
    expect(finding!.memoValue).toMatch(/1 amount mentioned/);
  });

  it('does NOT fire when memo mentions an in-range amount', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. Loan $4,500,000. A/R, inventory.',
        ),
      ]),
    );
    expect(r.findings.find((f) => f.id === 'loan-amount-reference')).toBeUndefined();
  });

  it('skips silently when deal.amount is undefined or non-positive', () => {
    const r1 = checkCreditMemoConsistency(
      baseDeal({ amount: undefined }),
      data([memoSummary('text')]),
    );
    expect(r1.findings.find((f) => f.id === 'loan-amount-reference')).toBeUndefined();
    const r2 = checkCreditMemoConsistency(
      baseDeal({ amount: 0 }),
      data([memoSummary('text')]),
    );
    expect(r2.findings.find((f) => f.id === 'loan-amount-reference')).toBeUndefined();
  });
});

describe('Phase 73 — loan-amount-mismatch (needs-review)', () => {
  it('fires when the closest in-range amount differs from deal.amount by > 5%', () => {
    // deal.amount = 4,500,000. Memo says $4,000,000 (delta ~11%, > 5%).
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. Loan $4,000,000. A/R, inventory.',
        ),
      ]),
    );
    const finding = r.findings.find((f) => f.id === 'loan-amount-mismatch');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('needs-review');
    expect(finding!.structuredValue).toBe('$4,500,000');
    expect(finding!.memoValue).toBe('$4,000,000');
  });

  it('does NOT fire when the closest in-range amount is within 5% of deal.amount', () => {
    // deal.amount = 4,500,000. Memo says $4,400,000 (delta ~2.2%).
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. Loan $4,400,000. A/R, inventory.',
        ),
      ]),
    );
    expect(r.findings.find((f) => f.id === 'loan-amount-mismatch')).toBeUndefined();
  });

  it('and loan-amount-reference are mutually exclusive', () => {
    // Memo with an out-of-range amount triggers `reference`; an
    // in-range amount triggers either `mismatch` or nothing.
    const rReference = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. $50 wire fee.',
        ),
      ]),
    );
    expect(
      rReference.findings.find((f) => f.id === 'loan-amount-reference'),
    ).toBeDefined();
    expect(
      rReference.findings.find((f) => f.id === 'loan-amount-mismatch'),
    ).toBeUndefined();
    const rMismatch = checkCreditMemoConsistency(
      baseDeal(),
      data([
        memoSummary(
          'Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. Loan $4,000,000.',
        ),
      ]),
    );
    expect(
      rMismatch.findings.find((f) => f.id === 'loan-amount-reference'),
    ).toBeUndefined();
    expect(
      rMismatch.findings.find((f) => f.id === 'loan-amount-mismatch'),
    ).toBeDefined();
  });
});

describe('Phase 73 — collateral-section-empty (informational)', () => {
  it('fires when a Collateral section has empty text but deal.collateralSummary has content', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data(
        [memoSummary('Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. $4,500,000.')],
        [section('Collateral', undefined)],
      ),
    );
    const finding = r.findings.find((f) => f.id === 'collateral-section-empty');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('informational');
    expect(finding!.structuredValue).toBe('A/R, inventory');
    expect(finding!.source).toBe('structured-deal');
  });

  it('skips when no Collateral section exists', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([memoSummary('Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. $4,500,000.')], []),
    );
    expect(r.findings.find((f) => f.id === 'collateral-section-empty')).toBeUndefined();
  });

  it('skips when the Collateral section has content', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data(
        [memoSummary('Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. $4,500,000.')],
        [section('Collateral', 'A/R, inventory')],
      ),
    );
    expect(r.findings.find((f) => f.id === 'collateral-section-empty')).toBeUndefined();
  });

  it('skips when deal.collateralSummary is missing', () => {
    const r = checkCreditMemoConsistency(
      baseDeal({ collateralSummary: undefined }),
      data([memoSummary('Acme Working Capital — borrower Acme Manufacturing, LLC. Underwriting. $4,500,000.')], [section('Collateral', undefined)]),
    );
    expect(r.findings.find((f) => f.id === 'collateral-section-empty')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Amount-extraction edge cases
// ---------------------------------------------------------------------------

describe('Phase 73 — extractDollarAmounts edge cases', () => {
  it('recognizes "$1,000,000" / "$4,500,000" / "$500,000.00"', () => {
    const amounts = extractDollarAmounts('Loan $4,500,000. Fee $500,000.00. Aux $1,000,000.');
    expect(amounts).toContain(4_500_000);
    expect(amounts).toContain(500_000);
    expect(amounts).toContain(1_000_000);
  });

  it('recognizes "$1.5M" / "$2MM" / "$500K"', () => {
    expect(extractDollarAmounts('Loan $1.5M.')).toContain(1_500_000);
    expect(extractDollarAmounts('Loan $2MM.')).toContain(2_000_000);
    expect(extractDollarAmounts('Loan $500K.')).toContain(500_000);
  });

  it('recognizes "1.5 million" / "2 million" / "500 thousand"', () => {
    expect(extractDollarAmounts('approximately 1.5 million dollars')).toContain(1_500_000);
    expect(extractDollarAmounts('about 2 million')).toContain(2_000_000);
    expect(extractDollarAmounts('roughly 500 thousand')).toContain(500_000);
  });

  it('recognizes small dollar amounts like "$50"', () => {
    expect(extractDollarAmounts('A $50 fee applies.')).toContain(50);
  });

  it('does NOT match bare digit groups (no $, no suffix, no unit word)', () => {
    // Plain numbers without context — order of magnitude collisions
    // (phone numbers, ids, etc.) would be too noisy.
    const amounts = extractDollarAmounts('Section 4500000 — Article 12. Phone 5551234.');
    expect(amounts).toEqual([]);
  });

  it('recognizes "500K" / "5M" suffix-only (no $ prefix) when the suffix is unambiguous', () => {
    expect(extractDollarAmounts('Borrower needs roughly 500K.')).toContain(500_000);
    expect(extractDollarAmounts('Limit set to 5M.')).toContain(5_000_000);
  });
});

// ---------------------------------------------------------------------------
// 4. Module hygiene
// ---------------------------------------------------------------------------

describe('Phase 73 — module hygiene', () => {
  it('does NOT import any SDK service or @microsoft/power-apps', () => {
    const src = readFileSync(
      resolve(__dirname, 'checkCreditMemoConsistency.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*generated\/services/);
    expect(src).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
    // Type-only imports from deals/ are permitted (DealDetail and
    // CreditMemoData live there) — but no runtime import / no
    // role-side function call.
    expect(src).not.toMatch(/from\s+['"][^'"]*\/admin\//);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/banker\//);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/manager\//);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/team\//);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/executive\//);
  });

  it('does NOT contain "approved", "rejected", "noncompliant", "failed", "invalid", "AI", "hallucinated", or "guaranteed" in source', () => {
    const src = readFileSync(
      resolve(__dirname, 'checkCreditMemoConsistency.ts'),
      'utf8',
    );
    // Strip comments to allow the disclaimer-style mentions in the
    // header (e.g. "NO 'approved' language").
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(codeOnly).not.toMatch(/\bapproved\b/i);
    expect(codeOnly).not.toMatch(/\brejected\b/i);
    expect(codeOnly).not.toMatch(/\bnoncompliant\b/i);
    expect(codeOnly).not.toMatch(/\bfailed\b/i);
    expect(codeOnly).not.toMatch(/\binvalid\b/i);
    expect(codeOnly).not.toMatch(/\bhallucinated\b/i);
    expect(codeOnly).not.toMatch(/\bguaranteed\b/i);
    // "AI" is permitted only inside a longer word like "main" — the
    // \b boundary protects against substring matches.
    expect(codeOnly).not.toMatch(/\bAI\b/);
  });

  it('every finding carries confidence: deterministic', () => {
    const r = checkCreditMemoConsistency(
      baseDeal(),
      data([memoSummary('no relevant text at all')]),
    );
    for (const f of r.findings) {
      expect(f.confidence).toBe('deterministic');
    }
  });
});
