// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';

// The Phase 170H readiness card reads the typed Stage/Status data sources
// on mount; mock the reader so panel tests stay deterministic and never
// load the generated services / hit a live data source.
vi.mock('../deals/newDealReferenceReader', () => ({
  resolveConfiguredNewDealReferences: vi
    .fn()
    .mockResolvedValue({ kind: 'notConfigured', reason: 'mocked in panel test' }),
}));

import { NewDealIntakePanel } from './NewDealIntakePanel';

/**
 * Phase 170J -- New Deal Intake panel (reconciled readiness truth).
 */

describe('Phase 170J -- New Deal Intake panel', () => {
  it('renders the panel marked Create disabled with the reconciled status, not a missing-data-source claim', () => {
    const { container } = render(<NewDealIntakePanel />);
    expect(
      screen.getByRole('region', { name: 'New Deal Intake' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Create disabled')).toBeInTheDocument();
    const blocker = container.querySelector('[data-admin-new-deal-blocker]');
    expect(blocker?.textContent).toMatch(/READY in TEST/i);
    expect(blocker?.textContent).not.toMatch(/data source registration is missing/i);
    expect(blocker?.textContent).toMatch(/production-approved/i);
    expect(blocker?.textContent).toMatch(/Advance Stage|stage-progression/i);
  });

  it('shows the reconciled readiness truth table (Ready(TEST) / Pending / Not wired / Enabled)', () => {
    const { container } = render(<NewDealIntakePanel />);
    const truth = container.querySelector('[data-admin-new-deal-truth]') as HTMLElement;
    expect(truth).not.toBeNull();
    expect(within(truth).getByText('Stage/Status resolver readiness')).toBeInTheDocument();
    expect(within(truth).getByText('Ready (TEST)')).toBeInTheDocument();
    expect(within(truth).getByText('Production reference approval')).toBeInTheDocument();
    expect(within(truth).getByText('Pending')).toBeInTheDocument();
    expect(within(truth).getByText('Governed create adapter')).toBeInTheDocument();
    expect(within(truth).getByText('Not wired')).toBeInTheDocument();
    expect(within(truth).getByText('Public + New Deal')).toBeInTheDocument();
    expect(within(truth).getByText('Enabled')).toBeInTheDocument();
  });

  it('shows the required future fields including Stage and Status (now Ready, not Blocked)', () => {
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
    // No field renders the "Blocked" reference state any more.
    expect(within(fields).queryByText('Blocked')).toBeNull();
  });

  it('shows the Phase 170D confirmed live reference targets, now registered (Ready in TEST)', () => {
    const { container } = render(<NewDealIntakePanel />);
    const targets = container.querySelector('[data-admin-new-deal-targets]') as HTMLElement;
    expect(targets).not.toBeNull();
    expect(within(targets).getByText('cr664_dealstagereferences')).toBeInTheDocument();
    expect(within(targets).getByText('cr664_dealstatusreferences')).toBeInTheDocument();
    expect(within(targets).getByText('cr664_dealstagereferenceid')).toBeInTheDocument();
    expect(within(targets).getByText('cr664_dealstatusreferenceid')).toBeInTheDocument();
    const note = container.querySelector('[data-admin-new-deal-targets-note]');
    expect(note?.textContent).toMatch(/registered as native app data sources/i);
    expect(note?.textContent).toMatch(/Ready in\s+TEST/i);
    expect(note?.textContent).toMatch(/inspect-new-deal-references/i);
  });

  it('marks the reference/resolver/runtime steps done and leaves production/adapter/create/enable pending', () => {
    const { container } = render(<NewDealIntakePanel />);
    const checklist = container.querySelector('[data-admin-new-deal-checklist]') as HTMLElement;
    const items = Array.from(checklist.querySelectorAll('li'));
    expect(items.length).toBe(9);
    for (const i of [0, 1, 2, 3, 4]) expect(items[i].getAttribute('data-done')).toBe('true');
    for (const i of [5, 6, 7, 8]) expect(items[i].getAttribute('data-done')).toBe('false');
  });

  it('shows the enablement checklist with resolver and create-adapter steps', () => {
    const { container } = render(<NewDealIntakePanel />);
    const checklist = container.querySelector('[data-admin-new-deal-checklist]') as HTMLElement;
    expect(
      within(checklist).getByText(/--inspect-new-deal-references/i),
    ).toBeInTheDocument();
    expect(within(checklist).getByText(/Add a fail-closed default resolver/i)).toBeInTheDocument();
    expect(within(checklist).getByText(/governed, audited create adapter/i)).toBeInTheDocument();
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
