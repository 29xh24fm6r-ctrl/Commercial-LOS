// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Deal Workspace CRM Relationship blockers — actionable linking.
 *
 * Pins:
 *   - a missing canonical client shows an actionable "Link CRM client" button
 *     for an authorized banker;
 *   - an unauthorized (read-only) user sees a read-only note, NOT an action;
 *   - selecting an existing CRM client links it via the governed write and the
 *     panel moves from blocked → populated with the linked client;
 *   - no fake client / contact / team / activity is fabricated;
 *   - merely viewing the blocked state performs no Dataverse write.
 */

const mockState = vi.hoisted(() => ({
  deal: { id: 'd1', name: 'Acme Term Loan' } as Record<string, unknown>,
  banker: null as Record<string, unknown> | null,
}));

vi.mock('../deals/DealDataProvider', () => ({
  useDealData: () => ({ deal: mockState.deal }),
}));
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: () => mockState.banker,
}));

// The live governed write + option loaders touch the SDK; mock at the module
// boundary so this test drives the panel wiring, not Dataverse.
const linkMock = vi.hoisted(() => vi.fn());
vi.mock('./write/linkDealCrmEntity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./write/linkDealCrmEntity')>();
  return {
    ...actual,
    linkDealCrmEntity: linkMock,
    buildLiveLinkDealCrmEntityDeps: () => ({}),
  };
});

const loadClientsMock = vi.hoisted(() => vi.fn());
const loadTeamsMock = vi.hoisted(() => vi.fn());
vi.mock('./dealCrmLinkOptions', () => ({
  loadClientRelationshipOptions: loadClientsMock,
  loadTeamOptions: loadTeamsMock,
}));

import { DealCrmRelationshipPanel } from './CrmRelationshipPanel';

const AUTHORIZED_BANKER = {
  bankerId: 'b1',
  fullName: 'Dana Banker',
  email: 'dana@bank.com',
  systemUserId: 'sys-1',
  writeDisabledReason: undefined,
};
const READONLY_BANKER = {
  bankerId: 'b1',
  fullName: 'Dana Banker',
  email: 'dana@bank.com',
  systemUserId: undefined,
  writeDisabledReason: 'No Dataverse identity resolved for your sign-in.',
};

beforeEach(() => {
  vi.clearAllMocks();
  // A deal with NO canonical client / team → the panel is blocked.
  mockState.deal = { id: 'd1', name: 'Acme Term Loan' };
  mockState.banker = { ...AUTHORIZED_BANKER };
  loadClientsMock.mockResolvedValue([
    { id: 'client-guid-1', name: 'Acme Holdings LLC', sublabel: 'LLC · Manufacturing', active: true },
    { id: 'client-guid-2', name: 'Beta Foods Inc', sublabel: 'Corporation', active: true },
  ]);
  loadTeamsMock.mockResolvedValue([
    { id: 'team-guid-1', name: 'Commercial East', active: true },
  ]);
});

describe('DealCrmRelationshipPanel — actionable client link', () => {
  it('shows an actionable "Link CRM client" button when no canonical client is linked (authorized)', () => {
    render(<DealCrmRelationshipPanel />);
    const panel = screen.getByTestId('crm-relationship-panel');
    expect(panel.getAttribute('data-relationship-status')).toBe('blocked');
    const button = screen.getByRole('button', {
      name: /Link a canonical CRM client to this deal/i,
    });
    expect(button.tagName).toBe('BUTTON');
  });

  it('shows a read-only note (no action button) for an unauthorized user', () => {
    mockState.banker = { ...READONLY_BANKER };
    render(<DealCrmRelationshipPanel />);
    expect(
      screen.queryByRole('button', { name: /Link a canonical CRM client/i }),
    ).toBeNull();
    const note = document.querySelector('[data-crm-link-readonly="client"]');
    expect(note).not.toBeNull();
    expect(note?.textContent).toMatch(/No Dataverse identity resolved/i);
  });

  it('links a selected existing client and moves the panel from blocked to populated', async () => {
    linkMock.mockResolvedValue({
      kind: 'success',
      dealId: 'd1',
      target: 'client',
      entityId: 'client-guid-1',
      entityName: 'Acme Holdings LLC',
      correlationId: 'corr-1',
      auditId: 'audit-1',
    });
    render(<DealCrmRelationshipPanel />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Link a canonical CRM client/i }));

    // Modal loads the existing client options.
    const option = await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await user.click(option);
    await user.click(screen.getByRole('button', { name: /^Link client$/i }));

    // The governed write was invoked with the selected client + deal.
    expect(linkMock).toHaveBeenCalledTimes(1);
    const arg = linkMock.mock.calls[0][0];
    expect(arg).toMatchObject({ dealId: 'd1', target: 'client', entityId: 'client-guid-1', authorized: true });

    // Success outcome shown, then close.
    expect(await screen.findByText(/Client linked/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Close$/i }));

    // Panel reflects the confirmed link: status flips off blocked, client shown.
    await waitFor(() => {
      const panel = screen.getByTestId('crm-relationship-panel');
      expect(panel.getAttribute('data-relationship-status')).not.toBe('blocked');
    });
    const panel = screen.getByTestId('crm-relationship-panel');
    expect(within(panel).getByText(/Acme Holdings LLC/)).toBeInTheDocument();
    // The "Link CRM client" affordance is gone now that a client is linked.
    expect(
      screen.queryByRole('button', { name: /Link a canonical CRM client/i }),
    ).toBeNull();
  });

  it('does not fabricate any client/contact/team/activity, and viewing blocked state performs no write', () => {
    render(<DealCrmRelationshipPanel />);
    // Merely rendering the blocked panel invokes no governed write and no
    // option load (options load only when the modal opens).
    expect(linkMock).not.toHaveBeenCalled();
    expect(loadClientsMock).not.toHaveBeenCalled();
    // Honest empty state — no invented client name leaks in.
    expect(screen.getByText(/No canonical client linked to this deal/i)).toBeInTheDocument();
    // The future spine is shown as optional / not seeded, not as the blocker.
    expect(screen.getByText(/optional · not seeded · not wired/i)).toBeInTheDocument();
  });

  it('offers an actionable "Assign owning team" affordance for the missing team edge', () => {
    render(<DealCrmRelationshipPanel />);
    expect(
      screen.getByRole('button', { name: /Assign the owning team for this deal/i }),
    ).toBeInTheDocument();
  });

  it('assigns an owning team and reflects it in the panel (affordance clears)', async () => {
    linkMock.mockResolvedValue({
      kind: 'success',
      dealId: 'd1',
      target: 'team',
      entityId: 'team-guid-1',
      entityName: 'Commercial East',
      correlationId: 'corr-2',
      auditId: 'audit-2',
    });
    render(<DealCrmRelationshipPanel />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Assign the owning team/i }));
    const option = await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(option);
    await user.click(screen.getByRole('button', { name: /^Assign team$/i }));

    expect(linkMock).toHaveBeenCalledTimes(1);
    expect(linkMock.mock.calls[0][0]).toMatchObject({ target: 'team', entityId: 'team-guid-1' });

    expect(await screen.findByText(/Team linked/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Close$/i }));

    // The owning team now shows and the assign affordance is gone.
    const panel = screen.getByTestId('crm-relationship-panel');
    await waitFor(() =>
      expect(within(panel).getByText('Commercial East')).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /Assign the owning team/i }),
    ).toBeNull();
  });

  it('unauthorized banker sees the exact writeBlockedReason under BOTH missing edges', () => {
    mockState.banker = { ...READONLY_BANKER };
    render(<DealCrmRelationshipPanel />);
    const clientNote = document.querySelector('[data-crm-link-readonly="client"]');
    const teamNote = document.querySelector('[data-crm-link-readonly="team"]');
    expect(clientNote?.textContent).toMatch(/No Dataverse identity resolved/i);
    expect(teamNote?.textContent).toMatch(/No Dataverse identity resolved/i);
    // No actionable buttons for a read-only user.
    expect(screen.queryByRole('button', { name: /Link a canonical CRM client/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Assign the owning team/i })).toBeNull();
  });
});
