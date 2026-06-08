import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import {
  PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS,
  resolvePortfolioBoardingFeatureFlags,
} from '../../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import { resolvePortfolioBoardingPersistenceAdapter } from '../../portfolioBoarding/resolvePortfolioLoanBoardingAdapter';
import { ALLOWED_BOARDING_ENTITIES } from '../../portfolioBoarding/portfolioLoanBoardingLivePersistence';

/**
 * Phase 140L — Live persistence governance.
 *
 * The first real app-runtime write adapter must be: disabled by default,
 * scoped to ONLY the boarded-loan schema, free of any delete/destructive path,
 * free of direct network/SDK/React code (it uses an injected transport), and
 * must add NO route and NO command-center change.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const SOURCE_FILES = [
  'src/portfolioBoarding/portfolioLoanBoardingFeatureFlags.ts',
  'src/portfolioBoarding/portfolioLoanBoardingLivePersistence.ts',
  'src/portfolioBoarding/resolvePortfolioLoanBoardingAdapter.ts',
] as const;

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function readCode(rel: string): string {
  return stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. Files exist
// ---------------------------------------------------------------------------

describe('Phase 140L — live persistence files exist', () => {
  for (const rel of SOURCE_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Disabled by default
// ---------------------------------------------------------------------------

describe('Phase 140L — disabled by default', () => {
  it('the feature flag default is off', () => {
    expect(
      PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
    ).toBe(false);
    expect(
      resolvePortfolioBoardingFeatureFlags().PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
    ).toBe(false);
  });

  it('the resolver returns a disabled adapter with no arguments', () => {
    expect(resolvePortfolioBoardingPersistenceAdapter().enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Only the boarded-loan schema
// ---------------------------------------------------------------------------

describe('Phase 140L — only the boarded-loan schema is writable', () => {
  it('every allowed entity is a cr664 portfolio boarded loan table', () => {
    expect(ALLOWED_BOARDING_ENTITIES.length).toBeGreaterThan(0);
    for (const e of ALLOWED_BOARDING_ENTITIES) {
      expect(e.startsWith('cr664_portfolioboardedloan')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. No delete / network / SDK / React in the adapter source
// ---------------------------------------------------------------------------

describe('Phase 140L — the adapter is a pure, transport-injected module', () => {
  const FORBIDDEN: readonly { id: string; pattern: RegExp }[] = [
    // No direct network — all IO goes through the injected transport.
    { id: 'fetch', pattern: /\bfetch\s*\(/ },
    { id: 'xhr', pattern: /\bXMLHttpRequest\b/ },
    // No Dataverse SDK / data source import inside the adapter.
    { id: 'power-apps-sdk', pattern: /@microsoft\/power-apps/ },
    { id: 'webapi', pattern: /\bwebAPI\b/i },
    // No delete / destructive verbs.
    { id: 'delete', pattern: /\bdelete(Record|BoardedLoan)?\b|method:\s*'DELETE'/ },
    // No React in a persistence module.
    { id: 'react', pattern: /\breact\b/i },
    // No Copilot.
    { id: 'copilot', pattern: /\bcopilot\b/i },
  ];

  for (const rule of FORBIDDEN) {
    it(`[${rule.id}] no live-persistence source file matches`, () => {
      const hits = SOURCE_FILES.filter((rel) => rule.pattern.test(readCode(rel)));
      expect(hits, `rule [${rule.id}] matched: ${hits.join(', ')}`).toEqual([]);
    });
  }

  it('the transport seam exposes no delete operation', () => {
    const code = readCode('src/portfolioBoarding/portfolioLoanBoardingLivePersistence.ts');
    expect(code).toMatch(/interface PortfolioBoardingTransport/);
    expect(code).not.toMatch(/\bdelete\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// 5. No fake data, no new route, no command-center change
// ---------------------------------------------------------------------------

describe('Phase 140L — no fake data and no route/command-center coupling', () => {
  it('no dollar-amount literals or fake borrower names in the source', () => {
    for (const rel of SOURCE_FILES) {
      const code = readCode(rel);
      expect(/\$\s*\d/.test(code), rel).toBe(false);
      for (const re of [/\bAcme\b/i, /\bJohn\s+Smith\b/i, /\bTest\s+Borrower\b/i]) {
        expect(re.test(code), `${rel} ${re}`).toBe(false);
      }
    }
  });

  it('the adapter does not import any router or command-center surface', () => {
    for (const rel of SOURCE_FILES) {
      const code = readCode(rel);
      expect(/react-router|useNavigate|createBrowserRouter/.test(code), rel).toBe(false);
      // Match an actual import/usage of a command-center module, not a flag
      // NAME like `commandCenterEnabled` (which is just a config field).
      expect(
        /from\s+['"][^'"]*CommandCenter|CommandSnapshot|<\w*CommandCenter/.test(code),
        rel,
      ).toBe(false);
    }
  });

  it('adds no .tsx React component (this phase is adapter-only)', () => {
    // The three new files are all .ts; a sibling .tsx with these names would
    // indicate scope creep into UI in the adapter-only phase.
    const dir = dirname(resolve(REPO_ROOT, SOURCE_FILES[0]));
    for (const base of [
      'portfolioLoanBoardingFeatureFlags',
      'portfolioLoanBoardingLivePersistence',
      'resolvePortfolioLoanBoardingAdapter',
    ]) {
      expect(existsSync(resolve(dir, `${base}.tsx`))).toBe(false);
    }
  });
});
