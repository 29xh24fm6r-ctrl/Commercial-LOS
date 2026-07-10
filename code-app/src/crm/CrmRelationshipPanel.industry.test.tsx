// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Deal Workspace — CRM link → governed Industry hydration wiring.
 *
 * Pins the connected panel's behaviour AFTER a client link:
 *   - the whole cockpit is refreshed (applyVerifiedDealPatch with the verified
 *     clientId/clientName), not just this panel's local state — the core bug fix;
 *   - a valid CRM NAICS auto-hydrates the deal Industry (verified patch merged,
 *     no full reload) so the banker need not re-enter it;
 *   - a linked company with no NAICS leaves the Intake criterion unresolved and
 *     surfaces a DIRECT remediation to the CRM NAICS editor, plus a no-reload
 *     re-check that re-runs the governed derivation.
 *
 * The derivation itself (deriveDealIndustryHydration / hydrateDealIndustryFromCrm)
 * has its own unit tests; here it is mocked at the boundary so we drive the WIRING.
 */

const mockState = vi.hoisted(() => ({
  deal: { id: 'd1', name: 'Acme Term Loan' } as Record<string, unknown>,
  banker: null as Record<string, unknown> | null,
  applyVerifiedDealPatch: vi.fn(),
}));

vi.mock('../deals/DealDataProvider', () => ({
  useDealData: () => ({
    deal: mockState.deal,
    applyVerifiedDealPatch: mockState.applyVerifiedDealPatch,
  }),
}));
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: () => mockState.banker,
}));

const linkMock = vi.hoisted(() => vi.fn());
vi.mock('./write/linkDealCrmEntity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./write/linkDealCrmEntity')>();
  return { ...actual, linkDealCrmEntity: linkMock, buildLiveLinkDealCrmEntityDeps: () => ({}) };
});

const loadClientsMock = vi.hoisted(() => vi.fn());
const loadTeamsMock = vi.hoisted(() => vi.fn());
vi.mock('./dealCrmLinkOptions', () => ({
  loadClientLinkTargetOptions: loadClientsMock,
  loadClientRelationshipOptions: loadClientsMock,
  loadTeamOptions: loadTeamsMock,
  CRM_COMPANY_OPTION_SUBLABEL: 'CRM Company — will create/link borrower client record',
}));

const bridgeMock = vi.hoisted(() => vi.fn());
vi.mock('./write/bridgeOrgToClientRelationship', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./write/bridgeOrgToClientRelationship')>();
  return { ...actual, bridgeOrgToClientRelationship: bridgeMock, buildLiveBridgeOrgToClientDeps: () => ({}) };
});

// The governed CRM/NAICS → Industry orchestrator, mocked at the boundary so each
// test controls the derived outcome (SDK-free, deterministic).
const hydrateMock = vi.hoisted(() => vi.fn());
vi.mock('../deals/hydrateDealIndustryFromCrm', () => ({
  hydrateDealIndustryFromCrm: hydrateMock,
}));

import { DealCrmRelationshipPanel } from './CrmRelationshipPanel';

const AUTHORIZED_BANKER = {
  bankerId: 'b1',
  fullName: 'Dana Banker',
  email: 'dana@bank.com',
  systemUserId: 'sys-1',
  writeDisabledReason: undefined,
};

async function linkAcme() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Link a canonical CRM client/i }));
  await user.type(document.querySelector('[data-link-crm-search]') as HTMLInputElement, 'Acme');
  await user.click(await screen.findByRole('option', { name: /Acme Holdings LLC/i }));
  await user.click(screen.getByRole('button', { name: /^Link client$/i }));
  await screen.findByText(/Client linked/i);
  await user.click(screen.getByRole('button', { name: /^Close$/i }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.deal = { id: 'd1', name: 'Acme Term Loan' };
  mockState.banker = { ...AUTHORIZED_BANKER };
  mockState.applyVerifiedDealPatch = vi.fn();
  loadClientsMock.mockResolvedValue([
    { id: 'client-guid-1', name: 'Acme Holdings LLC', sublabel: 'LLC', active: true },
  ]);
  loadTeamsMock.mockResolvedValue([]);
  linkMock.mockResolvedValue({
    kind: 'success',
    dealId: 'd1',
    target: 'client',
    entityId: 'client-guid-1',
    entityName: 'Acme Holdings LLC',
    correlationId: 'corr-1',
    auditId: 'audit-1',
  });
});

describe('DealCrmRelationshipPanel — CRM link → governed Industry hydration', () => {
  it('refreshes the whole cockpit AND auto-hydrates a valid CRM-derived Industry on link', async () => {
    hydrateMock.mockResolvedValue({
      hydration: {
        criterionSatisfied: true,
        source: 'crm-derived',
        status: 'CRM-derived · NAICS 561110 · Administrative → Other',
        unavailable: false,
      },
      appliedPatch: { industry: 'Other' },
    });

    render(<DealCrmRelationshipPanel />);
    await linkAcme();

    // CORE FIX: the deal now points at the client — the cockpit is refreshed with
    // the verified clientId/clientName, not only this panel's local state.
    expect(mockState.applyVerifiedDealPatch).toHaveBeenCalledWith({
      clientId: 'client-guid-1',
      clientName: 'Acme Holdings LLC',
    });

    // The derivation was run against the newly-linked client relationship id and
    // the deal's current (empty) Industry.
    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    expect(hydrateMock.mock.calls[0][0]).toBe('client-guid-1');
    expect(hydrateMock.mock.calls[0][1]).toBeUndefined();

    // The verified CRM-derived Industry patch is merged into the cockpit (no reload).
    await waitFor(() =>
      expect(mockState.applyVerifiedDealPatch).toHaveBeenCalledWith({ industry: 'Other' }),
    );

    // Honest source shown as satisfied / CRM-derived.
    const status = await screen.findByText(/CRM-derived · NAICS 561110/);
    expect(status.getAttribute('data-crm-industry-status')).toBe('satisfied');
    expect(status.getAttribute('data-crm-industry-source')).toBe('crm-derived');
  });

  it('a linked company with no NAICS stays unresolved and exposes the CRM remediation + a no-reload re-check', async () => {
    hydrateMock.mockResolvedValue({
      hydration: {
        criterionSatisfied: false,
        source: 'none',
        status: 'Industry/NAICS unresolved — the linked CRM company has no NAICS code.',
        remediation: { kind: 'edit-crm-naics', organizationId: 'org-9' },
        unavailable: false,
      },
    });

    render(<DealCrmRelationshipPanel />);
    const user = await linkAcme();

    // No Industry was written (nothing to apply) — only the client-link refresh.
    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    expect(mockState.applyVerifiedDealPatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ industry: expect.anything() }),
    );

    // Unresolved status + a DIRECT remediation to fix NAICS in the CRM editor.
    const status = await screen.findByText(/Industry\/NAICS unresolved/i);
    expect(status.getAttribute('data-crm-industry-status')).toBe('unresolved');
    expect(document.querySelector('[data-crm-industry-remediation="edit-crm-naics"]')).not.toBeNull();

    // Re-check re-runs the governed derivation without a full reload (the banker
    // returns after fixing NAICS in the CRM record and clicks re-check).
    await user.click(screen.getByRole('button', { name: /Check the CRM-derived Industry/i }));
    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(2));
  });
});
