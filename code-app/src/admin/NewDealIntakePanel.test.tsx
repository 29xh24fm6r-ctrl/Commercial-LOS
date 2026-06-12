// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { NewDealIntakePanel } from './NewDealIntakePanel';

/**
 * Phase 169C -- New Deal Intake panel (blocker/preview only).
 */

describe('Phase 169C -- New Deal Intake panel', () => {
  it('renders the panel marked Blocked with the Phase 163 blocker', () => {
    const { container } = render(<NewDealIntakePanel />);
    expect(
      screen.getByRole('region', { name: 'New Deal Intake' }),
    ).toBeInTheDocument();
    const blocker = container.querySelector('[data-admin-new-deal-blocker]');
    expect(blocker?.textContent).toMatch(/Stage\/Status reference data source registration is missing/i);
  });

  it('shows the required future fields including the blocked Stage and Status', () => {
    const { container } = render(<NewDealIntakePanel />);
    const fields = container.querySelector('[data-admin-new-deal-fields]') as HTMLElement;
    for (const label of [
      'Deal Name',
      'Client / Borrower',
      'Assigned Banker',
      'Amount',
      'Stage',
      'Status',
      'Product Type',
      'Loan Structure',
      'Pricing',
    ]) {
      expect(within(fields).getByText(label)).toBeInTheDocument();
    }
    // The Stage/Status rows carry the required odata binds.
    expect(within(fields).getByText('cr664_StageReference@odata.bind')).toBeInTheDocument();
    expect(within(fields).getByText('cr664_StatusReference@odata.bind')).toBeInTheDocument();
  });

  it('shows the five-step Stage/Status registration checklist', () => {
    const { container } = render(<NewDealIntakePanel />);
    const checklist = container.querySelector('[data-admin-new-deal-checklist]') as HTMLElement;
    expect(checklist.querySelectorAll('li').length).toBe(5);
    expect(within(checklist).getByText(/Add a fail-closed default resolver/i)).toBeInTheDocument();
  });

  it('keeps the Create action disabled (no live create)', () => {
    const { container } = render(<NewDealIntakePanel />);
    const create = container.querySelector('[data-admin-new-deal-create]') as HTMLButtonElement;
    expect(create).not.toBeNull();
    expect(create).toBeDisabled();
    expect(create.getAttribute('aria-disabled')).toBe('true');
  });

  it('notes that the + New Deal button remains disabled for the same reason', () => {
    const { container } = render(<NewDealIntakePanel />);
    const footnote = container.querySelector('[data-admin-new-deal-footnote]');
    expect(footnote?.textContent).toMatch(/\+ New Deal button elsewhere in the app remains disabled/i);
  });

  it('has no enabled button in the panel', () => {
    const { container } = render(<NewDealIntakePanel />);
    for (const b of Array.from(container.querySelectorAll('button'))) {
      expect(b).toBeDisabled();
    }
  });
});

describe('Phase 169C -- panel source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'NewDealIntakePanel.tsx'), 'utf8');

  it('introduces no fetch / XHR / Graph / Dataverse write/create and no GUID', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
