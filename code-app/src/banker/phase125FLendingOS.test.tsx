// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 125F — Lending OS unified shell static pins.
 *
 * The Phase 125F shell is shared between the Banker Workspace
 * home (BankerShell) and the per-deal cockpit (BankerDealWorkspace
 * — wrapped in `<LendingOSLayout>`). This file pins the
 * non-rendering invariants of the recomposition so future drift
 * is caught at the source level rather than visually:
 *
 *   1. Shared shell exists and exports the public type.
 *   2. BankerShell uses LendingOSLayout for chrome.
 *   3. BankerDealWorkspace wraps in LendingOSLayout for chrome.
 *   4. Sidebar placeholders carry "Not yet wired" honest tooltips
 *      (no fabricated routing into nonexistent surfaces).
 *   5. GreetingHeader's "+ New Deal" / "Log Activity" / search
 *      are disabled-placeholder controls — no governed-write
 *      handlers attached.
 *   6. Phase 110 communication-lane lock holds across the new
 *      shell + greeting + KPI grid + layout files.
 *   7. Banker KPI grid surfaces the four "Not yet wired" tiles
 *      (WEIGHTED / WIN RATE / HIGH PROB / YTD CLOSED) with
 *      explicit governance tooltips.
 */

const READ = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const READ_DEAL = (rel: string) =>
  readFileSync(resolve(__dirname, '..', 'deals', rel), 'utf8');

describe('Phase 125F — Lending OS shell composition', () => {
  it('LendingOSLayout exports the LendingOSNavKey type and the layout component', () => {
    const src = READ('LendingOSLayout.tsx');
    expect(src).toMatch(/export type LendingOSNavKey/);
    expect(src).toMatch(/export function LendingOSLayout\b/);
  });

  it('BankerShell renders inside LendingOSLayout (chrome reuse, not duplication)', () => {
    const src = READ('BankerShell.tsx');
    expect(src).toMatch(/import \{[^}]*LendingOSLayout[^}]*\} from '\.\/LendingOSLayout'/);
    expect(src).toMatch(/<LendingOSLayout\b/);
  });

  it('BankerDealWorkspace wraps in LendingOSLayout so the dark sidebar persists across deal pages', () => {
    const src = READ_DEAL('BankerDealWorkspace.tsx');
    expect(src).toMatch(/import \{[^}]*LendingOSLayout[^}]*\} from '\.\.\/banker\/LendingOSLayout'/);
    expect(src).toMatch(/<LendingOSLayout\b/);
  });

  it('BankerDealWorkspace passes activeNav="active-deals" so the sidebar correctly highlights the pipeline entry point', () => {
    const src = READ_DEAL('BankerDealWorkspace.tsx');
    expect(src).toMatch(/activeNav="active-deals"/);
  });
});

describe('Phase 125F — Honest disabled placeholders', () => {
  it('LendingOSLayout sidebar declares Schedule / Contacts / Vendors / Settings / Help as placeholders', () => {
    const src = READ('LendingOSLayout.tsx');
    // The placeholder ids are stable strings exposed on data-nav-placeholder.
    for (const id of ['schedule', 'contacts', 'vendors', 'settings', 'help']) {
      expect(src).toMatch(new RegExp(`id: '${id}'`));
    }
  });

  it('LendingOSLayout placeholder buttons carry aria-disabled + tooltip and never declare an onClick', () => {
    const src = READ('LendingOSLayout.tsx');
    // The NavPlaceholder component renders `disabled` + `aria-disabled`
    // and explicitly omits an onClick attribute.
    expect(src).toMatch(/function NavPlaceholder\b[\s\S]*aria-disabled="true"[\s\S]*disabled[\s\S]*data-nav-placeholder/);
    // No onClick handler is wired in NavPlaceholder — search by name.
    const navPlaceholderBlock = src.split('function NavPlaceholder')[1] ?? '';
    expect(navPlaceholderBlock.split('function ')[0]).not.toMatch(/onClick=\{/);
  });

  it('GreetingHeader keeps "+ New Deal" disabled while Log Activity uses the Phase 160 governed action', () => {
    const src = READ('GreetingHeader.tsx');
    // ActionButton component is the disabled-placeholder factory.
    expect(src).toMatch(/function ActionButton\b/);
    expect(src).toMatch(/disabled\s*\n?\s*aria-disabled="true"/);
    expect(src).toMatch(/\+ New Deal/);
    expect(src).toMatch(/Log Activity/);
    expect(src).toMatch(/from\s+['"]\.\.\/deals\/logActivityActions['"]/);
    expect(src).toMatch(/no generated stage\/status reference data source exists/);
    expect(src).not.toMatch(/newDealActions|NewDealModal/);
  });

  it('GreetingHeader search input is disabled with a "not yet wired" placeholder', () => {
    const src = READ('GreetingHeader.tsx');
    expect(src).toMatch(/data-search-placeholder="lending-os-search"/);
    expect(src).toMatch(/disabled\s*\n?\s*aria-disabled="true"/);
  });
});

describe('Phase 125F — KPI grid governance', () => {
  it('BankerKpiGrid marks WEIGHTED / WIN RATE / HIGH PROB / YTD CLOSED as "Not yet wired" with tooltips', () => {
    const src = READ('BankerKpiGrid.tsx');
    for (const tooltip of [
      'NOT_YET_WIRED_TOOLTIP_WEIGHTED',
      'NOT_YET_WIRED_TOOLTIP_YTD_CLOSED',
      'NOT_YET_WIRED_TOOLTIP_WIN_RATE',
      'NOT_YET_WIRED_TOOLTIP_HIGH_PROB',
    ]) {
      expect(src).toMatch(new RegExp(`${tooltip}\\s*=`));
    }
    // The tooltips explicitly cite PHASE_118 bucket-C governance.
    expect(src).toMatch(/PHASE_118_ORIGINAL_UI_UX_INVENTORY/);
  });
});

describe('Phase 125F — Communication lane lock across the new shell', () => {
  for (const rel of [
    'LendingOSLayout.tsx',
    'GreetingHeader.tsx',
    'BankerKpiGrid.tsx',
    'BankerShell.tsx',
  ]) {
    it(`${rel} does NOT import Office365OutlookService / SendEmailV2 / sendXEmail`, () => {
      const src = READ(rel);
      expect(src).not.toMatch(/from\s+['"][^'"]*Office365OutlookService['"]/);
      expect(src).not.toMatch(/SendEmailV2\s*\(/);
      expect(src).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
      expect(src).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
    });
  }
});
