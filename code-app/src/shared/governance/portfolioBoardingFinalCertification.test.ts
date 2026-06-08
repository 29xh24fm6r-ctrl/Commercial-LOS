import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { resolvePortfolioBoardingFeatureFlags } from '../../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import { resolvePortfolioLoanBoardingRuntimeAdapter } from '../../portfolioBoarding/resolvePortfolioLoanBoardingPersistenceAdapter';
import {
  EXPECTED_BOARDING_SCHEMA,
  derivePortfolioBoardingRuntimeSchemaGate,
} from '../../portfolioBoarding/portfolioBoardingRuntimeSchemaGate';
import { LIVE_TRANSPORT_ALLOWED_ENTITIES } from '../../portfolioBoarding/portfolioLoanBoardingLiveDataverseTransport';

/**
 * Phase 140Q — Portfolio Boarding FINAL certification.
 *
 * The release gate: the write path is disabled by default, scoped to only the
 * boarded-loan schema, never deletes, never writes outside the portfolio
 * boarding tables, requires every flag + the schema gate + authorization, and
 * leaks no test fixtures into production source.
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

function productionSources(): SourceFile[] {
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

const FILES = productionSources();
const OK_VERIFIED = {
  tablesFound: EXPECTED_BOARDING_SCHEMA.tables,
  columnsFound: EXPECTED_BOARDING_SCHEMA.columns,
  requiredRelationshipsFound: EXPECTED_BOARDING_SCHEMA.requiredRelationships,
  optionalRelationshipsFound: EXPECTED_BOARDING_SCHEMA.optionalRelationships,
  conflicts: 0,
};

// ---------------------------------------------------------------------------
// Disabled by default + full gate required
// ---------------------------------------------------------------------------

describe('Phase 140Q — runtime write path is disabled by default', () => {
  it('the runtime resolver returns a disabled adapter with no client/flags', () => {
    const r = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: resolvePortfolioBoardingFeatureFlags(),
      verified: OK_VERIFIED,
      isAuthorizedOperator: true,
    });
    expect(r.live).toBe(false);
    expect(r.adapter.enabled).toBe(false);
  });

  it('feature flags all default off', () => {
    const f = resolvePortfolioBoardingFeatureFlags();
    expect(f.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(f.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(f.PORTFOLIO_BOARDING_DOCUMENT_METADATA_ENABLED).toBe(false);
    expect(f.PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED).toBe(false);
    expect(f.PORTFOLIO_BOARDING_FDIC_PACKAGE_ENABLED).toBe(false);
  });

  it('create requires schema-ready + live flag + route flag + adapter + authorization', () => {
    const flagsOn = { PORTFOLIO_BOARDING_ROUTE_ENABLED: true, PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: true };
    const base = { verified: OK_VERIFIED, flags: flagsOn, adapterEnabled: true, isAuthorizedOperator: true };
    expect(derivePortfolioBoardingRuntimeSchemaGate(base).canCreate).toBe(true);
    expect(derivePortfolioBoardingRuntimeSchemaGate({ ...base, isAuthorizedOperator: false }).canCreate).toBe(false);
    expect(derivePortfolioBoardingRuntimeSchemaGate({ ...base, adapterEnabled: false }).canCreate).toBe(false);
    expect(
      derivePortfolioBoardingRuntimeSchemaGate({ ...base, verified: { ...OK_VERIFIED, tablesFound: 0 } }).canCreate,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schema scope + no destructive / cross-table writes
// ---------------------------------------------------------------------------

describe('Phase 140Q — the write path is scoped and non-destructive', () => {
  it('the transport only ever touches cr664_portfolioboardedloan* entities', () => {
    expect(LIVE_TRANSPORT_ALLOWED_ENTITIES.length).toBeGreaterThan(0);
    for (const e of LIVE_TRANSPORT_ALLOWED_ENTITIES) {
      expect(e.startsWith('cr664_portfolioboardedloan')).toBe(true);
    }
  });

  it('no production source contains a delete or destructive verb', () => {
    const hits = FILES.filter((f) =>
      /\b(deleteRecord|deleteBoardedLoan)\b|method:\s*'DELETE'|\bdelete\s*\(/.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no production source writes to loandeal / client / team / banker / systemuser tables', () => {
    // A write would mean a create/update call against one of those entity sets.
    const FORBIDDEN_WRITE = /\b(create|update)\s*\(\s*['"`]?(cr664_loandeal|cr664_clientrelationship|cr664_banker|cr664_team|systemuser)/;
    const hits = FILES.filter((f) => FORBIDDEN_WRITE.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No direct fetch/SDK in components; no fake data; no test-fixture leakage
// ---------------------------------------------------------------------------

describe('Phase 140Q — no direct Dataverse/fetch in components, no fake/test data in source', () => {
  it('no React component calls fetch or imports the Dataverse SDK / generated services', () => {
    const hits = FILES.filter(
      (f) =>
        f.isComponent &&
        (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) ||
          /@microsoft\/power-apps/.test(f.code) ||
          /Cr664_\w+Service/.test(f.code)),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no production source contains dollar literals or fake borrower names', () => {
    const NAMES = [/\bAcme\b/i, /\bJohn\s+Smith\b/i, /\bContoso\b/i, /\bFabrikam\b/i];
    const hits: string[] = [];
    for (const f of FILES) {
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      for (const re of NAMES) if (re.test(f.code)) hits.push(`${f.rel} ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it('no production source leaks the test-only identifiers', () => {
    const hits = FILES.filter((f) =>
      /TEST_LOAN_NUMBER_001|TEST_BOARDING_PACKAGE_ID/.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Doc + no route registration
// ---------------------------------------------------------------------------

describe('Phase 140Q — certification doc exists and the route stays unregistered', () => {
  it('the certification doc exists', () => {
    expect(
      existsSync(
        resolve(
          REPO_ROOT,
          'docs/PHASE_140Q_PORTFOLIO_BOARDING_FINAL_CERTIFICATION_AND_RELEASE_READINESS.md',
        ),
      ),
    ).toBe(true);
  });

  it('App.tsx still registers no portfolio-boarding route (no permission widening)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/portfolio-boarding/i);
    expect(app).not.toMatch(/PortfolioLoanBoardingWorkspace/);
  });
});
