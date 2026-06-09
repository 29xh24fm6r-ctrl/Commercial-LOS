import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { deriveAnnualReviewFinancialReadiness } from '../../annualReview/deriveAnnualReviewFinancialReadiness';
import { testAnnualReviewCovenants } from '../../annualReview/testAnnualReviewCovenants';
import { deriveAnnualReviewFinancialSpreadSnapshot } from '../../annualReview/deriveAnnualReviewFinancialSpreadSnapshot';
import { resolveAnnualReviewCovenantDefinitions } from '../../annualReview/resolveAnnualReviewCovenantDefinitions';

/**
 * Phase 141O — annual review financial / covenant governance.
 *
 * Pins the evidence-backed safety contract: no fabricated metrics, no final
 * credit recommendation, no automatic waiver / covenant override, no outreach,
 * no upload-link generation, no CRM/Dataverse writes, no fetch in components,
 * excluded facts stay excluded, ambiguous periods block, missing definitions are
 * unknown.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/annualReview/annualReviewFinancialTypes.ts',
  'src/annualReview/annualReviewFinancialFacts.ts',
  'src/annualReview/deriveAnnualReviewFinancialReadiness.ts',
  'src/annualReview/deriveAnnualReviewFinancialSpreadSnapshot.ts',
  'src/annualReview/resolveAnnualReviewCovenantDefinitions.ts',
  'src/annualReview/testAnnualReviewCovenants.ts',
  'src/annualReview/deriveAnnualReviewFinancialAnalysisSnapshot.ts',
  'src/annualReview/buildAnnualReviewFinancialMemoSections.ts',
  'src/annualReview/AnnualReviewFinancialCovenantPanel.tsx',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 141O — files exist', () => {
  for (const rel of ['docs/PHASE_141O_ANNUAL_REVIEW_FINANCIAL_SPREADING_AND_COVENANTS.md', ...PROD_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 141O — no outreach / writes / waiver / override in source', () => {
  it('no email / SMS / Twilio / mailto / upload-link generation', () => {
    const hits = SOURCES.filter((f) => /\b(sendEmail|sendSms|twilio|generateUploadLink|createUploadLink)\b|mailto:/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no automatic covenant waiver or covenant override write', () => {
    const hits = SOURCES.filter((f) => /\b(applyWaiver|grantWaiver|autoWaive|overrideCovenant|covenantOverride)\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no final credit approval / decline recommendation', () => {
    const hits = SOURCES.filter((f) => /\b(approve\s+credit|recommend\s+approval|recommend\s+decline|credit\s+approval\s+recommendation)\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / Dataverse SDK in React components', () => {
    const hits = SOURCES.filter((f) => f.isComponent && (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code)));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('the panel has no approve / waive / override / send button', () => {
    const panel = SOURCES.find((f) => f.isComponent)!;
    expect(panel.code).not.toMatch(/<button/i);
    expect(panel.code).not.toMatch(/onClick/);
  });

  it('no sample emails / phones / dollar literals', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no financial/covenant panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/AnnualReviewFinancialCovenantPanel/);
  });
});

describe('Phase 141O — behavioral: evidence-backed, fail-closed', () => {
  const period = { periodId: 'P1', fiscalYear: 2025, periodType: 'annual' as const, sourceDocumentIds: ['D1'], confidence: 'high' as const, periodReviewRequired: false, warnings: [], blockers: [] };
  const doc = { requirementId: 'R1', documentType: 'annual_financial_statements' as const, label: 'AFS', fiscalYear: 2025, required: true, received: true, accepted: true, sourceDocumentId: 'D1' };
  const baseFact = { factId: 'F1', canonicalType: 'is', statementType: 'income_statement' as const, metricKey: 'revenue', periodId: 'P1', value: 1000, unit: 'currency', sourceDocumentId: 'D1', confidence: 'high' as const, status: 'accepted' as const, isSuperseded: false, systemInvalidated: false, reviewRequired: false };

  it('superseded / system-invalidated / rejected facts are excluded from readiness', () => {
    for (const bad of [{ isSuperseded: true }, { systemInvalidated: true }, { status: 'rejected' as const }]) {
      const r = deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents: [doc], facts: [{ ...baseFact, ...bad }], periods: [period] });
      expect(r.readinessStatus).toBe('blocked');
    }
  });

  it('ambiguous financial periods block readiness', () => {
    const r = deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents: [doc], facts: [{ ...baseFact, statementType: 'balance_sheet' }], periods: [{ ...period, periodReviewRequired: true }] });
    expect(r.readinessStatus).toBe('blocked');
  });

  it('missing covenant definitions produce unknown_no_definition', () => {
    const readiness = deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents: [doc], facts: [baseFact], periods: [period] });
    const spread = deriveAnnualReviewFinancialSpreadSnapshot({ annualReviewId: 'AR1', readiness, facts: [baseFact], periods: [period] });
    const snap = testAnnualReviewCovenants({ definitions: resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: [{ covenantId: 'C', covenantType: 'dscr', active: true }] }), spread, readiness });
    expect(snap.results[0].status).toBe('unknown_no_definition');
  });
});
