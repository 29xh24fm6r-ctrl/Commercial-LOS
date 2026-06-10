// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServicingLifecycleMapperPanel } from './ServicingLifecycleMapperPanel';
import { deriveServicingLifecycleProjection } from './servicingLifecycleMapper';

const PROJECTION = deriveServicingLifecycleProjection({
  dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', borrowerLabel: 'Primary borrower', bankerName: 'Banker B',
  status: 'closed', stage: 'closed', productType: 'commercial', loanStructure: 'term_loan', pricingType: 'fixed',
  amount: 250000, maturityDate: '2031-01-01', actualCloseDate: '2026-01-15', memoGeneratedAt: '2025-12-01',
});
const INCOMPLETE = deriveServicingLifecycleProjection({ dealId: 'D2', dealName: 'Deal Two', status: 'closed', stage: 'closed' });

describe('Phase 142R — ServicingLifecycleMapperPanel', () => {
  it('renders the title and read-only projection status', () => {
    render(<ServicingLifecycleMapperPanel projection={PROJECTION} />);
    expect(screen.getByText('Servicing Lifecycle Read-only Mapper')).toBeTruthy();
    expect(screen.getByText('Read-only projection')).toBeTruthy();
  });

  it('renders the no-boarding / no-sync body copy', () => {
    render(<ServicingLifecycleMapperPanel projection={PROJECTION} />);
    expect(screen.getByText(/No loan is boarded, no payment schedule is generated, no core banking sync occurs/i)).toBeTruthy();
  });

  it('shows the deal / client / borrower / banker summary and loan snapshot', () => {
    render(<ServicingLifecycleMapperPanel projection={PROJECTION} />);
    expect(screen.getByText('Deal')).toBeTruthy();
    expect(screen.getByText('Loan snapshot')).toBeTruthy();
    expect(screen.getByText(/Boarding performed: false/)).toBeTruthy();
  });

  it('shows missing fields and warnings for an incomplete deal', () => {
    render(<ServicingLifecycleMapperPanel projection={INCOMPLETE} />);
    expect(screen.getByText('Missing boarding-review fields')).toBeTruthy();
  });

  it('renders an honest unavailable state when no projection is provided', () => {
    render(<ServicingLifecycleMapperPanel />);
    expect(screen.getByText(/Servicing lifecycle data is unavailable/i)).toBeTruthy();
  });

  it('exposes no board / sync / generate / create / mark / send / notify / approve / deny / vote buttons or forms', () => {
    const { container } = render(<ServicingLifecycleMapperPanel projection={PROJECTION} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['board loan', 'sync to core', 'generate schedule', 'create servicing record', 'mark current', 'mark delinquent', 'send statement', 'notify borrower', 'approve package', 'deny package', 'cast vote']) {
      expect(text).not.toContain(w);
    }
  });

  it('shows no fake active-servicing / boarded / current / delinquent / defaulted status and no external URL', () => {
    const { container } = render(<ServicingLifecycleMapperPanel projection={PROJECTION} />);
    const text = (container.textContent ?? '').toLowerCase();
    // The spec-mandated banner legitimately disclaims "No loan is boarded ...";
    // forbid only AFFIRMATIVE fact claims of servicing state.
    for (const w of ['active servicing', 'loan is now boarded', 'has been boarded', 'currently delinquent', 'in default', 'marked current', 'marked delinquent']) {
      expect(text).not.toContain(w);
    }
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
