import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { pipeline } from '../../annualReview/packageTestFixtures';
import { createDisabledAnnualReviewPackageExportAdapter } from '../../annualReview/annualReviewPackageExportAdapter';

/**
 * Phase 141P — annual review package governance.
 *
 * Pins the draft-only safety contract: no final credit recommendation, no
 * covenant waiver, no approve/submit/file/send/export-final STATE, no
 * PDF/docx/file generation, no SharePoint/OneDrive/Graph, no outreach, no
 * upload-link generation, no CRM/Dataverse writes, no fetch in components, no
 * fabricated metrics / fake evidence, and evidence-backed sections.
 *
 * NOTE: the package workflow deliberately *names* the blocked live actions
 * (approve_credit, submit_package, …, waive_covenant) as BLOCKED actions — those
 * are the safety surface, so the forbidden-state scans target the -ed status
 * forms and waiver-execution APIs, never the blocked-action codes/labels.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/annualReview/annualReviewPackageTypes.ts',
  'src/annualReview/deriveAnnualReviewPackageReadiness.ts',
  'src/annualReview/buildAnnualReviewEvidenceIndex.ts',
  'src/annualReview/buildAnnualReviewMemoPackage.ts',
  'src/annualReview/buildAnnualReviewBoardPackage.ts',
  'src/annualReview/buildAnnualReviewFdicPackage.ts',
  'src/annualReview/AnnualReviewPackagePreviewPanel.tsx',
  'src/annualReview/annualReviewPackageExportAdapter.ts',
  'src/annualReview/deriveAnnualReviewPackageWorkflow.ts',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 141P — files exist', () => {
  for (const rel of ['docs/PHASE_141P_ANNUAL_REVIEW_MEMO_BOARD_FDIC_PACKAGES.md', ...PROD_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 141P — no generation / external / outreach / write in source', () => {
  it('no PDF / docx / file generation', () => {
    const hits = SOURCES.filter((f) => /\b(jsPDF|pdfkit|pdfmake|generatePdf|createPdf|\bdocx\b|writeFileSync|fs\.writeFile|saveAs)\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no SharePoint / OneDrive / Graph calls', () => {
    const hits = SOURCES.filter((f) => /sharepoint|onedrive|graph\.microsoft|graphClient/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no email / SMS / Twilio / mailto / upload-link generation', () => {
    const hits = SOURCES.filter((f) => /\b(sendEmail|sendSms|twilio|generateUploadLink|createUploadLink)\b|mailto:/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no covenant-waiver execution', () => {
    const hits = SOURCES.filter((f) => /\b(applyWaiver|grantWaiver|autoWaive|executeWaiver)\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no final approve / submit / file / export-final / sent STATUS value', () => {
    const hits = SOURCES.filter((f) => /['"](approved|submitted|filed|exported_final|sent)['"]/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no final credit approval / decline recommendation (recommendation language)', () => {
    // The workflow legitimately names "Approve credit" as a BLOCKED action; the
    // ban here targets recommendation language, not the blocked-action label.
    const hits = SOURCES.filter((f) => /recommend(s|ed)?\s+(approval|decline|approving|declining)|credit\s+recommendation\s*[:=]\s*['"]?(approve|decline)/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / Dataverse SDK in React components', () => {
    const hits = SOURCES.filter((f) => f.isComponent && (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code)));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('the panel has no action button', () => {
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

  it('App.tsx registers no package preview panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/AnnualReviewPackagePreviewPanel/);
  });
});

describe('Phase 141P — behavioral: draft-only, evidence-backed, missing stays missing', () => {
  it('memo / board / FDIC carry no final credit recommendation', () => {
    const p = pipeline();
    expect(p.memo.finalCreditRecommendation).toBeNull();
    expect(p.board.finalCreditRecommendation).toBeNull();
    expect(p.memo.auditSummary.containsFinalDecision).toBe(false);
    expect(p.fdic.auditSummary.containsFinalDecision).toBe(false);
  });

  it('missing data stays missing (blocks the packages)', () => {
    const p = pipeline({ facts: [] });
    expect(p.memo.status).toBe('blocked_missing_financials');
    expect(p.board.status).toBe('blocked_missing_financials');
  });

  it('the financial memo section is evidence-backed', () => {
    const fin = pipeline().memo.sections.find((s) => s.key === 'financial_performance')!;
    expect(fin.evidenceFactIds.length).toBeGreaterThan(0);
  });

  it('the export adapter is disabled and exportPackage is always blocked', () => {
    const a = createDisabledAnnualReviewPackageExportAdapter();
    expect(a.enabled).toBe(false);
    expect(a.exportPackage({ packageType: 'annual_review_credit_memo', status: 'review_ready', sectionCount: 10, evidenceCount: 5 }).blocked).toBe(true);
  });
});
