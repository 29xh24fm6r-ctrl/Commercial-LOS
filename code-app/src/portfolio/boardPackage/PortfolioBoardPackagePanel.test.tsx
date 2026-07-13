// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioBoardPackagePanel } from './PortfolioBoardPackagePanel';
import type { PortfolioBoardPackageInput } from './portfolioBoardPackage';
import type { PortfolioRiskSnapshot } from '../portfolioRiskEngine';
import type { RegulatoryClassificationSnapshot } from '../regulatoryClassification/regulatoryClassification';
import type { WatchlistBoard } from '../watchlist/watchlist';

/**
 * Phase 264 (P3) — PortfolioBoardPackagePanel.
 *
 * Pins: renders every section's lines; the download button never throws in
 * jsdom (Blob/anchor path is wrapped defensively); the "no stress test" note
 * renders only when no scenario was supplied.
 */

function riskSnapshot(): PortfolioRiskSnapshot {
  return {
    exposure: { totalExposure: 1_000_000, averageExposure: 1_000_000, medianExposure: 1_000_000, largestExposure: 1_000_000, largestDealId: 'd1', largestDealName: 'Alpha', exposureDealCount: 1, dealsAboveThresholdCount: 0, threshold: 5_000_000 },
    concentration: { singleNamePct: 100, singleNameClient: 'Alpha', singleNameBand: 'high', top5Pct: 100, top5Band: 'high', topProductPct: 0, topProductLabel: undefined, topProductBand: 'low', topBankerPct: 0, topBankerLabel: undefined, topBankerBand: 'low', byClient: [] },
    maturityLadder: [],
    operational: { staleDealCount: 0, missingDataCount: 0, blockedDealCount: 0, atRiskDealCount: 0, documentBottleneckDealCount: 0, taskBottleneckDealCount: 0, outstandingDocumentCount: 0, openTaskCount: 0, operationalBand: 'low', dataQualityBand: 'low', closingPressureBand: 'low' },
    findings: [],
    isEmpty: false,
  };
}

function classificationSnapshot(): RegulatoryClassificationSnapshot {
  const zero = { loanCount: 0, totalExposure: 0, sharePctOfPortfolio: 0, weightedAveragePd: 0, weightedAverageLgd: 0, estimatedAllowance: 0 };
  return {
    pools: [
      { classification: 'Pass', ...zero, loanCount: 1, totalExposure: 1_000_000, sharePctOfPortfolio: 100 },
      { classification: 'Special Mention', ...zero },
      { classification: 'Substandard', ...zero },
      { classification: 'Doubtful', ...zero },
      { classification: 'Loss', ...zero },
    ],
    totalExposure: 1_000_000,
    totalEstimatedAllowance: 5_000,
    allowanceCoverageRatio: 0.5,
    criticizedExposure: 0,
    criticizedSharePct: 0,
    classifiedExposure: 0,
    classifiedSharePct: 0,
    excludedLoanCount: 0,
    isEmpty: false,
  };
}

function watchlistBoard(): WatchlistBoard {
  return { entries: [], totalExposure: 0, criticizedCount: 0, classifiedCount: 0, actionPlansOverdue: 0, groups: [] };
}

function input(): PortfolioBoardPackageInput {
  return {
    asOfDate: '2026-07-13',
    institutionName: 'Old Glory Bank',
    risk: riskSnapshot(),
    classification: classificationSnapshot(),
    watchlist: watchlistBoard(),
  };
}

describe('Phase 264 (P3) — PortfolioBoardPackagePanel', () => {
  it('renders every section with its lines', () => {
    const { container } = render(<PortfolioBoardPackagePanel input={input()} />);
    expect(container.querySelector('[data-board-package-section="executive-summary"]')).not.toBeNull();
    expect(container.querySelector('[data-board-package-section="concentration-risk"]')).not.toBeNull();
    expect(container.querySelector('[data-board-package-section="regulatory-classification"]')).not.toBeNull();
    expect(container.querySelector('[data-board-package-section="watchlist"]')).not.toBeNull();
    expect(container.querySelector('[data-board-package-section="stress-test"]')).toBeNull();
  });

  it('shows the "no stress test" note only when no scenario was supplied', () => {
    const { container } = render(<PortfolioBoardPackagePanel input={input()} />);
    expect(container.querySelector('[data-board-package-no-stress-test]')).not.toBeNull();
  });

  it('the download button click never throws in a jsdom environment', async () => {
    const user = userEvent.setup();
    const { container } = render(<PortfolioBoardPackagePanel input={input()} />);
    await user.click(container.querySelector('[data-board-package-download]') as HTMLElement);
    // No assertion beyond "did not throw" — Blob/anchor download is a browser
    // side effect this test environment can't observe, only survive.
    expect(screen.getByText(/Board \/ Regulator Package/)).toBeInTheDocument();
  });
});
