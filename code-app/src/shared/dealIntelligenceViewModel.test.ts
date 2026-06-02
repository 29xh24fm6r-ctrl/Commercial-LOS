import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveDealIntelligenceViewModel,
  type DealIntelligenceViewModelInput,
} from './dealIntelligenceViewModel';
import type { DealDetail } from '../deals/dealQueries';
import type { DealCockpitMetrics } from '../deals/dealCockpitMetrics';
import type { BlockersResult, BlockerSignal } from '../deals/blockerRules';

/**
 * Phase 123A — deriveDealIntelligenceViewModel tests.
 *
 * Pins the shared deal-intelligence view-model behavior:
 *   - hydrated pass-through of Phase 122C loader fields;
 *   - honest absence (undefined for unset, never fabricated);
 *   - completeness/work-counts wired straight from cockpit metrics;
 *   - nextBestAction priority ladder:
 *       hard blocker → overdue tasks → outstanding documents →
 *       stale activity (≥ 14 days) → stale memo → draft memo →
 *       open tasks → completeness nudge (< 50%);
 *   - closure short-circuits nextBestAction to undefined;
 *   - blocker pass-through (status / signals) when provided;
 *   - lastActivity classification (unknown / none / has-events);
 *   - static-source discipline: no fake-fallback strings, no
 *     sample borrower / deal names, no service / SDK imports,
 *     no IO / fetch calls.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDeal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Deal under test',
    clientName: undefined,
    stage: undefined,
    status: undefined,
    amount: undefined,
    bankerName: undefined,
    targetCloseDate: undefined,
    productType: undefined,
    loanStructure: undefined,
    customerType: undefined,
    industry: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    createdOn: undefined,
    stageEntryDate: undefined,
    isClosed: false,
    ...over,
  };
}

function makeMetrics(over: Partial<DealCockpitMetrics> = {}): DealCockpitMetrics {
  return {
    loanAmount: undefined,
    targetCloseIso: undefined,
    daysToClose: undefined,
    daysInStage: undefined,
    populatedFieldCount: 0,
    totalFieldCount: 13,
    profileCompletenessPct: 0,
    missingFieldLabels: [],
    taskOpenCount: 0,
    taskOverdueCount: 0,
    taskCompletedCount: 0,
    docOutstandingCount: 0,
    docReceivedCount: 0,
    docReviewedCount: 0,
    memoState: 'none',
    memoCount: 0,
    communicationState: 'unknown',
    lastTouchedIso: undefined,
    daysSinceLastTouched: undefined,
    rightRail: {
      tasksOpen: 0,
      documentsOutstanding: 0,
      memos: 0,
      communicationEvents: 0,
    },
    ...over,
  };
}

function makeBlockers(over: Partial<BlockersResult> = {}): BlockersResult {
  return {
    status: 'clear',
    signals: [],
    closedDealNote: undefined,
    ...over,
  };
}

function signal(over: Partial<BlockerSignal> = {}): BlockerSignal {
  return {
    id: 'past-target-close',
    severity: 'blocked',
    label: 'Target close date passed 10 days ago',
    detail: 'Target close was 10 days ago and the deal is not yet closed.',
    ...over,
  };
}

function input(
  over: Partial<DealIntelligenceViewModelInput> = {},
): DealIntelligenceViewModelInput {
  return {
    deal: makeDeal(),
    metrics: makeMetrics(),
    blockers: undefined,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Identity + Phase-122-hydrated display values
// ---------------------------------------------------------------------------

describe('Phase 123A — deriveDealIntelligenceViewModel (identity + hydration)', () => {
  it('passes through deal identity (id, name)', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        deal: makeDeal({
          id: 'deal-id-abc',
          name: 'Working Capital Facility',
        }),
      }),
    );
    expect(vm.dealId).toBe('deal-id-abc');
    expect(vm.dealName).toBe('Working Capital Facility');
  });

  it('hydrates every Phase-122-mapped display value from the loader', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        deal: makeDeal({
          clientName: 'Borrower One',
          bankerName: 'Banker Two',
          stage: 'Underwriting',
          status: 'Active',
          productType: 'SBA 7(a)',
          loanStructure: 'Term Loan',
          pricingType: 'Variable',
          amount: 1_500_000,
          targetCloseDate: '2026-07-01',
          collateralSummary: 'Real estate, equipment',
        }),
        metrics: makeMetrics({
          loanAmount: 1_500_000,
          targetCloseIso: '2026-07-01',
          daysToClose: 30,
          daysInStage: 7,
        }),
      }),
    );
    expect(vm.clientName).toBe('Borrower One');
    expect(vm.bankerName).toBe('Banker Two');
    expect(vm.stageName).toBe('Underwriting');
    expect(vm.statusName).toBe('Active');
    expect(vm.productTypeName).toBe('SBA 7(a)');
    expect(vm.loanStructureName).toBe('Term Loan');
    expect(vm.pricingTypeName).toBe('Variable');
    expect(vm.amount).toBe(1_500_000);
    expect(vm.targetCloseDate).toBe('2026-07-01');
    expect(vm.daysToClose).toBe(30);
    expect(vm.daysInStage).toBe(7);
    expect(vm.collateralSummary).toBe('Real estate, equipment');
  });

  it('surfaces undefined verbatim when the loader returned undefined (honest absence)', () => {
    const vm = deriveDealIntelligenceViewModel(input());
    expect(vm.clientName).toBeUndefined();
    expect(vm.bankerName).toBeUndefined();
    expect(vm.stageName).toBeUndefined();
    expect(vm.statusName).toBeUndefined();
    expect(vm.productTypeName).toBeUndefined();
    expect(vm.loanStructureName).toBeUndefined();
    expect(vm.pricingTypeName).toBeUndefined();
    expect(vm.amount).toBeUndefined();
    expect(vm.targetCloseDate).toBeUndefined();
    expect(vm.daysToClose).toBeUndefined();
    expect(vm.daysInStage).toBeUndefined();
    expect(vm.collateralSummary).toBeUndefined();
  });

  it('never substitutes fake placeholder strings for missing values', () => {
    const vm = deriveDealIntelligenceViewModel(input());
    const candidates: Array<string | undefined> = [
      vm.clientName,
      vm.bankerName,
      vm.stageName,
      vm.statusName,
      vm.productTypeName,
      vm.loanStructureName,
      vm.pricingTypeName,
      vm.collateralSummary,
    ];
    for (const value of candidates) {
      expect(value).not.toBe('');
      expect(value).not.toBe('Not set');
      expect(value).not.toBe('—');
      expect(value).not.toBe('TBD');
      expect(value).not.toBe('Unknown');
    }
  });
});

// ---------------------------------------------------------------------------
// Completeness + work counts + blocker pass-through
// ---------------------------------------------------------------------------

describe('Phase 123A — completeness + work counts', () => {
  it('mirrors cockpit-metrics completeness fields verbatim', () => {
    const missing = ['Loan amount', 'Target close', 'Industry'];
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          populatedFieldCount: 10,
          totalFieldCount: 13,
          profileCompletenessPct: 77,
          missingFieldLabels: missing,
        }),
      }),
    );
    expect(vm.completeness.populatedFieldCount).toBe(10);
    expect(vm.completeness.totalFieldCount).toBe(13);
    expect(vm.completeness.completenessPct).toBe(77);
    expect(vm.completeness.missingFieldLabels).toBe(missing);
  });

  it('mirrors cockpit-metrics task and document counts', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          taskOpenCount: 4,
          taskOverdueCount: 1,
          docOutstandingCount: 2,
        }),
      }),
    );
    expect(vm.openTaskCount).toBe(4);
    expect(vm.overdueTaskCount).toBe(1);
    expect(vm.outstandingDocumentCount).toBe(2);
  });
});

describe('Phase 123A — blocker pass-through', () => {
  it('exposes blocker status + signals when blockers provided', () => {
    const signals = [signal({ severity: 'blocked' })];
    const vm = deriveDealIntelligenceViewModel(
      input({ blockers: makeBlockers({ status: 'blocked', signals }) }),
    );
    expect(vm.blockerStatus).toBe('blocked');
    expect(vm.blockerSignals).toBe(signals);
  });

  it('returns blockerStatus undefined and empty signals when blockers omitted', () => {
    const vm = deriveDealIntelligenceViewModel(input({ blockers: undefined }));
    expect(vm.blockerStatus).toBeUndefined();
    expect(vm.blockerSignals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// lastActivity classification
// ---------------------------------------------------------------------------

describe('Phase 123A — lastActivity', () => {
  it("state='unknown' when activity slot has not loaded", () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          communicationState: 'unknown',
          lastTouchedIso: undefined,
          daysSinceLastTouched: undefined,
        }),
      }),
    );
    expect(vm.lastActivity.state).toBe('unknown');
    expect(vm.lastActivity.iso).toBeUndefined();
    expect(vm.lastActivity.daysSince).toBeUndefined();
  });

  it("state='none' when activity loaded with zero events", () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          communicationState: 'none',
          lastTouchedIso: undefined,
          daysSinceLastTouched: undefined,
        }),
      }),
    );
    expect(vm.lastActivity.state).toBe('none');
  });

  it("state='has-events' carries iso + daysSince through", () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          communicationState: 'has-events',
          lastTouchedIso: '2026-05-20T12:00:00Z',
          daysSinceLastTouched: 3,
        }),
      }),
    );
    expect(vm.lastActivity.state).toBe('has-events');
    expect(vm.lastActivity.iso).toBe('2026-05-20T12:00:00Z');
    expect(vm.lastActivity.daysSince).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Closure
// ---------------------------------------------------------------------------

describe('Phase 123A — closure', () => {
  it("closure='open' when deal.isClosed === false", () => {
    const vm = deriveDealIntelligenceViewModel(
      input({ deal: makeDeal({ isClosed: false }) }),
    );
    expect(vm.closure).toBe('open');
  });

  it("closure='closed' when deal.isClosed === true", () => {
    const vm = deriveDealIntelligenceViewModel(
      input({ deal: makeDeal({ isClosed: true }) }),
    );
    expect(vm.closure).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// nextBestAction priority ladder
// ---------------------------------------------------------------------------

describe('Phase 123A — nextBestAction priority', () => {
  it('returns undefined when deal is closed, regardless of signals', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        deal: makeDeal({ isClosed: true }),
        metrics: makeMetrics({
          taskOverdueCount: 5,
          docOutstandingCount: 3,
          taskOpenCount: 8,
          memoState: 'draft',
        }),
        blockers: makeBlockers({
          status: 'blocked',
          signals: [signal()],
        }),
      }),
    );
    expect(vm.nextBestAction).toBeUndefined();
  });

  it('priority 1: hard blocker wins over every other signal', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          taskOverdueCount: 9,
          docOutstandingCount: 9,
          taskOpenCount: 9,
          memoState: 'draft',
          daysSinceLastTouched: 60,
          profileCompletenessPct: 10,
          missingFieldLabels: ['Industry'],
        }),
        blockers: makeBlockers({
          status: 'blocked',
          signals: [
            signal({
              label: 'Target close date passed 12 days ago',
              detail: 'Target close was 12 days ago.',
            }),
          ],
        }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('resolve-blocker');
    expect(vm.nextBestAction?.label).toContain('Target close date passed 12 days ago');
    expect(vm.nextBestAction?.reason).toBe('Target close was 12 days ago.');
  });

  it('priority 2: overdue tasks beat everything below', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          taskOverdueCount: 3,
          docOutstandingCount: 9,
          taskOpenCount: 9,
          memoState: 'draft',
          daysSinceLastTouched: 60,
          profileCompletenessPct: 10,
          missingFieldLabels: ['Industry'],
        }),
        blockers: makeBlockers({ status: 'at-risk', signals: [signal({ severity: 'at-risk' })] }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('open-overdue-tasks');
    expect(vm.nextBestAction?.label).toBe('Open the 3 overdue tasks');
    expect(vm.nextBestAction?.reason).toContain('3 task(s) past their due date');
  });

  it('priority 2: singular copy when there is exactly one overdue task', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({ metrics: makeMetrics({ taskOverdueCount: 1 }) }),
    );
    expect(vm.nextBestAction?.label).toBe('Open the 1 overdue task');
  });

  it('priority 3: outstanding documents fire when no overdue tasks', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          taskOverdueCount: 0,
          docOutstandingCount: 4,
          taskOpenCount: 9,
          memoState: 'draft',
          daysSinceLastTouched: 60,
          profileCompletenessPct: 10,
          missingFieldLabels: ['Industry'],
        }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('follow-up-documents');
    expect(vm.nextBestAction?.label).toBe('Follow up on 4 outstanding documents');
    expect(vm.nextBestAction?.reason).toContain('4 item(s) not yet received');
  });

  it('priority 3: singular copy when there is exactly one outstanding document', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({ metrics: makeMetrics({ docOutstandingCount: 1 }) }),
    );
    expect(vm.nextBestAction?.label).toBe('Follow up on 1 outstanding document');
  });

  it('priority 4: stale activity fires at the 14-day threshold', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          daysSinceLastTouched: 14,
          memoState: 'draft',
          taskOpenCount: 9,
          profileCompletenessPct: 10,
          missingFieldLabels: ['Industry'],
        }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('borrower-check-in');
    expect(vm.nextBestAction?.label).toContain('14 days');
  });

  it('priority 4: stale activity does NOT fire one day below the threshold', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          daysSinceLastTouched: 13,
          memoState: 'draft',
        }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('draft-credit-memo');
  });

  it('priority 4: stale activity ignored when daysSinceLastTouched is undefined', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          daysSinceLastTouched: undefined,
          memoState: 'stale',
        }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('refresh-stale-memo');
  });

  it('priority 5: stale memo fires before draft memo', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({ metrics: makeMetrics({ memoState: 'stale' }) }),
    );
    expect(vm.nextBestAction?.id).toBe('refresh-stale-memo');
  });

  it('priority 5: draft memo fires when no stale memo signal', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({ metrics: makeMetrics({ memoState: 'draft' }) }),
    );
    expect(vm.nextBestAction?.id).toBe('draft-credit-memo');
  });

  it('priority 5: final / borrower-safe memo states do NOT fire a memo action', () => {
    const vmFinal = deriveDealIntelligenceViewModel(
      input({ metrics: makeMetrics({ memoState: 'final' }) }),
    );
    expect(vmFinal.nextBestAction).toBeUndefined();
    const vmBorrowerSafe = deriveDealIntelligenceViewModel(
      input({ metrics: makeMetrics({ memoState: 'borrower-safe' }) }),
    );
    expect(vmBorrowerSafe.nextBestAction).toBeUndefined();
  });

  it('priority 6: open tasks fire only when overdue / docs / staleness / memo are clear', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          taskOpenCount: 2,
          profileCompletenessPct: 10,
          missingFieldLabels: ['Industry'],
        }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('open-outstanding-tasks');
    expect(vm.nextBestAction?.label).toBe('Open the 2 active tasks');
  });

  it('priority 6: singular copy when there is exactly one open task', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({ metrics: makeMetrics({ taskOpenCount: 1 }) }),
    );
    expect(vm.nextBestAction?.label).toBe('Open the 1 active task');
  });

  it('priority 7: completeness nudge fires below 50% with missing fields', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          profileCompletenessPct: 25,
          missingFieldLabels: ['Industry', 'Pricing type'],
        }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('populate-missing-fields');
    expect(vm.nextBestAction?.label).toBe('Populate Industry');
    expect(vm.nextBestAction?.reason).toContain('Profile completeness is 25%');
    expect(vm.nextBestAction?.reason).toContain('2 required field(s) still unset');
  });

  it('priority 7: completeness nudge does NOT fire at the 50% threshold', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          profileCompletenessPct: 50,
          missingFieldLabels: ['Industry'],
        }),
      }),
    );
    expect(vm.nextBestAction).toBeUndefined();
  });

  it('priority 7: completeness nudge does NOT fire when no labels are missing', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          profileCompletenessPct: 25,
          missingFieldLabels: [],
        }),
      }),
    );
    expect(vm.nextBestAction).toBeUndefined();
  });

  it('returns undefined when every signal is clear and completeness is healthy', () => {
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({
          taskOverdueCount: 0,
          docOutstandingCount: 0,
          taskOpenCount: 0,
          memoState: 'final',
          daysSinceLastTouched: 1,
          profileCompletenessPct: 95,
          missingFieldLabels: ['Spread index'],
        }),
        blockers: makeBlockers({ status: 'clear', signals: [] }),
      }),
    );
    expect(vm.nextBestAction).toBeUndefined();
  });

  it('blockers with empty signals array does not fire resolve-blocker', () => {
    // Defensive: status='blocked' but signals empty would be a bug,
    // but we should still not surface a blocker action with no signal to point at.
    const vm = deriveDealIntelligenceViewModel(
      input({
        metrics: makeMetrics({ taskOverdueCount: 2 }),
        blockers: makeBlockers({ status: 'blocked', signals: [] }),
      }),
    );
    expect(vm.nextBestAction?.id).toBe('open-overdue-tasks');
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline (mirrors phase122BScriptContract style)
// ---------------------------------------------------------------------------

describe('Phase 123A — static-source discipline', () => {
  const source = readFileSync(
    resolve(__dirname, 'dealIntelligenceViewModel.ts'),
    'utf8',
  );
  // Strip block + line comments so static-source scans don't flag
  // documentation that *describes* a forbidden pattern.
  const sourceCode = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('imports no SDK / service modules (pure deriver, no IO)', () => {
    expect(sourceCode).not.toMatch(/from\s+['"][^'"]*generated\/services/);
    expect(sourceCode).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
    expect(sourceCode).not.toMatch(/PowerProvider/);
  });

  it('contains no fetch / network call', () => {
    expect(sourceCode).not.toMatch(/\bfetch\s*\(/);
    expect(sourceCode).not.toMatch(/XMLHttpRequest/);
    expect(sourceCode).not.toMatch(/axios/);
  });

  it('contains no hardcoded borrower / sample-deal names', () => {
    // Mirror the Phase 122 rule: descriptions and constants may
    // reference roles, not specific borrowers or test records.
    expect(sourceCode).not.toMatch(/\bAcme\b/i);
    expect(sourceCode).not.toMatch(/\bContoso\b/i);
    expect(sourceCode).not.toMatch(/\bTEST\s+deal\b/i);
    expect(sourceCode).not.toMatch(/sample\s+deal/i);
    expect(sourceCode).not.toMatch(/mock\s+deal/i);
  });

  it('contains no fake-fallback display string injected for missing values', () => {
    // The deriver projects undefined verbatim — it must never
    // substitute Not set / N/A / TBD / em-dash placeholders.
    expect(sourceCode).not.toMatch(/['"]Not set['"]/);
    expect(sourceCode).not.toMatch(/['"]N\/A['"]/);
    expect(sourceCode).not.toMatch(/['"]TBD['"]/);
    expect(sourceCode).not.toMatch(/['"]Unknown['"]/);
    expect(sourceCode).not.toMatch(/['"]—['"]/);
  });

  it('pins the stale-activity threshold at 14 days', () => {
    expect(sourceCode).toMatch(/STALE_ACTIVITY_DAYS\s*=\s*14\b/);
  });

  it('pins the completeness-nudge threshold at 50%', () => {
    expect(sourceCode).toMatch(/COMPLETENESS_NUDGE_PCT\s*=\s*50\b/);
  });

  it('declares deriveDealIntelligenceViewModel as a pure function (no async, no Promise)', () => {
    expect(sourceCode).toMatch(/export\s+function\s+deriveDealIntelligenceViewModel\s*\(/);
    expect(sourceCode).not.toMatch(
      /export\s+(async\s+)?function\s+deriveDealIntelligenceViewModel[^{]*Promise</,
    );
  });
});
