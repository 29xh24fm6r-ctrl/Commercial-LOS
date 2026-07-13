import type { PortfolioRiskSnapshot } from '../portfolioRiskEngine';
import type { RegulatoryClassificationSnapshot } from '../regulatoryClassification/regulatoryClassification';
import type { WatchlistBoard } from '../watchlist/watchlist';
import type { PortfolioStressTestSnapshot } from '../stressTesting/stressTesting';
import { formatCurrency, formatPercent } from '../../shared/formatters';
import { csvCell } from '../../portfolioBoarding/portfolioImportColumns';

/**
 * Phase 264 (P3) — one-click board/regulator package export.
 *
 * A PURE aggregator over already-computed portfolio snapshots (risk/
 * concentration, regulatory classification pooling, watchlist, and
 * optionally a stress-test scenario) into one board-ready package, plus a
 * pure CSV export builder. This mirrors the existing FDIC examiner package
 * pattern (`fdicExaminerPackage.ts`) at the portfolio level rather than the
 * per-loan boarding level: read-only, no PDF generation, no external call,
 * no SharePoint/Graph/email delivery — the export is a plain client-side
 * CSV download (Blob + anchor, same mechanism as the portfolio import
 * wizard's report downloads), never a server round-trip.
 *
 * Discipline:
 *   - Pure. No IO, no `Date.now()` (caller supplies `asOfDate`), no
 *     Math.random().
 *   - Every section derives ONLY from its already-computed source snapshot.
 *     This module recomputes nothing and fabricates nothing.
 *   - The stress-test section is OMITTED (not zeroed/faked) when no
 *     scenario was supplied — `stressTestIncluded` tells the caller which
 *     happened.
 *   - No raw loan/record GUIDs appear in any section line — labels,
 *     counts, and currency/percentage figures only, matching the same
 *     "safe to show a board" bar the Copilot summary lines already use
 *     elsewhere in this portfolio cockpit.
 */

export interface PortfolioBoardPackageInput {
  /** ISO date the package is generated as-of. Caller-supplied — never Date.now(). */
  readonly asOfDate: string;
  readonly institutionName?: string;
  readonly risk: PortfolioRiskSnapshot;
  readonly classification: RegulatoryClassificationSnapshot;
  readonly watchlist: WatchlistBoard;
  /** Optional — a board package can be generated without having run a stress scenario. */
  readonly stressTest?: PortfolioStressTestSnapshot;
}

export interface PortfolioBoardPackageSection {
  readonly key: string;
  readonly label: string;
  /** Human-readable summary lines: labels, counts, currency/percent figures only — never a raw GUID. */
  readonly lines: readonly string[];
}

export interface PortfolioBoardPackage {
  readonly asOfDate: string;
  readonly institutionName: string | undefined;
  readonly sections: readonly PortfolioBoardPackageSection[];
  readonly stressTestIncluded: boolean;
}

const MONEY = { abbreviate: false, empty: 'not available' } as const;

function money(amount: number | undefined): string {
  return formatCurrency(amount, MONEY);
}

function pct(value: number | undefined): string {
  return value === undefined ? 'not available' : formatPercent(value, { maximumFractionDigits: 2 });
}

function buildExecutiveSummarySection(pkg: PortfolioBoardPackageInput): PortfolioBoardPackageSection {
  const { risk, classification } = pkg;
  return {
    key: 'executive-summary',
    label: 'Executive Summary',
    lines: [
      `Total portfolio exposure: ${money(risk.exposure.totalExposure)}`,
      `Loans in the classification pool: ${classification.pools.reduce((sum, p) => sum + p.loanCount, 0)} (${classification.excludedLoanCount} excluded for missing/non-positive exposure)`,
      `Criticized exposure: ${money(classification.criticizedExposure)} (${classification.criticizedSharePct}% of portfolio)`,
      `Classified exposure: ${money(classification.classifiedExposure)} (${classification.classifiedSharePct}% of portfolio)`,
      `Illustrative estimated allowance: ${money(classification.totalEstimatedAllowance)} (coverage ratio: ${classification.allowanceCoverageRatio !== undefined ? pct(classification.allowanceCoverageRatio) : 'not available'}) — NOT a certified CECL/ALLL figure.`,
      `Open risk findings: ${risk.findings.length}`,
    ],
  };
}

function buildConcentrationSection(risk: PortfolioRiskSnapshot): PortfolioBoardPackageSection {
  const c = risk.concentration;
  const topFindings = risk.findings.slice(0, 5).map(
    (f) => `${f.severity.toUpperCase()} — ${f.label}`,
  );
  return {
    key: 'concentration-risk',
    label: 'Concentration & Risk Findings (internal, non-regulatory bands)',
    lines: [
      `Single-name concentration: ${c.singleNamePct}% (${c.singleNameBand})${c.singleNameClient ? ` — ${c.singleNameClient}` : ''}`,
      `Top-5 concentration: ${c.top5Pct}% (${c.top5Band})`,
      `Top product concentration: ${c.topProductPct}% (${c.topProductBand})${c.topProductLabel ? ` — ${c.topProductLabel}` : ''}`,
      `Top banker concentration: ${c.topBankerPct}% (${c.topBankerBand})${c.topBankerLabel ? ` — ${c.topBankerLabel}` : ''}`,
      `Largest single exposure: ${money(risk.exposure.largestExposure)}`,
      `Deals above internal large-exposure threshold: ${risk.exposure.dealsAboveThresholdCount}`,
      ...(topFindings.length > 0 ? [`Top findings:`, ...topFindings] : ['No open risk findings.']),
    ],
  };
}

function buildClassificationSection(classification: RegulatoryClassificationSnapshot): PortfolioBoardPackageSection {
  return {
    key: 'regulatory-classification',
    label: 'Regulatory Classification (Illustrative — not a certified CECL/ALLL calculation)',
    lines: classification.pools.map(
      (p) =>
        `${p.classification}: ${p.loanCount} loan(s), ${money(p.totalExposure)} (${p.sharePctOfPortfolio}% of portfolio), estimated allowance ${money(p.estimatedAllowance)}`,
    ),
  };
}

function buildWatchlistSection(watchlist: WatchlistBoard): PortfolioBoardPackageSection {
  return {
    key: 'watchlist',
    label: 'Watchlist',
    lines: [
      `Total watchlist exposure: ${money(watchlist.totalExposure)}`,
      `Criticized loans: ${watchlist.criticizedCount} · Classified loans: ${watchlist.classifiedCount}`,
      `Overdue action plans: ${watchlist.actionPlansOverdue}`,
      ...watchlist.groups.map((g) => `${g.classification}: ${g.count} loan(s), ${money(g.exposure)}`),
    ],
  };
}

function buildStressTestSection(stressTest: PortfolioStressTestSnapshot): PortfolioBoardPackageSection {
  const s = stressTest;
  return {
    key: 'stress-test',
    label: `Stress Test — ${s.scenario.scenarioName} (what-if, not persisted)`,
    lines: [
      `Scenario: ${s.scenario.interestRateShockBps >= 0 ? '+' : ''}${s.scenario.interestRateShockBps}bps rate shock, ${s.scenario.collateralValueShockPct >= 0 ? '+' : ''}${s.scenario.collateralValueShockPct}% collateral value shock`,
      `Total exposure evaluated: ${money(s.totalExposure)} (${s.excludedLoanCount} excluded for missing/non-positive exposure)`,
      `High sensitivity: ${s.loanCountBySensitivity.high} loan(s), ${money(s.exposureBySensitivity.high)}`,
      `Moderate sensitivity: ${s.loanCountBySensitivity.moderate} loan(s), ${money(s.exposureBySensitivity.moderate)}`,
      `Low sensitivity: ${s.loanCountBySensitivity.low} loan(s), ${money(s.exposureBySensitivity.low)}`,
    ],
  };
}

/** Build the board package from already-computed portfolio snapshots. */
export function buildPortfolioBoardPackage(input: PortfolioBoardPackageInput): PortfolioBoardPackage {
  const sections: PortfolioBoardPackageSection[] = [
    buildExecutiveSummarySection(input),
    buildConcentrationSection(input.risk),
    buildClassificationSection(input.classification),
    buildWatchlistSection(input.watchlist),
  ];
  if (input.stressTest) sections.push(buildStressTestSection(input.stressTest));

  return {
    asOfDate: input.asOfDate,
    institutionName: input.institutionName,
    sections,
    stressTestIncluded: Boolean(input.stressTest),
  };
}

/**
 * Render the package as a downloadable CSV: one "section, line" row per
 * line, so it opens cleanly in a spreadsheet while staying a plain, honest
 * text report (this is a summary document, not a per-loan ledger).
 */
export function buildPortfolioBoardPackageCsv(pkg: PortfolioBoardPackage): string {
  const headerLine = ['Section', 'Line'].map(csvCell).join(',');
  const titleLine = [
    csvCell('Portfolio Board Package'),
    csvCell(`As of ${pkg.asOfDate}${pkg.institutionName ? ` — ${pkg.institutionName}` : ''}`),
  ].join(',');
  const rows = pkg.sections.flatMap((section) =>
    section.lines.map((line) => [csvCell(section.label), csvCell(line)].join(',')),
  );
  return [titleLine, headerLine, ...rows].join('\n') + '\n';
}
