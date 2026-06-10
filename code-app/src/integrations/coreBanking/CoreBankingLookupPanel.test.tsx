// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoreBankingLookupPanel } from './CoreBankingLookupPanel';
import { prepareCoreBankingLookupRequest, submitCoreBankingLookup } from './coreBankingLookupAdapter';

const CLOCK = '2026-06-10T00:00:00.000Z';
const RESULT = submitCoreBankingLookup(prepareCoreBankingLookupRequest({ dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', borrowerLabel: 'Primary borrower', lookupKind: 'borrower_relationship', requestedByDisplayName: 'admin-1', requestedAt: CLOCK }));
const IDENTITY = { dealName: 'Deal One', clientName: 'Client A', borrowerLabel: 'Primary borrower', lookupKind: 'borrower_relationship' as const };

describe('Phase 142P — CoreBankingLookupPanel', () => {
  it('renders the title and disabled-by-default status', () => {
    render(<CoreBankingLookupPanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('Core Banking Lookup Adapter')).toBeTruthy();
    expect(screen.getByText('Disabled by default')).toBeTruthy();
  });

  it('renders the not-enabled body copy', () => {
    render(<CoreBankingLookupPanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getAllByText(/Core banking read-only lookup is not enabled/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the deal / client / borrower / lookup summary', () => {
    render(<CoreBankingLookupPanel identity={IDENTITY} result={RESULT} />);
    expect(screen.getByText('Deal')).toBeTruthy();
    expect(screen.getByText('Borrower')).toBeTruthy();
    expect(screen.getByText('Lookup kind')).toBeTruthy();
    expect(screen.getByText(/Live lookup performed: false/)).toBeTruthy();
  });

  it('renders an honest empty state when no identity is provided', () => {
    render(<CoreBankingLookupPanel />);
    expect(screen.getByText(/No deal identity provided/i)).toBeTruthy();
  });

  it('exposes no lookup / search / retrieve / verify / sync / refresh / open-account / transfer / approve / deny / vote buttons or forms', () => {
    const { container } = render(<CoreBankingLookupPanel identity={IDENTITY} result={RESULT} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['search core', 'retrieve customer', 'verify customer', 'sync core', 'refresh core', 'open account', 'transfer funds', 'approve package', 'deny package', 'cast vote', 'core match found', 'balance retrieved']) {
      expect(text).not.toContain(w);
    }
  });

  it('renders no external URL', () => {
    const { container } = render(<CoreBankingLookupPanel identity={IDENTITY} result={RESULT} />);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
