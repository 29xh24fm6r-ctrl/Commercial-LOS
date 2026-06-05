import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { fieldsRequiredForFDICReview } from './portfolioLoanBoardingCatalog';
import { documentsRequiredForFDICReview } from './portfolioLoanDocumentCatalog';

/**
 * Phase 140B — Portfolio loan boarding governance.
 *
 * Pins that the boarding system of record is a PURE shared module:
 *   - the five canonical files exist;
 *   - required FDIC fields and documents are represented;
 *   - no React component, fetch, Dataverse write, or connector code exists;
 *   - no fake borrower names, loan names, or dollar values are baked into the
 *     shared source.
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
  ];

  const files = sourceFiles();

  it('discovers the five source files', () => {
    expect(files.length).toBe(5);
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
