import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 122 — Loan Deal lookup contract pins.
 *
 * Every operational child-record write in the OGB LOS app MUST
 * bind its "Deal" lookup to the **modern** `cr664_loandeal`
 * table via `/cr664_loandeals(<id>)`. Loaders MUST filter
 * child rows by `_cr664_deal_value eq <loanDealId>`. The
 * legacy `cr664_deal` table is NEVER referenced from these
 * operational paths.
 *
 * This file is the **static-source guard** against drift. If
 * a Dataverse-config workaround tempts a contributor to flip
 * a bind URL from `/cr664_loandeals(...)` to `/cr664_deals(...)`
 * to make a live row save, this test will fail.
 *
 * Phase 122 fixes the Dataverse-side schema mismatch (live
 * tables missing the `cr664_Deal` lookup column on the
 * modern Loan Deal target). The app code does not change.
 */

const SRC = resolve(__dirname, '..', '..');
const READ = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

const OPERATIONAL_WRITE_FILES = [
  'deals/documentActions.ts',
  'deals/dealTaskActions.ts',
  'deals/creditMemoActions.ts',
] as const;

const OPERATIONAL_LOADER_FILES = [
  'deals/dealDocumentQueries.ts',
  'deals/dealTaskQueries.ts',
  'deals/creditMemoQueries.ts',
  'deals/activityQueries.ts',
  'banker/workQueueQueries.ts',
] as const;

describe('Phase 122 — operational writes bind to /cr664_loandeals(…), never to /cr664_deals(…)', () => {
  for (const rel of OPERATIONAL_WRITE_FILES) {
    it(`${rel} binds every Deal-style lookup to /cr664_loandeals(…)`, () => {
      const src = READ(rel);
      // Every `cr664_*Deal*@odata.bind` (Deal / LoanDeal) field
      // assignment must use the /cr664_loandeals(<id>) URL.
      const bindMatches = Array.from(
        src.matchAll(/'cr664_(?:Deal|LoanDeal)@odata\.bind'\s*:\s*`(\/cr664_[a-z]+)\(\$\{[^}]+\}\)`/g),
      );
      // At least one binding must exist per write file (each
      // operational action emits an audit + timeline + primary
      // write, all of which reference the deal).
      expect(bindMatches.length).toBeGreaterThan(0);
      for (const [full, urlPath] of bindMatches) {
        expect(
          urlPath,
          `Forbidden legacy bind in ${rel}: ${full}`,
        ).toBe('/cr664_loandeals');
      }
    });

    it(`${rel} does NOT contain any /cr664_deals( URL (legacy table forbidden)`, () => {
      const src = READ(rel);
      expect(src).not.toMatch(/\/cr664_deals\(/);
    });
  }
});

describe('Phase 122 — operational loaders filter child rows by _cr664_deal_value', () => {
  for (const rel of OPERATIONAL_LOADER_FILES) {
    it(`${rel} filters by _cr664_deal_value (modeled FK on cr664_loandeal child tables)`, () => {
      const src = READ(rel);
      expect(src).toMatch(/_cr664_deal_value\s+eq\s/);
    });

    it(`${rel} does NOT reference legacy cr664_deal entity URL`, () => {
      const src = READ(rel);
      expect(src).not.toMatch(/Cr664_dealsService\b/);
      expect(src).not.toMatch(/\/cr664_deals\(/);
    });
  }
});

describe('Phase 122 — generated models name the Deal lookup as cr664_Deal (the modern Loan Deal target)', () => {
  const MODELED_TABLES = [
    'src/generated/models/Cr664_documentchecklistsModel.ts',
    'src/generated/models/Cr664_dealtask1sModel.ts',
    'src/generated/models/Cr664_creditmemo1sModel.ts',
    'src/generated/models/Cr664_creditmemodraftsectionsModel.ts',
    'src/generated/models/Cr664_dealtimelineeventsModel.ts',
  ];

  for (const rel of MODELED_TABLES) {
    it(`${rel} exposes "cr664_Deal@odata.bind" + "_cr664_deal_value" (the bind/FK pair the app uses)`, () => {
      const src = readFileSync(resolve(__dirname, '..', '..', '..', rel), 'utf8');
      // 4 of 5 models declare the bind field as optional
      // (`"cr664_Deal@odata.bind"?: string`); Document Checklist
      // declares it as required. Accept either casing.
      expect(src).toMatch(/"cr664_Deal@odata\.bind"\??\s*:\s*string/);
      expect(src).toMatch(/_cr664_deal_value\??\s*:\s*string/);
    });
  }
});

describe('Phase 122 — no app file binds operational rows to the legacy cr664_deal table', () => {
  // Hard guard: literally any /cr664_deals(<id>) string in
  // src/deals/ or src/banker/ is forbidden. Phase 122's job is
  // to fix Dataverse config so the modern bind URL succeeds; it
  // is NOT to introduce a fallback to the legacy table.
  const ROOT = resolve(__dirname, '..', '..');

  function readAll(dir: string): Array<{ rel: string; text: string }> {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const out: Array<{ rel: string; text: string }> = [];
    function walk(p: string): void {
      for (const e of fs.readdirSync(p)) {
        const abs = path.resolve(p, e);
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
          walk(abs);
          continue;
        }
        if (!abs.endsWith('.ts') && !abs.endsWith('.tsx')) continue;
        if (abs.endsWith('.test.ts') || abs.endsWith('.test.tsx')) continue;
        if (abs.includes('generated')) continue;
        out.push({
          rel: path.relative(ROOT, abs).replace(/\\/g, '/'),
          text: fs.readFileSync(abs, 'utf8'),
        });
      }
    }
    walk(dir);
    return out;
  }

  it('no source file under src/deals/ or src/banker/ contains "/cr664_deals(" (legacy bind forbidden)', () => {
    const dealFiles = readAll(resolve(ROOT, 'deals'));
    const bankerFiles = readAll(resolve(ROOT, 'banker'));
    const offenders: string[] = [];
    for (const { rel, text } of [...dealFiles, ...bankerFiles]) {
      if (/\/cr664_deals\(/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
