// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import { CrmRelationshipPanel, DealCrmRelationshipPanel } from './CrmRelationshipPanel';
import {
  deriveCrmRelationshipViewModel,
  type CrmRelationshipGraphInput,
} from './crmRelationshipViewModel';
import { buildCrmRelationshipInput } from './buildCrmRelationshipInput';
import type { DealIndustryProjection } from './dealIndustryProjection';

/** Mutable mock of the workspace context the connected container reads. */
const DEFAULT_MOCK_DEAL: Record<string, unknown> = {
  id: 'd1',
  name: 'Mock Deal',
  clientName: 'Mock Client LLC',
};
const mockState = vi.hoisted(() => ({
  deal: { id: 'd1', name: 'Mock Deal', clientName: 'Mock Client LLC' } as Record<string, unknown>,
  // No `systemUserId` by default (matches the original static mock), so
  // `authorized` is false and no write affordance renders — most tests below
  // rely on that. The overlapping-request regression test opts in to a
  // resolved identity so the manual "re-check" button is present to click.
  banker: { bankerId: 'b1', fullName: 'Mock Banker', email: 'b@x.com' } as Record<string, unknown>,
}));
vi.mock('../deals/DealDataProvider', () => ({
  useDealData: () => ({ deal: mockState.deal }),
}));
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: () => mockState.banker,
}));

// SDK boundary mock: whenever the connected container has a client id, it
// auto-fires a real CRM/NAICS industry refresh on mount. Left unmocked, that
// chains into unmocked generated-service dynamic imports that can settle after
// a test (and RTL's own `cleanup()`) have moved on — see
// CrmRelationshipPanel.tsx's `refreshDealIndustryFromCrm` lifecycle guard
// regression test below, which controls this mock's resolution timing
// directly to prove unmount safety.
const { loadLiveDealIndustryProjectionMock } = vi.hoisted(() => ({
  loadLiveDealIndustryProjectionMock: vi.fn(),
}));
vi.mock('./dealIndustryProjection', () => ({
  loadLiveDealIndustryProjection: loadLiveDealIndustryProjectionMock,
}));

beforeEach(() => {
  mockState.deal = { ...DEFAULT_MOCK_DEAL };
  mockState.banker = { bankerId: 'b1', fullName: 'Mock Banker', email: 'b@x.com' };
  loadLiveDealIndustryProjectionMock.mockReset();
  loadLiveDealIndustryProjectionMock.mockResolvedValue({ kind: 'no-org-link' });
});

const fullGraph: CrmRelationshipGraphInput = {
  deal: { id: 'deal-1', name: 'Acme Term Loan' },
  client: { id: 'c1', name: 'Acme Holdings LLC', borrowerType: 'Business', lookupClassification: 'real-lookup' },
  team: { id: 't1', name: 'Commercial East', lookupClassification: 'real-lookup' },
  assignedBanker: { id: 'b1', name: 'Dana Banker', teamId: 't1', lookupClassification: 'real-lookup' },
};

const vmOf = (i: CrmRelationshipGraphInput) => deriveCrmRelationshipViewModel(i);

describe('CrmRelationshipPanel (presentational)', () => {
  it('renders a ready status with the client stub label', () => {
    render(<CrmRelationshipPanel viewModel={vmOf(fullGraph)} />);
    const panel = screen.getByTestId('crm-relationship-panel');
    expect(panel.getAttribute('data-relationship-status')).toBe('ready');
    expect(screen.getByText('Acme Holdings LLC', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText(/borrower\/client stub/i).length).toBeGreaterThan(0);
  });

  it('renders partial with a Deal → Team edge to wire when team is absent', () => {
    render(<CrmRelationshipPanel viewModel={vmOf({ ...fullGraph, team: null })} />);
    expect(screen.getByTestId('crm-relationship-panel').getAttribute('data-relationship-status')).toBe(
      'partial',
    );
    const edges = screen.getByLabelText('Relationship edges to wire');
    expect(within(edges).getByText(/Deal → Team/)).toBeInTheDocument();
  });

  it('renders blocked with no canonical client when client is absent', () => {
    render(<CrmRelationshipPanel viewModel={vmOf({ ...fullGraph, client: null })} />);
    expect(screen.getByTestId('crm-relationship-panel').getAttribute('data-relationship-status')).toBe(
      'blocked',
    );
    expect(screen.getByText(/No canonical client linked/i)).toBeInTheDocument();
  });

  it('surfaces a pseudo-lookup warning', () => {
    const vm = vmOf({
      ...fullGraph,
      client: { ...fullGraph.client!, lookupClassification: 'pseudo-scalar' },
    });
    render(<CrmRelationshipPanel viewModel={vm} />);
    const warnings = screen.getByLabelText('Unsafe pseudo-lookup warnings');
    expect(within(warnings).getByText('cr664_client')).toBeInTheDocument();
  });

  it('shows the future spine as not seeded / not wired and fabricates nothing', () => {
    render(<CrmRelationshipPanel viewModel={vmOf(fullGraph)} />);
    expect(screen.getByText(/not seeded · not wired/i)).toBeInTheDocument();
    // No fabricated Salesforce account/contact records leak into the DOM.
    expect(screen.queryByText(/salesforce_account/i)).toBeNull();
    expect(screen.queryByText(/salesforce_contact/i)).toBeNull();
  });

  it('orders recommended actions: render existing graph before seeding the spine', () => {
    render(<CrmRelationshipPanel viewModel={vmOf(fullGraph)} />);
    const kinds = Array.from(document.querySelectorAll('[data-action-kind]')).map((el) =>
      el.getAttribute('data-action-kind'),
    );
    const renderIdx = kinds.indexOf('render_existing_graph');
    const seedIdx = kinds.indexOf('seed_full_spine_later');
    expect(renderIdx).toBeGreaterThanOrEqual(0);
    expect(seedIdx).toBeGreaterThan(renderIdx);
  });
});

describe('DealCrmRelationshipPanel (connected container)', () => {
  it('builds the view-model from the authorized deal + banker context and renders', () => {
    render(<DealCrmRelationshipPanel />);
    const panel = screen.getByTestId('crm-relationship-panel');
    // deal + client(name) + banker, no team → partial.
    expect(panel.getAttribute('data-relationship-status')).toBe('partial');
    expect(screen.getByText(/Mock Client LLC/)).toBeInTheDocument();
  });

  it('Phase 189D — renders real client + team when the authorized DealDetail carries IDs', () => {
    // The enriched, already-authorized deal row (no second GET) supplies real
    // lookup ids + real-lookup classifications for client, team, and banker.
    mockState.deal = {
      id: 'd1',
      name: 'Mock Deal',
      clientName: 'Mock Client LLC',
      clientId: 'client-guid',
      clientLookupClassification: 'real-lookup',
      teamId: 'team-guid',
      teamName: 'Commercial East',
      teamLookupClassification: 'real-lookup',
      assignedBankerId: 'banker-guid',
      bankerName: 'Real Assigned Banker',
      assignedBankerLookupClassification: 'real-lookup',
    };
    render(<DealCrmRelationshipPanel />);
    const panel = screen.getByTestId('crm-relationship-panel');
    // All three canonical edges present as real lookups → ready.
    expect(panel.getAttribute('data-relationship-status')).toBe('ready');
    // Scope to the panel — the detail cards also render the team/banker names.
    expect(within(panel).getByText('Commercial East')).toBeInTheDocument();
    expect(within(panel).getByText(/Real Assigned Banker/)).toBeInTheDocument();
    // No edge-to-wire section when the current graph is complete.
    expect(screen.queryByLabelText('Relationship edges to wire')).toBeNull();
  });

  it('Phase 189F — renders the readiness-gated detail cards alongside the panel', () => {
    mockState.deal = {
      id: 'd1',
      name: 'Mock Deal',
      clientName: 'Mock Client LLC',
      clientId: 'client-guid',
      clientLookupClassification: 'real-lookup',
      teamId: 'team-guid',
      teamName: 'Commercial East',
      teamLookupClassification: 'real-lookup',
      assignedBankerId: 'banker-guid',
      bankerName: 'Real Assigned Banker',
      assignedBankerLookupClassification: 'real-lookup',
    };
    render(<DealCrmRelationshipPanel />);
    const cards = screen.getByTestId('crm-relationship-detail-cards');
    expect(cards.getAttribute('data-readiness-status')).toBe('ready');
    // Real ids → client detail section is safe and shows the real GUID.
    const clientSection = cards.querySelector('[data-section="clientIdentity"]')!;
    expect(clientSection.getAttribute('data-section-state')).toBe('safe');
    expect(within(clientSection as HTMLElement).getByText('client-guid')).toBeInTheDocument();
  });

  it('the readiness gate degrades (not blocks) the client detail card for a name-only client', () => {
    // Default mock deal has clientName but no clientId → surrogate. The client
    // node exists, so its detail is degraded (drilldown unsafe), NOT blocked.
    render(<DealCrmRelationshipPanel />);
    const cards = screen.getByTestId('crm-relationship-detail-cards');
    const clientSection = cards.querySelector('[data-section="clientIdentity"]')!;
    expect(clientSection.getAttribute('data-section-state')).toBe('degraded');
    // No real client GUID is shown for a name-only client.
    expect(clientSection.textContent).not.toMatch(/name:Mock Client LLC/);
  });

  it('exposes no buttons, forms, or write affordances (read-only surface)', () => {
    const { container } = render(<DealCrmRelationshipPanel />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input').length).toBe(0);
    expect(container.querySelectorAll('textarea').length).toBe(0);
    expect(container.querySelectorAll('select').length).toBe(0);
  });
});

describe('builder + panel integration', () => {
  it('renders a name-only client (surrogate id) without claiming a real lookup', () => {
    const vm = deriveCrmRelationshipViewModel(
      buildCrmRelationshipInput({
        deal: { id: 'd', name: 'Deal' },
        clientName: 'Name Only Client',
        assignedBanker: { id: 'b', name: 'Banker' },
      }),
    );
    render(<CrmRelationshipPanel viewModel={vm} />);
    expect(screen.getByText(/Name Only Client/)).toBeInTheDocument();
    expect(screen.getByTestId('crm-relationship-panel').getAttribute('data-relationship-status')).toBe(
      'partial',
    );
  });
});

describe('refreshDealIndustryFromCrm — unmount + overlapping-request safety', () => {
  const LINKED_DEAL = {
    id: 'd1',
    name: 'Mock Deal',
    clientName: 'Mock Client LLC',
    clientId: 'client-guid',
    clientLookupClassification: 'real-lookup' as const,
  };

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('unmounting before the CRM industry refresh resolves produces no unhandled rejection and no post-unmount state update', async () => {
    mockState.deal = { ...LINKED_DEAL };
    const { promise, resolve } = deferred<DealIndustryProjection>();
    loadLiveDealIndustryProjectionMock.mockReturnValue(promise);

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const { unmount } = render(<DealCrmRelationshipPanel />);
      // Industry refresh has started (mount effect fired) but has not resolved yet.
      await waitFor(() => expect(loadLiveDealIndustryProjectionMock).toHaveBeenCalled());

      // Unmount BEFORE the in-flight request settles.
      unmount();

      // Now let it resolve — this is the exact interleaving that previously threw
      // "ReferenceError: window is not defined" from a setState call reaching a
      // torn-down environment (the plugin's mounted-guard must swallow this).
      resolve({ kind: 'no-org-link' });
      await act(async () => {
        await promise;
        // Flush the microtask that runs the guarded state-update attempt after
        // the awaited projection settles.
        await Promise.resolve();
      });
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }

    expect(unhandledRejections).toEqual([]);
  });

  it('an older, slower industry-refresh response never overwrites a newer one', async () => {
    // The re-check button disables itself while a request is in flight, so the
    // realistic source of an overlapping SECOND request is the mount effect
    // re-firing on a client change (a rapid re-link) before the FIRST request for
    // the prior client has settled — not two rapid clicks. Neither projection
    // kind used here (`no-org-link` / `no-naics`) sets `industryToApply`, so this
    // never reaches the governed write path — only the two distinct status texts
    // are compared.
    mockState.deal = { ...LINKED_DEAL, clientId: 'client-guid-1' };
    // A resolved Dataverse identity is required for the industry status
    // section (including its status text) to render at all.
    mockState.banker = { bankerId: 'b1', fullName: 'Mock Banker', email: 'b@x.com', systemUserId: 'sys-1' };

    const first = deferred<DealIndustryProjection>();
    const second = deferred<DealIndustryProjection>();
    loadLiveDealIndustryProjectionMock
      .mockReturnValueOnce(first.promise) // request for client-guid-1
      .mockReturnValueOnce(second.promise); // request for client-guid-2

    const { rerender } = render(<DealCrmRelationshipPanel />);
    await waitFor(() => expect(loadLiveDealIndustryProjectionMock).toHaveBeenCalledTimes(1));
    expect(loadLiveDealIndustryProjectionMock).toHaveBeenNthCalledWith(1, 'client-guid-1');

    // The client changes again (re-link) before the first request settles —
    // effectiveClientId changes, re-firing the effect with a genuinely
    // overlapping second request.
    mockState.deal = { ...LINKED_DEAL, clientId: 'client-guid-2' };
    rerender(<DealCrmRelationshipPanel />);
    await waitFor(() => expect(loadLiveDealIndustryProjectionMock).toHaveBeenCalledTimes(2));
    expect(loadLiveDealIndustryProjectionMock).toHaveBeenNthCalledWith(2, 'client-guid-2');

    // Resolve the NEWER (second) request first, then the OLDER (first) request
    // — the worst-case ordering for a naive implementation with no guard.
    second.resolve({ kind: 'no-naics', organizationId: 'org-2' });
    await act(async () => {
      await second.promise;
    });

    first.resolve({ kind: 'no-org-link' });
    await act(async () => {
      await first.promise;
    });

    // The stale first (older) response must not have overwritten the newer,
    // already-applied second response.
    expect(
      screen.getByText(/Industry\/NAICS unresolved — the linked CRM company has no NAICS code\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Industry\/NAICS unresolved — the linked client is not bridged/),
    ).toBeNull();
  });
});
