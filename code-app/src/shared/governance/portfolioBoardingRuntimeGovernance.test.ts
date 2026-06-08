import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import { resolvePortfolioBoardingPersistenceAdapter } from '../../portfolioBoarding/resolvePortfolioLoanBoardingAdapter';
import { derivePortfolioBoardingExportModel } from '../../portfolioBoarding/PortfolioBoardingPackageExportModel';
import { loadPortfolioBoardedLoanCommandRows } from '../../portfolioBoarding/loadPortfolioBoardedLoansForWorkspace';
import { createEmptyPortfolioLoanBoardingPackage } from '../../shared/portfolioBoarding/portfolioLoanBoardingTypes';

/**
 * Phase 140M-P — Portfolio boarding RUNTIME governance.
 *
 * Pins that the operator UI is adapter-gated and flag-gated: no React component
 * calls Dataverse or fetch directly; the adapter exposes no delete; feature
 * flags default safe; persistence stays disabled unless the flag is enabled;
 * command centers gain no fake rows; and no fake borrower/loan/dollar data is
 * baked into the source.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DIR = resolve(REPO_ROOT, 'src/portfolioBoarding');

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
  for (const entry of readdirSync(DIR)) {
    const abs = resolve(DIR, entry);
    if (!statSync(abs).isFile()) continue;
    if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
    out.push({
      rel: relative(REPO_ROOT, abs).split(sep).join('/'),
      isComponent: entry.endsWith('.tsx'),
      code: stripComments(readFileSync(abs, 'utf8')),
    });
  }
  return out;
}

const FILES = collect();

describe('Phase 140M-P — no direct Dataverse / fetch in React components', () => {
  it('discovers the portfolioBoarding source files', () => {
    expect(FILES.length).toBeGreaterThan(10);
    expect(FILES.some((f) => f.isComponent)).toBe(true);
  });

  it('no React component calls fetch / XMLHttpRequest', () => {
    const hits = FILES.filter((f) => f.isComponent && /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no React component imports the Dataverse SDK or a generated service', () => {
    const hits = FILES.filter(
      (f) =>
        f.isComponent &&
        (/@microsoft\/power-apps/.test(f.code) || /Cr664_\w+Service/.test(f.code)),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 140M-P — no delete / destructive write path', () => {
  it('no source file references a delete operation', () => {
    const hits = FILES.filter((f) =>
      /\b(deleteRecord|deleteBoardedLoan)\b|method:\s*'DELETE'/.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 140M-P — no fake borrower / loan / dollar data in source', () => {
  it('no dollar-amount literals', () => {
    const hits = FILES.filter((f) => /\$\s*\d/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no common fake borrower / company placeholder names', () => {
    const NAMES = [/\bAcme\b/i, /\bJohn\s+Smith\b/i, /\bContoso\b/i, /\bFabrikam\b/i];
    const hits: string[] = [];
    for (const f of FILES) {
      for (const re of NAMES) if (re.test(f.code)) hits.push(`${f.rel} ${re}`);
    }
    expect(hits).toEqual([]);
  });
});

describe('Phase 140M-P — feature flags default safe + persistence disabled by default', () => {
  it('every flag default is false', () => {
    for (const v of Object.values(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS)) {
      expect(v).toBe(false);
    }
  });

  it('the resolved adapter is disabled with no flags/transport', () => {
    expect(resolvePortfolioBoardingPersistenceAdapter().enabled).toBe(false);
  });
});

describe('Phase 140M-P — command centers gain no boarded rows unless flag on + authorized', () => {
  it('flag off → no rows; flag on + no packages → no rows', () => {
    expect(
      loadPortfolioBoardedLoanCommandRows({
        flags: { PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: false },
        authorizedPackages: [createEmptyPortfolioLoanBoardingPackage()],
      }),
    ).toEqual([]);
    expect(
      loadPortfolioBoardedLoanCommandRows({
        flags: { PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: true },
        authorizedPackages: [],
      }),
    ).toEqual([]);
  });
});

describe('Phase 140M-P — FDIC package export discloses missing/stale/exception items', () => {
  it('the export model exposes disclosure arrays and a no-hide statement', () => {
    const model = derivePortfolioBoardingExportModel(createEmptyPortfolioLoanBoardingPackage());
    expect(model.disclosures).toHaveProperty('missing');
    expect(model.disclosures).toHaveProperty('stale');
    expect(model.disclosures).toHaveProperty('exceptions');
    expect(model.disclosureStatement).toMatch(/not hidden/i);
    // Fail-closed: an empty package is never FDIC ready.
    expect(model.readiness.fdicReady).toBe(false);
  });
});
