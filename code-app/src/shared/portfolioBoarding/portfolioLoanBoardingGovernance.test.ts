import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { fieldsRequiredForFDICReview } from './portfolioLoanBoardingCatalog';
import { documentsRequiredForFDICReview } from './portfolioLoanDocumentCatalog';

/**
 * Phase 140B-H — Portfolio loan boarding governance.
 *
 * Pins that the boarding system of record is a PURE shared module:
 *   - the canonical files exist (including new Phase 140B-H files);
 *   - required FDIC fields and documents are represented;
 *   - no React component, fetch, Dataverse write, or connector code exists;
 *   - no fake borrower names, loan names, or dollar values are baked into the
 *     shared source;
 *   - no command center write affordance in the shared domain.
 *
 * Test fixtures (which legitimately carry synthetic placeholder values) live
 * only in *.test.ts files and are excluded from the source scan below.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DIR = resolve(__dirname);

const REQUIRED_FILES = [
  'portfolioLoanBoardingTypes.ts',
  'portfolioLoanBoardingCatalog.ts',
  'portfolioLoanDocumentCatalog.ts',
  'derivePortfolioLoanBoardingCompleteness.ts',
  'portfolioLoanBoardingSnapshot.ts',
] as const;

const PHASE_140BH_FILES = [
  'portfolioLoanDocumentClassifier.ts',
  'portfolioLoanEvidenceBinder.ts',
  'portfolioLoanDocumentReadiness.ts',
  'fdicExaminerPackage.ts',
] as const;

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function sourceFiles(): { rel: string; code: string }[] {
  const out: { rel: string; code: string }[] = [];
  for (const entry of readdirSync(DIR)) {
    const abs = resolve(DIR, entry);
    if (!statSync(abs).isFile()) continue;
    if (!entry.endsWith('.ts')) continue;
    if (entry.endsWith('.test.ts')) continue;
    out.push({
      rel: relative(REPO_ROOT, abs).split(sep).join('/'),
      code: stripComments(readFileSync(abs, 'utf8')),
    });
  }
  return out;
}

describe('Phase 140B — canonical files exist', () => {
  for (const f of REQUIRED_FILES) {
    it(`${f} exists on disk`, () => {
      expect(existsSync(resolve(DIR, f))).toBe(true);
    });
  }

  it('no React component (.tsx) exists in the boarding module', () => {
    const tsx = readdirSync(DIR).filter((e) => e.endsWith('.tsx'));
    expect(tsx).toEqual([]);
  });
});

describe('Phase 140B-H — new Phase 140B-H files exist', () => {
  for (const f of PHASE_140BH_FILES) {
    it(`${f} exists on disk`, () => {
      expect(existsSync(resolve(DIR, f))).toBe(true);
    });
  }
});

describe('Phase 140B — required FDIC coverage is represented', () => {
  it('represents required FDIC fields', () => {
    expect(fieldsRequiredForFDICReview().length).toBeGreaterThan(0);
  });
  it('represents required FDIC documents', () => {
    expect(documentsRequiredForFDICReview().length).toBeGreaterThan(0);
  });
});

describe('Phase 140B — the shared module is pure (no React / fetch / Dataverse / connector)', () => {
  const FORBIDDEN: readonly { id: string; pattern: RegExp }[] = [
    { id: 'react', pattern: /\breact\b/i },
    { id: 'jsx-runtime', pattern: /useState|useEffect|useMemo|jsx-runtime/ },
    { id: 'network', pattern: /\b(fetch|XMLHttpRequest)\s*\(/ },
    {
      id: 'dataverse-write',
      pattern: /\b(createRecord|updateRecord|deleteRecord|saveRecord|webAPI)\b/i,
    },
    { id: 'dataset', pattern: /\bIDataset\b|openDatasetItem/ },
    { id: 'connector-copilot', pattern: /\bcopilot\b/i },
    { id: 'graph-office365', pattern: /\b(Graph|Office365|SendEmailV2)\b/ },
  ];

  const files = sourceFiles();

  it('discovers source files (original five plus new additions)', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  for (const rule of FORBIDDEN) {
    it(`[${rule.id}] no source file matches`, () => {
      const hits = files.filter((f) => rule.pattern.test(f.code)).map((f) => f.rel);
      expect(hits, `rule [${rule.id}] matched: ${hits.join(', ')}`).toEqual([]);
    });
  }
});

describe('Phase 140B — no fake borrower / loan / dollar data in the shared source', () => {
  const files = sourceFiles();

  it('contains no dollar-amount literals', () => {
    const hits = files.filter((f) => /\$\s*\d/.test(f.code)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it('contains no common fake borrower / company placeholder names', () => {
    const NAME_BLOCKLIST = [
      /\bAcme\b/i,
      /\bJohn Doe\b/i,
      /\bJane Doe\b/i,
      /\bContoso\b/i,
      /\bFabrikam\b/i,
      /\bWidget(s)?\s+(Inc|LLC|Co)\b/i,
      /\bSmith\s+(Inc|LLC|Enterprises)\b/i,
    ];
    const hits: string[] = [];
    for (const f of files) {
      for (const re of NAME_BLOCKLIST) {
        if (re.test(f.code)) hits.push(`${f.rel} — ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('Phase 140B-H — no React component exists in shared portfolioBoarding domain', () => {
  it('no .tsx files in shared/portfolioBoarding', () => {
    const tsx = readdirSync(DIR).filter((e) => e.endsWith('.tsx'));
    expect(tsx).toEqual([]);
  });
});

describe('Phase 140B-H — no fetch/XMLHttpRequest/Graph/Office365/SendEmailV2/connector code', () => {
  const files = sourceFiles();

  it('no fetch or XMLHttpRequest calls', () => {
    const hits = files.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it('no Graph/Office365/SendEmailV2 references', () => {
    const hits = files.filter((f) => /\b(Graph|Office365|SendEmailV2)\b/.test(f.code)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it('no connector or copilot references', () => {
    const hits = files.filter((f) => /\b(connector|copilot)\b/i.test(f.code)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });
});

describe('Phase 140B-H — no sample borrower/dollar data in shared source', () => {
  const files = sourceFiles();

  it('no sample dollar amounts', () => {
    const hits = files.filter((f) => /\$\s*\d{1,3}(,\d{3})*(\.\d+)?/.test(f.code)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it('no sample borrower names', () => {
    const NAMES = [/\bJohn\s+Smith\b/i, /\bTest\s+Borrower\b/i, /\bSample\s+Loan\b/i];
    const hits: string[] = [];
    for (const f of files) {
      for (const re of NAMES) {
        if (re.test(f.code)) hits.push(`${f.rel} — ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('Phase 140B-H — no command center write affordance in shared domain', () => {
  const files = sourceFiles();

  it('no createRecord / updateRecord / deleteRecord calls', () => {
    const hits = files
      .filter((f) => /\b(createRecord|updateRecord|deleteRecord|saveRecord)\b/.test(f.code))
      .map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it('no webAPI calls', () => {
    const hits = files.filter((f) => /\bwebAPI\b/.test(f.code)).map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it('no mutation verbs (POST/PUT/PATCH/DELETE) in source', () => {
    const hits = files
      .filter((f) => /\b(POST|PUT|PATCH|DELETE)\b/.test(f.code))
      .map((f) => f.rel);
    expect(hits).toEqual([]);
  });
});
