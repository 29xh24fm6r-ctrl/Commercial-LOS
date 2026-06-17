// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CrmRelationshipPanel, DealCrmRelationshipPanel } from './CrmRelationshipPanel';
import {
  deriveCrmRelationshipViewModel,
  type CrmRelationshipGraphInput,
} from './crmRelationshipViewModel';
import { buildCrmRelationshipInput } from './buildCrmRelationshipInput';

/** Mock the workspace context the connected container reads. */
vi.mock('../deals/DealDataProvider', () => ({
  useDealData: () => ({
    deal: { id: 'd1', name: 'Mock Deal', clientName: 'Mock Client LLC' },
  }),
}));
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: () => ({ bankerId: 'b1', fullName: 'Mock Banker', email: 'b@x.com' }),
}));

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
