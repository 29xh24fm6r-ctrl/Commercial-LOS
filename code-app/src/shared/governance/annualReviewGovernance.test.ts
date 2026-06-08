import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { deriveBorrowerSoundnessAssessment } from '../../shared/annualReview/deriveBorrowerSoundnessAssessment';
import { deriveAnnualReviewCollectionPlan } from '../../shared/annualReview/deriveAnnualReviewCollectionPlan';
import { createDisabledAnnualReviewPersistenceAdapter } from '../../portfolioAnnualReview/annualReviewPersistenceAdapter';
import type { AnnualReviewCycle, AnnualReviewLoanSnapshot } from '../../shared/annualReview/annualReviewTypes';

/**
 * Phase 141A — Annual Review governance.
 *
 * Pins the safety contract: no fake data, no borrower outreach, no direct
 * fetch/Dataverse in components, no permission widening, no write affordance,
 * disabled adapter writes nothing, and the engines fail closed (missing →
 * insufficient information; past due → escalation; stale → blocker).
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DIRS = ['src/shared/annualReview', 'src/portfolioAnnualReview'];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

interface SourceFile {
  rel: string;
  isComponent: boolean;
  code: string;
}

function collect(): SourceFile[] {
  const out: SourceFile[] = [];
  for (const dir of DIRS) {
    const abs = resolve(REPO_ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      const file = resolve(abs, entry);
      if (!statSync(file).isFile()) continue;
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
      out.push({
        rel: relative(REPO_ROOT, file).split(sep).join('/'),
        isComponent: entry.endsWith('.tsx'),
        code: stripComments(readFileSync(file, 'utf8')),
      });
    }
  }
  return out;
}

const FILES = collect();

const CYCLE: AnnualReviewCycle = {
  cycleId: 'c1',
  reviewYear: 2026,
  asOfDate: '2026-06-08',
  cycleEndDate: '2026-12-31',
  status: 'in_progress',
};
function loan(over: Partial<AnnualReviewLoanSnapshot> = {}): AnnualReviewLoanSnapshot {
  return { loanStatus: 'active', loanNumber: 'LN1', borrowerName: 'Synthetic Obligor', riskRating: '4', annualReviewDueDate: '2026-01-01', ...over };
}

describe('Phase 141A — annual review files exist', () => {
  const REQUIRED = [
    'src/shared/annualReview/annualReviewTypes.ts',
    'src/shared/annualReview/annualReviewRequirementCatalog.ts',
    'src/shared/annualReview/deriveAnnualReviewCollectionPlan.ts',
    'src/shared/annualReview/deriveAnnualReviewReadiness.ts',
    'src/shared/annualReview/deriveBorrowerSoundnessAssessment.ts',
    'src/shared/annualReview/deriveBorrowerFinancialRequestPackage.ts',
    'src/shared/annualReview/annualReviewTaskEngine.ts',
    'src/portfolioAnnualReview/AnnualPortfolioReviewCommandCenter.tsx',
    'src/portfolioAnnualReview/BorrowerFinancialRequestPreview.tsx',
    'src/portfolioAnnualReview/AnnualReviewTaskBoard.tsx',
    'src/portfolioAnnualReview/annualReviewPersistenceAdapter.ts',
  ];
  for (const rel of REQUIRED) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 141A — no fetch / Dataverse / outreach in source', () => {
  it('discovers source files', () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it('no React component calls fetch / XMLHttpRequest or imports Dataverse SDK', () => {
    const hits = FILES.filter(
      (f) =>
        f.isComponent &&
        (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) ||
          /@microsoft\/power-apps/.test(f.code) ||
          /Cr664_\w+Service/.test(f.code)),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no borrower outreach: no email/SMS send primitives', () => {
    const hits = FILES.filter((f) =>
      /\b(sendEmail|SendEmailV2|sendSms|twilio|mailto:)\b/i.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no write/delete verbs in source', () => {
    const hits = FILES.filter((f) =>
      /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 141A — no fake borrower / dollar data; no route widening', () => {
  it('no dollar literals or fake borrower names', () => {
    const NAMES = [/\bAcme\b/i, /\bJohn\s+Smith\b/i, /\bContoso\b/i, /\bFabrikam\b/i];
    const hits: string[] = [];
    for (const f of FILES) {
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      for (const re of NAMES) if (re.test(f.code)) hits.push(`${f.rel} ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no annual-review route (no permission widening)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/annual-review|AnnualPortfolioReview/i);
  });
});

describe('Phase 141A — disabled adapter writes nothing', () => {
  it('every adapter operation fails closed with not_configured', async () => {
    const a = createDisabledAnnualReviewPersistenceAdapter();
    expect(a.enabled).toBe(false);
    const save = await a.saveAnnualReviewPackage({} as never);
    const complete = await a.completeReview('x');
    expect(save.ok).toBe(false);
    expect(save.errorCode).toBe('not_configured');
    expect(complete.ok).toBe(false);
  });
});

describe('Phase 141A — engines fail closed', () => {
  it('missing financials → insufficient_information (never inferred sound)', () => {
    expect(deriveBorrowerSoundnessAssessment({ loan: loan() }).status).toBe('insufficient_information');
  });

  it('past-due financials produce an escalation', () => {
    const r = deriveAnnualReviewCollectionPlan({ loans: [loan()], cycle: CYCLE, asOfDate: '2026-06-08' });
    expect(r.escalations.length).toBeGreaterThan(0);
  });

  it('stale accepted financials block readiness (appear in stale + blockers)', () => {
    const r = deriveAnnualReviewCollectionPlan({
      loans: [
        loan({
          annualReviewDueDate: '2026-09-30',
          submittedDocuments: [
            { documentType: 'annual_financial_statements', accepted: true, status: 'accepted', receivedDate: '2024-01-01', reviewedDate: '2024-01-01', effectiveDate: '2024-01-01' },
            { documentType: 'tax_returns', accepted: true, status: 'accepted', receivedDate: '2026-05-01', reviewedDate: '2026-05-01', effectiveDate: '2026-05-01' },
          ],
        }),
      ],
      cycle: CYCLE,
      asOfDate: '2026-06-08',
    });
    expect(r.stale.length).toBeGreaterThan(0);
    expect(r.blockers.some((b) => /stale/i.test(b))).toBe(true);
  });
});
