import { describe, it, expect } from 'vitest';

import {
  concentrationToHorizontalBars,
  concentrationToVerticalBars,
  derivePortfolioExposureBands,
  exposureBandsToVerticalBars,
} from './portfolioDashboardCharts';
import type { PortfolioConcentrationRow } from './portfolioCommandSnapshot';
import type { ManagerVMRow } from '../manager/managerPipelineSnapshot';
import type { DealIntelligenceViewModel } from '../shared/dealIntelligenceViewModel';
import type { TeamDeal } from '../manager/managerQueries';

/**
 * Phase 126A — Portfolio dashboard chart helpers.
 *
 * Pins:
 *   - concentrationToHorizontalBars maps exposure $ to value and
 *     count + share % to secondaryLabel; Unknown rows surface in
 *     neutral tone;
 *   - concentrationToVerticalBars maps dealCount to value;
 *   - derivePortfolioExposureBands bucketizes deals into fixed
 *     bands (<$500K, $500K–$2M, $2M–$10M, $10M+); deals with
 *     undefined / NaN / negative amounts are excluded honestly;
 *   - exposureBandsToVerticalBars returns 4 fixed bars.
 */

// ---------------------------------------------------------------------------
// Adapter helpers
// ---------------------------------------------------------------------------

function row(label: string, exposure: number, count: number, share: number, unknown = false): PortfolioConcentrationRow {
  return {
    label,
    dealCount: count,
    totalExposure: exposure,
    sharePct: share,
    isUnknown: unknown,
  };
}

describe('Phase 126A — concentrationToHorizontalBars', () => {
  it('uses totalExposure as the primary value', () => {
    const out = concentrationToHorizontalBars([
      row('SBA 7(a)', 1_000_000, 2, 60),
      row('SBA 504', 500_000, 1, 30),
    ]);
    expect(out[0].value).toBe(1_000_000);
    expect(out[1].value).toBe(500_000);
  });

  it('uses deal count + share % as the secondaryLabel (1 deal vs N deals copy)', () => {
    const out = concentrationToHorizontalBars([
      row('A', 100, 1, 25),
      row('B', 200, 2, 50),
    ]);
    expect(out[0].secondaryLabel).toBe('1 deal · 25%');
    expect(out[1].secondaryLabel).toBe('2 deals · 50%');
  });

  it("renders 'neutral' tone for Unknown rows", () => {
    const out = concentrationToHorizontalBars([
      row('SBA 7(a)', 500, 1, 50, false),
      row('Unknown product', 500, 1, 50, true),
    ]);
    expect(out[0].tone).toBe('info');
    expect(out[1].tone).toBe('neutral');
  });
});

describe('Phase 126A — concentrationToVerticalBars', () => {
  it('uses dealCount as the primary value', () => {
    const out = concentrationToVerticalBars([
      row('Origination', 5_000_000, 3, 50),
      row('Underwriting', 5_000_000, 5, 50),
    ]);
    expect(out[0].value).toBe(3);
    expect(out[1].value).toBe(5);
  });

  it('preserves the isUnknown tone signal (neutral)', () => {
    const out = concentrationToVerticalBars([
      row('Origination', 100, 1, 50, false),
      row('Unset stage', 100, 1, 50, true),
    ]);
    expect(out[1].tone).toBe('neutral');
  });
});

// ---------------------------------------------------------------------------
// derivePortfolioExposureBands
// ---------------------------------------------------------------------------

function vm(): DealIntelligenceViewModel {
  return {
    dealId: 'd',
    dealName: 'd',
    clientName: undefined,
    bankerName: undefined,
    stageName: undefined,
    statusName: undefined,
    productTypeName: undefined,
    loanStructureName: undefined,
    pricingTypeName: undefined,
    amount: undefined,
    targetCloseDate: undefined,
    daysToClose: undefined,
    daysInStage: undefined,
    collateralSummary: undefined,
    completeness: {
      populatedFieldCount: 0,
      totalFieldCount: 13,
      completenessPct: 0,
      missingFieldLabels: [],
    },
    openTaskCount: 0,
    overdueTaskCount: 0,
    outstandingDocumentCount: 0,
    blockerStatus: 'clear',
    blockerSignals: [],
    lastActivity: { iso: undefined, daysSince: undefined, state: 'unknown' },
    nextBestAction: undefined,
    closure: 'open',
  };
}

function teamDeal(over: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd',
    name: 'd',
    clientName: undefined,
    stage: undefined,
    status: undefined,
    amount: undefined,
    targetCloseDate: undefined,
    stageEntryDate: undefined,
    modifiedOn: undefined,
    assignedBankerId: undefined,
    assignedBankerName: undefined,
    collateralSummary: undefined,
    productType: undefined,
    loanStructure: undefined,
    pricingType: undefined,
    ...over,
  };
}

function vmRow(amount: number | undefined): ManagerVMRow {
  return {
    teamDeal: teamDeal({ amount }),
    vm: vm(),
    openTaskCount: 0,
    overdueTaskCount: 0,
    outstandingDocumentCount: 0,
    managerMissingFieldLabels: [],
  };
}

describe('Phase 126A — derivePortfolioExposureBands', () => {
  it('returns 4 fixed bands (<$500K, $500K–$2M, $2M–$10M, $10M+) even for empty input', () => {
    const bands = derivePortfolioExposureBands([]);
    expect(bands.map((b) => b.label)).toEqual([
      '<$500K',
      '$500K–$2M',
      '$2M–$10M',
      '$10M+',
    ]);
    expect(bands.every((b) => b.dealCount === 0)).toBe(true);
  });

  it('places each deal in the matching band by amount', () => {
    const bands = derivePortfolioExposureBands([
      vmRow(100_000), // <$500K
      vmRow(750_000), // $500K-$2M
      vmRow(5_000_000), // $2M-$10M
      vmRow(20_000_000), // $10M+
    ]);
    expect(bands[0].dealCount).toBe(1);
    expect(bands[1].dealCount).toBe(1);
    expect(bands[2].dealCount).toBe(1);
    expect(bands[3].dealCount).toBe(1);
  });

  it('excludes deals with undefined / NaN / negative amounts (honest absence)', () => {
    const bands = derivePortfolioExposureBands([
      vmRow(undefined),
      vmRow(NaN),
      vmRow(-100),
      vmRow(100_000),
    ]);
    expect(bands.reduce((s, b) => s + b.dealCount, 0)).toBe(1);
  });

  it('sums totalExposure within each band', () => {
    const bands = derivePortfolioExposureBands([
      vmRow(100_000),
      vmRow(200_000),
      vmRow(5_000_000),
    ]);
    expect(bands[0].totalExposure).toBe(300_000);
    expect(bands[2].totalExposure).toBe(5_000_000);
  });
});

describe('Phase 126A — exposureBandsToVerticalBars', () => {
  it('returns one bar per band with dealCount as value', () => {
    const bands = derivePortfolioExposureBands([
      vmRow(100_000),
      vmRow(750_000),
      vmRow(5_000_000),
    ]);
    const bars = exposureBandsToVerticalBars(bands);
    expect(bars.map((b) => b.label)).toEqual([
      '<$500K',
      '$500K–$2M',
      '$2M–$10M',
      '$10M+',
    ]);
    expect(bars.map((b) => b.value)).toEqual([1, 1, 1, 0]);
  });
});
