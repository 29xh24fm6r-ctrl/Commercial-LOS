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
  it('renders the panel marked Active with the governed-persistence status note', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    expect(
      screen.getByRole('region', { name: 'Portfolio Boarding' }),
    ).toBeInTheDocument();
    // Live persistence is ON (Phase 256B) -> the badge reads Active.
    expect(screen.getByText('Active')).toBeInTheDocument();
    const note = container.querySelector('[data-admin-portfolio-status-note]');
    expect(note?.textContent).toMatch(/governed and audited/i);
    expect(note?.textContent).toMatch(/No external boarding sync/i);
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

  it('exposes a real Open Portfolio workspace link (no disabled placeholders) when active', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    const open = container.querySelector('[data-admin-portfolio-action="open"]');
    expect(open).not.toBeNull();
    expect(open?.getAttribute('href')).toBe('/workspaces/manager');
    // No stale disabled create/import/upload placeholders.
    expect(screen.queryByText('Portfolio create disabled')).toBeNull();
    expect(screen.queryByText('Import disabled')).toBeNull();
  });

  it('points boarding actions to the Portfolio workspace (not this console)', () => {
    const { container } = render(<PortfolioBoardingAdminPanel />);
    const note = container.querySelector('[data-admin-portfolio-no-record-note]');
    expect(note?.textContent).toMatch(/performed from the Portfolio workspace/i);
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
