// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductProfitabilityAvailabilityPanel } from './ProductProfitabilityAvailabilityPanel';
import { deriveProductProfitabilityAvailability } from './productProfitabilityAvailabilityModel';

const SUMMARY = deriveProductProfitabilityAvailability({
  dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', productType: 'commercial', loanStructure: 'term_loan', pricingType: 'fixed',
  interestRateAvailable: true, feeIncomeAvailable: true,
});

describe('Phase 142S — ProductProfitabilityAvailabilityPanel', () => {
  it('renders the title and availability-model-only status', () => {
    render(<ProductProfitabilityAvailabilityPanel summary={SUMMARY} />);
    expect(screen.getByText('Product Profitability / ROE Availability')).toBeTruthy();
    expect(screen.getByText('Availability model only')).toBeTruthy();
  });

  it('renders the no-calculation body copy', () => {
    render(<ProductProfitabilityAvailabilityPanel summary={SUMMARY} />);
    expect(screen.getByText(/are not calculated here\. This panel only shows whether the required source data/i)).toBeTruthy();
  });

  it('shows the deal / product / loan / pricing summary and availability status', () => {
    render(<ProductProfitabilityAvailabilityPanel summary={SUMMARY} />);
    expect(screen.getByText('Product type')).toBeTruthy();
    expect(screen.getByText('Availability status')).toBeTruthy();
    expect(screen.getByText('Missing source data')).toBeTruthy();
  });

  it('renders an honest unavailable state when no summary is provided', () => {
    render(<ProductProfitabilityAvailabilityPanel />);
    expect(screen.getByText(/Profitability availability data is unavailable/i)).toBeTruthy();
  });

  it('exposes no calculate / recommend / optimize / approve / deny / vote buttons or forms', () => {
    const { container } = render(<ProductProfitabilityAvailabilityPanel summary={SUMMARY} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['calculate roe', 'calculate profitability', 'recommend pricing', 'optimize portfolio', 'approve package', 'deny package', 'cast vote']) {
      expect(text).not.toContain(w);
    }
  });

  it('shows no fake profitability / ROE / yield / margin / fee figures or fact labels', () => {
    const { container } = render(<ProductProfitabilityAvailabilityPanel summary={SUMMARY} />);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['unprofitable', 'high roe', 'low roe', 'roe of', 'yield of', 'margin of']) {
      expect(text).not.toContain(w);
    }
    expect(container.innerHTML).not.toMatch(/\$\s*\d/);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
