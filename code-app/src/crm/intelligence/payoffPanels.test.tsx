// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IndustryConcentrationPanel } from './IndustryConcentrationPanel';
import { AdvisorsOnClientPanel, AdvisorReachPanel } from './AdvisorPanels';
import type { AdvisorLink } from '../advisors/advisorViewModel';

describe('IndustryConcentrationPanel', () => {
  it('renders an honest empty state with no companies', () => {
    render(<IndustryConcentrationPanel companies={[]} />);
    expect(screen.getByText(/No companies to compare yet/i)).toBeInTheDocument();
  });

  it('renders sectors with counts and % of book; flags unclassified + exposure-not-linked', () => {
    render(
      <IndustryConcentrationPanel
        companies={[{ naicsCode: '722511' }, { naicsCode: '722513' }, { naicsCode: '236220' }, {}]}
      />,
    );
    expect(screen.getByText('Accommodation and Food Services')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument(); // 2 of 4
    expect(screen.getByText(/1 unclassified/)).toBeInTheDocument();
    expect(screen.getByText(/exposure not linked yet/)).toBeInTheDocument();
    expect(screen.queryByText('Exposure')).toBeNull(); // no exposure column without exposure
  });

  it('shows the exposure column when exposure is linked', () => {
    render(<IndustryConcentrationPanel companies={[{ naicsCode: '722511', exposure: 1000000 }]} />);
    expect(screen.getByText('Exposure')).toBeInTheDocument();
    expect(screen.getByText('$1,000,000')).toBeInTheDocument();
  });
});

const LINKS: AdvisorLink[] = [
  { advisorOrgId: 'smith', advisorName: 'Smith CPA', role: 'CPA / Accountant', clientOrgId: 'acme', clientName: 'Acme LLC' },
  { advisorOrgId: 'metro', advisorName: 'Metro CDC', role: 'CDC (Certified Development Company)', clientOrgId: 'acme', clientName: 'Acme LLC', dealId: 'd1', dealName: 'Acme 504' },
];

describe('AdvisorsOnClientPanel', () => {
  it('lists advisors + roles, honest empty otherwise', () => {
    const { rerender } = render(<AdvisorsOnClientPanel advisors={LINKS} />);
    expect(screen.getByText('Smith CPA')).toBeInTheDocument();
    expect(screen.getByText('CDC (Certified Development Company)')).toBeInTheDocument();
    expect(screen.getByText(/on deal Acme 504/)).toBeInTheDocument();
    rerender(<AdvisorsOnClientPanel advisors={[]} clientName="Acme LLC" />);
    expect(screen.getByText(/No advisors linked yet/i)).toBeInTheDocument();
  });
});

describe('AdvisorReachPanel', () => {
  it('lists the clients/deals an advisor touches', () => {
    render(<AdvisorReachPanel links={[LINKS[1]]} advisorName="Metro CDC" />);
    expect(screen.getByText('Acme LLC')).toBeInTheDocument();
    expect(screen.getByText(/deal Acme 504/)).toBeInTheDocument();
  });
});
