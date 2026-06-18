// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CrmRelationshipDetailCards } from './CrmRelationshipDetailCards';
import {
  deriveCrmRelationshipViewModel,
  type CrmRelationshipGraphInput,
} from './crmRelationshipViewModel';
import { deriveCrmRelationshipDetailReadiness } from './crmRelationshipDetailReadiness';
import { buildCrmRelationshipInput } from './buildCrmRelationshipInput';

/**
 * Phase 189F — read-only CRM detail cards, gated by 189E readiness.
 * Render record detail ONLY for safe sections; blocked sections render copy,
 * never fake records.
 */

function renderCards(input: CrmRelationshipGraphInput) {
  const vm = deriveCrmRelationshipViewModel(input);
  const readiness = deriveCrmRelationshipDetailReadiness(input);
  return render(<CrmRelationshipDetailCards viewModel={vm} readiness={readiness} />);
}

const realGraph: CrmRelationshipGraphInput = {
  deal: { id: 'deal-1', name: 'Acme Term Loan' },
  client: { id: 'client-guid', name: 'Acme Holdings LLC', borrowerType: 'Business', lookupClassification: 'real-lookup' },
  team: { id: 'team-guid', name: 'Commercial East', lookupClassification: 'real-lookup' },
  assignedBanker: { id: 'banker-guid', name: 'Dana Banker', email: 'dana@bank.example', lookupClassification: 'real-lookup' },
};

const section = (key: string) =>
  document.querySelector(`[data-section="${key}"]`) as HTMLElement | null;

describe('safe sections render record detail', () => {
  it('renders client/team/banker detail when real ids + real-lookup are present', () => {
    renderCards(realGraph);
    expect(screen.getByTestId('crm-relationship-detail-cards').getAttribute('data-readiness-status')).toBe(
      'ready',
    );

    const client = section('clientIdentity')!;
    expect(client.getAttribute('data-section-state')).toBe('safe');
    expect(within(client).getByText('client-guid')).toBeInTheDocument();
    expect(within(client).getByText('Acme Holdings LLC')).toBeInTheDocument();

    const team = section('teamOwnership')!;
    expect(team.getAttribute('data-section-state')).toBe('safe');
    expect(within(team).getByText('team-guid')).toBeInTheDocument();

    const bankerSec = section('assignedBanker')!;
    expect(bankerSec.getAttribute('data-section-state')).toBe('safe');
    expect(within(bankerSec).getByText('dana@bank.example')).toBeInTheDocument();
  });
});

describe('name-only client surrogate', () => {
  it('blocks the client detail drilldown and never renders the surrogate id', () => {
    const input = buildCrmRelationshipInput({
      deal: { id: 'd', name: 'Deal' },
      clientName: 'Surrogate Client',
      team: { id: 'team-guid', name: 'T', lookupClassification: 'real-lookup' },
    });
    renderCards(input);
    const client = section('clientIdentity')!;
    expect(client.getAttribute('data-section-state')).toBe('blocked');
    expect(within(client).getByText(/name only|surrogate/i)).toBeInTheDocument();
    // The `name:`-prefixed surrogate id must NOT appear as a record id.
    expect(client.textContent).not.toMatch(/name:Surrogate Client/);
  });
});

describe('missing client', () => {
  it('blocks CRM detail content (no client record card)', () => {
    renderCards({ ...realGraph, client: null });
    expect(screen.getByTestId('crm-relationship-detail-cards').getAttribute('data-readiness-status')).toBe(
      'blocked',
    );
    const client = section('clientIdentity')!;
    expect(client.getAttribute('data-section-state')).toBe('blocked');
    expect(within(client).getByText(/no canonical client/i)).toBeInTheDocument();
  });
});

describe('missing team / banker', () => {
  it('renders blocked/degraded explanatory copy, not fake records', () => {
    renderCards({ ...realGraph, team: null, assignedBanker: null });
    const team = section('teamOwnership')!;
    const bankerSec = section('assignedBanker')!;
    expect(team.getAttribute('data-section-state')).toBe('blocked');
    expect(bankerSec.getAttribute('data-section-state')).toBe('blocked');
    // No fabricated team/banker id surfaces.
    expect(team.textContent).not.toMatch(/team-guid/);
    expect(within(team).getByText(/unset|not a verified/i)).toBeInTheDocument();
  });
});

describe('salesforce spine', () => {
  it('always renders not seeded / not wired and never fabricates objects', () => {
    renderCards(realGraph);
    const spine = section('salesforceSpine')!;
    expect(spine.getAttribute('data-section-state')).toBe('blocked');
    expect(spine.textContent).not.toMatch(/salesforce_account|salesforce_contact/i);
    expect(spine.textContent).toMatch(/not seeded/i);
  });

  it('lists rejected unsafe assumptions instead of inferring them', () => {
    renderCards(realGraph);
    const rejected = section('rejected')!;
    expect(within(rejected).getByText(/contacts/i)).toBeInTheDocument();
    expect(within(rejected).getByText(/timeline events/i)).toBeInTheDocument();
  });
});

describe('read-only surface', () => {
  it('exposes no buttons, forms, inputs, or action handlers', () => {
    const { container } = renderCards(realGraph);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input').length).toBe(0);
    expect(container.querySelectorAll('textarea').length).toBe(0);
    expect(container.querySelectorAll('select').length).toBe(0);
    expect(container.querySelectorAll('[onclick]').length).toBe(0);
  });
});
