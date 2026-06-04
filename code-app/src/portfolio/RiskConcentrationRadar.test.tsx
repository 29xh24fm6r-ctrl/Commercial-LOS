// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RiskConcentrationRadar } from './RiskConcentrationRadar';
import { derivePortfolioCommandSnapshot } from './portfolioCommandSnapshot';
import { derivePortfolioRiskSnapshot } from './portfolioRiskEngine';
import type { TeamDeal, TeamBanker } from '../manager/managerQueries';

/**
 * Phase 132A — RiskConcentrationRadar render + read-only governance.
 */

const NOW = new Date('2026-06-03T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function deal(over: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-default',
    name: 'Default deal',
    clientName: 'Default client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(60),
    stageEntryDate: isoDaysAgo(7),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'banker-a',
    assignedBankerName: 'Banker A',
    collateralSummary: undefined,
    productType: 'SBA 7(a)',
    loanStructure: 'Term Loan',
    pricingType: 'Variable',
    ...over,
  };
}

const BANKER: TeamBanker = {
  id: 'banker-a',
  fullName: 'Banker A',
  email: 'a@oldglorybank.com',
  roleType: 'CommercialBanker',
  active: true,
};

function renderRadar(deals: TeamDeal[]) {
  const command = derivePortfolioCommandSnapshot({
    teamPipeline: deals,
    teamBankers: [BANKER],
    teamTasks: [],
    teamDocuments: [],
    now: NOW,
  });
  const risk = derivePortfolioRiskSnapshot(command, { now: NOW });
  return render(
    <MemoryRouter>
      <RiskConcentrationRadar risk={risk} />
    </MemoryRouter>,
  );
}

describe('Phase 132A — radar renders', () => {
  it('renders the Risk & Concentration Radar section with the 8 cards', () => {
    renderRadar([
      deal({ id: 'a', clientName: 'Alpha', amount: 8_000_000 }),
      deal({ id: 'b', clientName: 'Beta', amount: 2_000_000 }),
    ]);
    expect(
      screen.getByRole('region', { name: /Risk and Concentration Radar/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Largest exposure')).toBeInTheDocument();
    expect(screen.getByText('Single-name concentration')).toBeInTheDocument();
    expect(screen.getByText('Top-5 concentration')).toBeInTheDocument();
    expect(screen.getByText('Product concentration')).toBeInTheDocument();
    expect(screen.getByText('Banker concentration')).toBeInTheDocument();
    expect(screen.getByText('Operational bottlenecks')).toBeInTheDocument();
    expect(screen.getByText('Data quality')).toBeInTheDocument();
    expect(screen.getByText('Closing pressure')).toBeInTheDocument();
  });

  it('renders the honest non-regulatory disclaimer copy', () => {
    renderRadar([deal({ id: 'a', clientName: 'Alpha', amount: 8_000_000 })]);
    expect(
      screen.getByText(
        /Policy bands are operational indicators, not regulatory classifications\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Legal lending limit, covenant, yield, CECL\/ALLL, criticized\/classified asset/,
      ),
    ).toBeInTheDocument();
  });

  it('renders a deal-anchored finding as a navigation link (not a button)', () => {
    renderRadar([
      // Large + stale → high-severity, deal-anchored finding.
      deal({
        id: 'big',
        name: 'BigStale',
        clientName: 'Alpha',
        amount: 9_000_000,
        modifiedOn: isoDaysAgo(40),
      }),
    ]);
    const link = screen.getByText(/Stale high-dollar deal: BigStale/);
    expect(link.getAttribute('href')).toBe('/deals/big');
  });
});

describe('Phase 132A — radar is read-only (no write affordances)', () => {
  const src = readFileSync(
    resolve(__dirname, 'RiskConcentrationRadar.tsx'),
    'utf8',
  );
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('has no <button> / <form> / onClick / onSubmit', () => {
    expect(code).not.toMatch(/<button\b/i);
    expect(code).not.toMatch(/<form\b/i);
    expect(code).not.toMatch(/\bonClick\b/);
    expect(code).not.toMatch(/\bonSubmit\b/);
  });

  it('imports no generated service / email / write surface', () => {
    expect(code).not.toMatch(/from ['"]\.\.\/generated\//);
    expect(code).not.toMatch(/SendEmailV2|Office365/);
  });
});
