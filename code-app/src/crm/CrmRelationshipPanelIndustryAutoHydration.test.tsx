// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * Remediation 2026-07-22 (Workstream D) — pins the fix for "the deal workspace shows Industry:
 * Other/Manual even when the linked CRM company has a valid NAICS classification, until a banker
 * manually clicks 'Check CRM industry'." The CRM/NAICS derivation logic itself was already correct
 * and governed (dealIndustryHydration.ts) -- the gap was that it only ever ran on a manual click,
 * never automatically when the workspace loaded with an already-linked client. This pins that the
 * connected container now auto-runs the same governed hydration path on mount/client-change.
 */

const mockState = vi.hoisted(() => ({
  deal: {
    id: 'd1',
    name: 'Mock Deal',
    clientName: 'Acme Holdings LLC',
    clientId: 'client-guid',
    clientLookupClassification: 'real-lookup' as const,
    industry: undefined as string | undefined,
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

const hydrateMock = vi.hoisted(() => vi.fn());
vi.mock('../deals/hydrateDealIndustryFromCrm', () => ({
  hydrateDealIndustryFromCrm: hydrateMock,
}));

import { DealCrmRelationshipPanel } from './CrmRelationshipPanel';

beforeEach(() => {
  hydrateMock.mockReset();
});

describe('DealCrmRelationshipPanel — CRM/NAICS Industry auto-hydration on load', () => {
  it('runs the governed CRM/NAICS Industry check automatically when a client is already linked -- no manual click required', async () => {
    hydrateMock.mockResolvedValue({
      hydration: {
        criterionSatisfied: true,
        source: 'crm-derived',
        status: 'CRM-derived · NAICS 311812 · Manufacturing → Manufacturing',
        unavailable: false,
      },
    });

    render(<DealCrmRelationshipPanel />);

    // No click on "Check CRM industry" happens in this test -- the status must appear on its own.
    await waitFor(() => {
      expect(hydrateMock).toHaveBeenCalledWith(
        'client-guid',
        undefined,
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/CRM-derived · NAICS 311812/)).toBeInTheDocument();
    });
  });

  it('does not call the hydration path when no CRM client is linked (honest, not fabricated)', async () => {
    mockState.deal = {
      id: 'd1',
      name: 'Mock Deal',
      clientName: undefined,
      clientId: undefined,
      industry: undefined,
    };
    render(<DealCrmRelationshipPanel />);

    // Give any stray microtask a chance to run, then confirm it never fired.
    await new Promise((r) => setTimeout(r, 0));
    expect(hydrateMock).not.toHaveBeenCalled();
  });
});
