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
  it('degrades the client detail drilldown (not blocked) and never renders the surrogate id', () => {
    const input = buildCrmRelationshipInput({
      deal: { id: 'd', name: 'Deal' },
      clientName: 'Surrogate Client',
      team: { id: 'team-guid', name: 'T', lookupClassification: 'real-lookup' },
    });
    renderCards(input);
    const client = section('clientIdentity')!;
    // A client node exists (by name), so this is degraded, not blocked.
    expect(client.getAttribute('data-section-state')).toBe('degraded');
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
  it('renders degraded (actionable) explanatory copy, not blocked, not fake records', () => {
    renderCards({ ...realGraph, team: null, assignedBanker: null });
    const team = section('teamOwnership')!;
    const bankerSec = section('assignedBanker')!;
    // Missing team/banker degrade — they are NOT a full CRM failure.
    expect(team.getAttribute('data-section-state')).toBe('degraded');
    expect(bankerSec.getAttribute('data-section-state')).toBe('degraded');
    // No fabricated team/banker id surfaces.
    expect(team.textContent).not.toMatch(/team-guid/);
    expect(within(team).getByText(/unset|not a verified/i)).toBeInTheDocument();
  });
});

describe('platform / workspace bridge', () => {
  it('renders as OPTIONAL / not provided when absent — never blocked', () => {
    renderCards(realGraph); // no platformUser
    const platform = section('platformWorkspaceBridge')!;
    expect(platform.getAttribute('data-section-state')).toBe('optional');
    expect(platform.getAttribute('data-section-state')).not.toBe('blocked');
    expect(within(platform).getAllByText(/optional/i).length).toBeGreaterThan(0);
    expect(within(platform).getByText(/not provided/i)).toBeInTheDocument();
  });
});

describe('salesforce spine', () => {
  it('always renders as deferred / not seeded / not wired and never fabricates objects', () => {
    renderCards(realGraph);
    const spine = section('salesforceSpine')!;
    // Deferred, never blocked.
    expect(spine.getAttribute('data-section-state')).toBe('deferred');
    expect(spine.getAttribute('data-section-state')).not.toBe('blocked');
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

describe('Phase 189G — fit-and-finish + source-fact traceability', () => {
  it('renders the six detail sections in deterministic order', () => {
    renderCards(realGraph);
    const order = Array.from(document.querySelectorAll('[data-section]'))
      .map((el) => el.getAttribute('data-section'))
      .filter((s) => s !== 'rejected');
    expect(order).toEqual([
      'clientIdentity',
      'teamOwnership',
      'assignedBanker',
      'platformWorkspaceBridge',
      'relationshipIntegrity',
      'salesforceSpine',
    ]);
  });

  it('shows a provenance banner naming the authorized deal row, 189B view-model, and 189E gate', () => {
    renderCards(realGraph);
    const banner = screen.getByTestId('crm-detail-provenance');
    expect(banner.textContent).toMatch(/already-authorized deal row/i);
    expect(banner.textContent).toMatch(/189B view-model/);
    expect(banner.textContent).toMatch(/189E readiness/);
    expect(banner.textContent).toMatch(/no new CRM lookup/i);
  });

  it('every safe section carries a source-fact chip tracing it to authorized context (not a new lookup)', () => {
    renderCards(realGraph);
    for (const key of ['clientIdentity', 'teamOwnership', 'assignedBanker']) {
      const sec = section(key)!;
      expect(sec.getAttribute('data-section-state')).toBe('safe');
      const fact = sec.querySelector('[data-source-fact]') as HTMLElement;
      expect(fact).not.toBeNull();
      expect(fact.textContent).toMatch(/189B view-model/);
      expect(fact.textContent).toMatch(/189E readiness/);
      expect(fact.textContent).toMatch(/No new CRM lookup/i);
    }
  });

  it('the footer states values are derived from existing authorized context, not a new CRM lookup', () => {
    renderCards(realGraph);
    const footer = screen.getByTestId('crm-detail-source-footer');
    expect(footer.textContent).toMatch(/existing authorized deal context/i);
    expect(footer.textContent).toMatch(/not a\s+new CRM lookup/i);
  });

  it('non-safe cards show a compact reason but no fake placeholder values', () => {
    renderCards({ ...realGraph, team: null, assignedBanker: null });
    for (const key of ['teamOwnership', 'assignedBanker']) {
      const sec = section(key)!;
      expect(sec.getAttribute('data-section-state')).toBe('degraded');
      expect(sec.querySelector('[data-section-reason]')).not.toBeNull();
      // No fabricated placeholders.
      expect(sec.textContent).not.toMatch(/\bTBD\b|unknown contact|sample role|placeholder|lorem/i);
      // No source-fact chip on a non-safe section (only safe sections trace).
      expect(sec.querySelector('[data-source-fact]')).toBeNull();
    }
  });

  it('never displays a name: surrogate id, even when a safe section would otherwise show an id', () => {
    // Whole-card guarantee: no rendered text contains the surrogate prefix.
    const { container } = renderCards(
      buildCrmRelationshipInput({
        deal: { id: 'd', name: 'Deal' },
        clientName: 'Surrogate Co',
        team: { id: 'team-guid', name: 'T', lookupClassification: 'real-lookup' },
        assignedBanker: { id: 'banker-guid', name: 'B', lookupClassification: 'real-lookup' },
      }),
    );
    expect(container.textContent).not.toMatch(/name:Surrogate Co/);
  });

  it('keeps unsafe assumptions as rejected labels only (no record fields)', () => {
    renderCards(realGraph);
    const rejected = section('rejected')!;
    // Labels present, but no "Record id" detail fields are rendered for them.
    expect(rejected.textContent).not.toMatch(/Record id/);
    expect(within(rejected).getByText(/communication preferences/i)).toBeInTheDocument();
  });

  it('keeps the Salesforce-style spine deferred / not seeded (never blocked)', () => {
    renderCards(realGraph);
    const spine = section('salesforceSpine')!;
    expect(spine.getAttribute('data-section-state')).toBe('deferred');
    expect(spine.textContent).toMatch(/not seeded/i);
  });
});
