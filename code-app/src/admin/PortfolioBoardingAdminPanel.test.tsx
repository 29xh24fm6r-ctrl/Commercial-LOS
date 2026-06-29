// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { PortfolioBoardingAdminPanel } from './PortfolioBoardingAdminPanel';

/**
 * Phase 169D -- Portfolio Boarding admin panel (Case B, disabled-by-default).
 */

describe('Phase 169D -- Portfolio Boarding admin panel', () => {
  it('renders the panel marked Disabled by default with the fail-closed status note', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    expect(
      screen.getByRole('region', { name: 'Portfolio Boarding' }),
    ).toBeInTheDocument();
    // Completion Phase A reset portfolio boarding live persistence to its safe default (off)
    // -> the badge falls back to the honest disabled-by-default state.
    expect(screen.getByText('Disabled by default')).toBeInTheDocument();
    expect(screen.queryByText('Active')).toBeNull();
    const note = container.querySelector('[data-admin-portfolio-status-note]');
    expect(note?.textContent).toMatch(/Disabled by default/i);
    expect(note?.textContent).toMatch(/fails closed/i);
  });

  it('shows all nine required data groups', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    const groups = container.querySelector('[data-admin-portfolio-data-groups]') as HTMLElement;
    expect(groups.querySelectorAll('li').length).toBe(9);
    for (const label of [
      'Loan master',
      'Borrower',
      'Collateral',
      'Guarantors',
      'Covenants',
      'Ticklers',
      'Insurance',
      'Documents / evidence references',
      'Exceptions / reviews',
    ]) {
      expect(within(groups).getByText(label)).toBeInTheDocument();
    }
  });

  it('shows readiness (adapter present) and the five next safe steps', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    expect(container.querySelector('[data-admin-portfolio-readiness]')).not.toBeNull();
    const steps = container.querySelector('[data-admin-portfolio-next-steps]') as HTMLElement;
    expect(steps.querySelectorAll('li').length).toBe(5);
  });

  it('exposes no live Open Portfolio workspace link and surfaces the disabled create/import/upload placeholders', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    // Live persistence is safe-default off, so no active workspace link is fabricated.
    const open = container.querySelector('[data-admin-portfolio-action="open"]');
    expect(open).toBeNull();
    // The honest disabled-by-default state surfaces gated create/import/upload placeholders.
    expect(screen.getByText('Portfolio create disabled')).toBeInTheDocument();
    expect(screen.getByText('Import disabled')).toBeInTheDocument();
    expect(screen.getByText('Document upload disabled')).toBeInTheDocument();
  });

  it('states no portfolio loan record is created until live persistence is enabled', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    const note = container.querySelector('[data-admin-portfolio-no-record-note]');
    expect(note?.textContent).toMatch(/does not create portfolio loan records/i);
    expect(note?.textContent).toMatch(/until live persistence is explicitly enabled/i);
  });

  it('renders no fabricated loan / document / evidence record', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['loan boarded', 'record created', 'uploaded successfully', 'imported successfully']) {
      expect(text).not.toContain(banned);
    }
  });

  it('has no enabled button anywhere in the panel', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    for (const b of Array.from(container.querySelectorAll('button'))) {
      expect(b).toBeDisabled();
    }
  });
});

describe('Phase 169D -- panel source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'PortfolioBoardingAdminPanel.tsx'), 'utf8');

  it('introduces no fetch / XHR / Graph / Dataverse write/create and no GUID', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
