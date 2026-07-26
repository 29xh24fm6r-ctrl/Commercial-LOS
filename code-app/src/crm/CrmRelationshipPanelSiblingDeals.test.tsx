// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Remediation 2026-07-22 (Workstream D) — pins the fix for "sibling deals shown in Deal
 * Relationship match CRM linked deals." The Deal Workspace now surfaces the SAME authoritative,
 * ID-based sibling-deal list the CRM Hub already resolves (dealCrmSiblingDeals.ts reuses
 * crmLinkedDeals.ts's real relationship-key matching) -- never a separate, fragile display-name
 * match.
 */

const mockState = vi.hoisted(() => ({
  deal: {
    id: 'current-deal',
    name: 'Mock Deal',
    clientName: 'Acme Holdings LLC',
    clientId: 'client-guid',
    clientLookupClassification: 'real-lookup' as const,
    amount: 1_000_000,
  } as Record<string, unknown>,
}));

vi.mock('../deals/DealDataProvider', () => ({
  useDealData: () => ({ deal: mockState.deal, applyVerifiedDealPatch: vi.fn() }),
}));
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: () => ({
    bankerId: 'b1',
    fullName: 'Mock Banker',
    email: 'b@x.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  }),
}));
vi.mock('../deals/hydrateDealIndustryFromCrm', () => ({
  refreshDealIndustryFromCrm: vi.fn().mockResolvedValue({
    decision: { action: 'unresolved', source: 'none', status: 'unresolved', unavailable: true },
  }),
}));

const siblingMock = vi.hoisted(() => vi.fn());
vi.mock('../deals/dealCrmSiblingDeals', () => ({
  loadLiveDealCrmSiblingDeals: siblingMock,
}));

import { DealCrmRelationshipPanel } from './CrmRelationshipPanel';

beforeEach(() => {
  siblingMock.mockReset();
});

function renderPanel(onNavigateToDeal?: (dealId: string) => void) {
  return render(<DealCrmRelationshipPanel onNavigateToDeal={onNavigateToDeal} />);
}

describe('DealCrmRelationshipPanel — authoritative CRM sibling deals', () => {
  it('shows the same sibling deals the CRM Hub resolves, and the total relationship exposure includes the current deal', async () => {
    siblingMock.mockResolvedValue({
      status: 'ready',
      siblingDeals: [
        { id: 'sib-1', name: 'Acme Working Capital', stage: 'Underwriting', amount: '$500,000', amountValue: 500_000 },
      ],
      totalRelationshipExposure: 1_500_000,
      exposureIncomplete: false,
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Acme Working Capital')).toBeInTheDocument();
    });
    // The current deal itself must never appear as its own "sibling".
    expect(screen.queryByText('Mock Deal')).toBeNull();
    expect(screen.getByText('$1,500,000')).toBeInTheDocument();
    expect(siblingMock).toHaveBeenCalledWith('current-deal', 1_000_000, 'client-guid');
  });

  it('D16 — clicking a sibling deal invokes onNavigateToDeal with the correct deal id (not a dead link)', async () => {
    siblingMock.mockResolvedValue({
      status: 'ready',
      siblingDeals: [
        { id: 'sib-1', name: 'Acme Working Capital', stage: 'Underwriting', amount: '$500,000', amountValue: 500_000 },
        { id: 'sib-2', name: 'Acme Equipment Loan', stage: 'Intake', amount: '$250,000', amountValue: 250_000 },
      ],
      totalRelationshipExposure: 1_750_000,
      exposureIncomplete: false,
    });
    const onNavigateToDeal = vi.fn();
    renderPanel(onNavigateToDeal);
    await waitFor(() => expect(screen.getByText('Acme Equipment Loan')).toBeInTheDocument());
    const user = userEvent.setup();
    // Two distinct sibling deals present — clicking the SECOND proves correct-id navigation,
    // not just "some navigation happened".
    await user.click(screen.getByText('Acme Equipment Loan'));
    expect(onNavigateToDeal).toHaveBeenCalledWith('sib-2');
    expect(onNavigateToDeal).not.toHaveBeenCalledWith('sib-1');
  });

  it('D16 — sibling-deal rows render non-interactively when onNavigateToDeal is not supplied (backward compatible)', async () => {
    siblingMock.mockResolvedValue({
      status: 'ready',
      siblingDeals: [
        { id: 'sib-1', name: 'Acme Working Capital', stage: 'Underwriting', amount: '$500,000', amountValue: 500_000 },
      ],
      totalRelationshipExposure: 1_500_000,
      exposureIncomplete: false,
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText('Acme Working Capital')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Open deal Acme Working Capital/ })).toBeNull();
  });

  it('flags incomplete exposure honestly rather than showing a fabricated total', async () => {
    siblingMock.mockResolvedValue({
      status: 'ready',
      siblingDeals: [],
      totalRelationshipExposure: 1_000_000,
      exposureIncomplete: true,
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/incomplete/i)).toBeInTheDocument();
    });
  });

  it('shows an honest unresolved note when the client is not bridged to a CRM organization', async () => {
    siblingMock.mockResolvedValue({ status: 'no-org-link' });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/not bridged to a CRM company/i)).toBeInTheDocument();
    });
  });
});
