// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrmIntelligencePanel } from './CrmIntelligencePanel';
import type { CrmIntelligenceLoader } from './loadCrmIntelligence';

const readyLoader: CrmIntelligenceLoader = async () => ({
  status: 'ready',
  data: {
    companies: [{ naicsCode: '722511' }, { naicsCode: '236220' }],
    advisorLinks: [
      { advisorOrgId: 'cpa', advisorName: 'Smith CPA', role: 'CPA / Accountant', clientOrgId: 'acme', clientName: 'Acme LLC' },
    ],
  },
});

const unavailableLoader: CrmIntelligenceLoader = async () => ({
  status: 'unavailable',
  reason: 'CRM services are not available in this environment yet.',
});

describe('CrmIntelligencePanel', () => {
  it('renders the concentration view from a governed read', async () => {
    render(<CrmIntelligencePanel loader={readyLoader} />);
    expect(await screen.findByText('Accommodation and Food Services')).toBeInTheDocument();
    expect(screen.getByText('Construction')).toBeInTheDocument();
  });

  it('shows an honest unavailable state when reads are not provisioned', async () => {
    render(<CrmIntelligencePanel loader={unavailableLoader} />);
    expect(await screen.findByText(/CRM intelligence is unavailable/i)).toBeInTheDocument();
  });

  it('always renders its header (never blank while loading)', () => {
    render(<CrmIntelligencePanel loader={() => new Promise(() => {})} />);
    expect(screen.getByText('CRM Intelligence')).toBeInTheDocument();
  });
});
