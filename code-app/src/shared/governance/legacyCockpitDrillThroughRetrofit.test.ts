import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import {
  hasDrillThroughContent,
  resolveDrillThroughAction,
  validateDrillThroughTarget,
  type DrillThroughTarget,
} from '../drillthrough/drillThroughTypes';
import { portfolioKpiTargets, portfolioChartTarget } from '../../portfolio/portfolioDrillThrough';
import { managerKpiTargets } from '../../manager/managerDrillThrough';
import { teamOpsKpiTargets } from '../../team/teamOpsQueueDrillThrough';
import { dealMetricDeckTargets } from '../../deals/dealCockpitDrillThrough';
import { executiveKpiTargets } from '../../executive/executiveDrillThrough';

/**
 * Phase 144B — legacy cockpit drill-through retrofit governance.
 *
 * Proves the Manager / Portfolio / Team / Banker-Deal / Executive cockpits now
 * use the Phase 144A drill-through contract on their KPI cards: each cockpit
 * imports the shared DrillThroughCard + its adapter, every adapter target is a
 * valid read-only panel / route / honest-unavailable target (never a blank
 * drawer), and the retrofit + adapter source introduces NO write/network pattern
 * and NO approve/deny/vote/sync-now/push-now/apply-now affordance.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const RETROFITTED_COCKPITS: ReadonlyArray<{ workspace: string; file: string; adapterImport: RegExp }> = [
  { workspace: 'manager', file: 'src/manager/ManagerBloombergControlPanel.tsx', adapterImport: /managerKpiTargets/ },
  { workspace: 'portfolio', file: 'src/portfolio/PortfolioCommandCenter.tsx', adapterImport: /portfolioKpiTargets/ },
  { workspace: 'team', file: 'src/team/TeamOpsQueue.tsx', adapterImport: /teamOpsKpiTargets/ },
  { workspace: 'deal', file: 'src/deals/DealMetricDeck.tsx', adapterImport: /dealMetricDeckTargets/ },
  { workspace: 'executive', file: 'src/executive/ExecutiveCommandCenter.tsx', adapterImport: /executiveKpiTargets/ },
];

const ADAPTER_FILES: readonly string[] = [
  'src/portfolio/portfolioDrillThrough.ts',
  'src/manager/managerDrillThrough.ts',
  'src/team/teamOpsQueueDrillThrough.ts',
  'src/deals/dealCockpitDrillThrough.ts',
  'src/executive/executiveDrillThrough.ts',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SCANNED = [...RETROFITTED_COCKPITS.map((c) => c.file), ...ADAPTER_FILES].map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 144B — every retrofitted cockpit wires the shared drill-through contract', () => {
  for (const c of RETROFITTED_COCKPITS) {
    it(`${c.workspace} cockpit imports DrillThroughCard and its adapter`, () => {
      const src = readFileSync(resolve(REPO_ROOT, c.file), 'utf8');
      expect(src).toMatch(/from '\.\.?\/(?:\.\.\/)?shared\/drillthrough\/DrillThroughCard'/);
      expect(src).toMatch(/DrillThroughCard/);
      expect(src).toMatch(c.adapterImport);
    });
  }

  it('all adapter files exist', () => {
    for (const rel of ADAPTER_FILES) {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    }
  });
});

describe('Phase 144B — retrofit + adapter source adds no write / network / affordance', () => {
  it('no fetch / XMLHttpRequest / axios', () => {
    const hits = SCANNED.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SCANNED.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Dataverse create / update / upsert / delete call', () => {
    const hits = SCANNED.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Salesforce / nCino write call', () => {
    const hits = SCANNED.filter((f) => /salesforce\w*write|ncino\w*write|writeToSalesforce|writeToNcino/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Graph / Outlook / Power Automate API usage', () => {
    const hits = SCANNED.filter((f) => /graph\.microsoft|microsoftgraph|outlook(client|service|services|api)|power[\s_-]?automate/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no eval / Function constructor', () => {
    const hits = SCANNED.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('the adapter files add no <button> / <form> / onClick / onSubmit', () => {
    const adapters = SCANNED.filter((f) => ADAPTER_FILES.some((a) => f.rel.endsWith(a.replace('src/', ''))));
    const hits = adapters.filter((f) => /<button\b|<form\b|onClick|onSubmit/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('the adapter files declare no sync-now / push-now / apply-now / approve / deny / vote affordance label', () => {
    const adapters = SCANNED.filter((f) => ADAPTER_FILES.some((a) => f.rel.endsWith(a.replace('src/', ''))));
    const hits = adapters.filter((f) => /['"][^'"]*\b(sync now|push now|apply now|approve|deny|vote)\b[^'"]*['"]/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Adapter behaviour — every target is read-only and resolves (panel/route/unavailable)
// ---------------------------------------------------------------------------

function assertAllValid(targets: Record<string, DrillThroughTarget>): void {
  const entries = Object.values(targets);
  expect(entries.length).toBeGreaterThan(0);
  for (const t of entries) {
    expect(t.readOnly).toBe(true);
    expect(validateDrillThroughTarget(t)).toEqual([]);
    const action = resolveDrillThroughAction(t);
    expect(['panel', 'route', 'unavailable']).toContain(action.kind);
    // No blank drawer: a panel-resolving target must have content; an
    // unavailable one must state a reason.
    if (action.kind === 'panel') expect(hasDrillThroughContent(t)).toBe(true);
    if (action.kind === 'unavailable') expect(action.reason.length).toBeGreaterThan(0);
  }
}

describe('Phase 144B — portfolio adapter', () => {
  const ribbon = {
    activeDealCount: 2, totalExposure: 1_000_000, closingNext30DayCount: 1, closingNext30DayAmount: 500_000,
    blockedDealCount: 1, atRiskDealCount: 1, missingDataCount: 1, outstandingDocumentCount: 2,
    openTaskCount: 3, staleDealCount: 1, avgDaysInStage: undefined,
  };
  const exceptions = [
    { dealId: 'd1', dealName: 'Acme', bankerName: 'Lee', amount: 500_000, severity: 'blocked' as const, reason: 'Missing collateral' },
    { dealId: 'd2', dealName: 'Beta', bankerName: 'Ng', amount: 250_000, severity: 'at-risk' as const, reason: 'Overdue task' },
  ];

  it('produces valid read-only KPI targets with contributing detail', () => {
    const targets = portfolioKpiTargets(ribbon, exceptions);
    assertAllValid(targets);
    // Blocked KPI lists the contributing blocked deal.
    expect(targets['blocked'].detailSections[0].rows.some((r) => r.label === 'Acme')).toBe(true);
    // avg-days-in-stage is honestly unavailable when no stage-entry date exists.
    expect(resolveDrillThroughAction(targets['avg-days-in-stage']).kind).toBe('unavailable');
  });

  it('chart target explains segments and degrades to unavailable when empty', () => {
    const full = portfolioChartTarget('by-stage', 'Pipeline by stage', 'Deal count', [
      { label: 'Term', dealCount: 3, totalExposure: 900_000, sharePct: 60, isUnknown: false },
    ]);
    expect(resolveDrillThroughAction(full).kind).toBe('panel');
    const empty = portfolioChartTarget('by-stage', 'Pipeline by stage', 'Deal count', []);
    expect(resolveDrillThroughAction(empty).kind).toBe('unavailable');
  });
});

describe('Phase 144B — manager adapter', () => {
  it('produces valid read-only KPI targets', () => {
    assertAllValid(managerKpiTargets({
      activeDealCount: 5, totalPipelineAmount: 1_750_000, missingDataCount: 1, blockerAtRiskCount: 2,
      blockedDealCount: 1, atRiskDealCount: 1, outstandingDocumentCount: 1, openTaskCount: 4,
      overdueTaskCount: 1, staleDealCount: 0, closingNext30DayCount: 1, closingNext30DayAmount: 300_000,
      avgDaysInStage: 12,
    }));
  });
});

describe('Phase 144B — team adapter', () => {
  it('produces valid read-only KPI targets', () => {
    assertAllValid(teamOpsKpiTargets({
      activeDealCount: 3, openTaskCount: 5, overdueTaskCount: 2, dueSoonTaskCount: 1,
      outstandingDocumentCount: 2, docsPendingReviewCount: 1, blockedDealCount: 1, atRiskDealCount: 1,
      staleDealCount: 0, closingNext30DayCount: 1,
    }));
  });
});

describe('Phase 144B — deal metric deck adapter', () => {
  it('produces valid read-only tile targets including a populated-vs-missing breakdown', () => {
    const targets = dealMetricDeckTargets({
      loanAmountLabel: '$2,500,000', loanAmountKnown: true, missingFieldLabels: ['Industry', 'Collateral'],
      totalFieldCount: 13, populatedFieldCount: 11, taskOpenCount: 2, taskOverdueCount: 1, taskCompletedCount: 3,
      docOutstandingCount: 1, docReceivedCount: 2, docReviewedCount: 1, targetCloseLabel: 'Jun 30, 2026',
      daysToCloseLabel: 'in 20d', memoStateLabel: 'Draft',
    });
    assertAllValid(targets);
    expect(targets['missing-fields'].detailSections[0].rows.map((r) => r.label)).toContain('Industry');
  });

  it('loan-amount tile is honestly unavailable when the amount is unset', () => {
    const targets = dealMetricDeckTargets({
      loanAmountLabel: 'Not set', loanAmountKnown: false, missingFieldLabels: [], totalFieldCount: 13,
      populatedFieldCount: 13, taskOpenCount: 0, taskOverdueCount: 0, taskCompletedCount: 0, docOutstandingCount: 0,
      docReceivedCount: 0, docReviewedCount: 0, targetCloseLabel: 'No date set', daysToCloseLabel: 'No date set', memoStateLabel: 'Not set',
    });
    expect(resolveDrillThroughAction(targets['loan-amount']).kind).toBe('unavailable');
  });
});

describe('Phase 144B — executive adapter', () => {
  it('produces valid read-only KPI targets', () => {
    assertAllValid(executiveKpiTargets({
      totalActiveDeals: 8, totalExposure: 4_000_000, closingWindowExposure: 1_000_000, closingWindowLabel: 'Q3',
      blockedCount: 1, atRiskCount: 2, staleItemCount: 1, outstandingDocumentCount: 3, openBlockerCount: 2,
      pendingApprovalCount: 1, readinessScoredCount: 6, readinessUnknownCount: 2,
    }));
  });
});
