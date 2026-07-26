// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
// Env-resilience: unblock module loading of the generated Dataverse services (which pull the
// @microsoft/power-apps SDK) without loading the real SDK. Behaviour-free — this test drives the
// workspace through an injected loadData loader, never a real query. (Idiom: featureSurfaces.test.tsx.)
vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CrmHubWorkspace } from './CrmHubWorkspace';
import type { CrmWorkspaceData, CrmDomainKey, CrmRecord } from './crmWorkspaceData';

/**
 * Phase 260 — Relationship CRM elite cockpit.
 */

function rec(id: string, title: string, extra: Partial<CrmRecord> = {}): CrmRecord {
  return { id, title, detail: [], ...extra };
}
function empty() {
  return { status: 'ready' as const, records: [] as CrmRecord[] };
}
function fixture(over: Partial<Record<CrmDomainKey, CrmWorkspaceData[CrmDomainKey]>> = {}): CrmWorkspaceData {
  const base = {
    organizations: empty(), people: empty(), relationships: empty(), roleAssignments: empty(),
    contactPoints: empty(), communicationPreferences: empty(), contactAuthorizations: empty(),
    vendorProfiles: empty(), timelineEvents: empty(), auditEntries: empty(),
  } as CrmWorkspaceData;
  return { ...base, ...over };
}

async function renderHub(data: CrmWorkspaceData) {
  const utils = render(
    <MemoryRouter>
      <CrmHubWorkspace loadData={async () => data} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(utils.container.querySelector('[data-crm-cards]')).not.toBeNull());
  return utils;
}

describe('Phase 260 — CrmHubWorkspace (elite cockpit)', () => {
  it('renders a premium header, command bar (search + view tabs), and dashboard cards', async () => {
    const { container } = await renderHub(fixture());
    expect(screen.getByRole('heading', { name: 'Relationship CRM' })).toBeInTheDocument();
    expect(screen.getByText(/Manage companies, contacts, relationships/i)).toBeInTheDocument();
    expect(container.querySelector('[data-crm-command-bar]')).not.toBeNull();
    expect(container.querySelector('[data-crm-search]')).not.toBeNull();
    for (const v of ['companies', 'contacts', 'relationships', 'activities', 'vendors', 'timeline']) {
      expect(container.querySelector(`[data-crm-view="${v}"]`)).not.toBeNull();
    }
    expect(container.querySelectorAll('[data-crm-card]').length).toBe(6);
  });

  it('CRM-ELITE-1 Phase 5 — surfaces a discoverable entry point to the CRM intelligence panel', async () => {
    const { container } = await renderHub(fixture());
    const link = container.querySelector('[data-crm-intelligence-link]');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', '/surfaces/crm-intelligence');
  });

  it('renders the scaffolding immediately (header present even before data resolves — never blank)', () => {
    const { container } = render(
      <MemoryRouter>
        <CrmHubWorkspace loadData={() => new Promise(() => {})} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Relationship CRM' })).toBeInTheDocument();
    expect(container.querySelector('[data-crm-command-bar]')).not.toBeNull();
  });

  it('shows companies in a table and opens a detail drawer with overview + linked sections', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings', { subtitle: 'Manufacturing', badge: 'Active', detail: [{ label: 'Legal name', value: 'Acme Holdings, LLC' }] })] },
      }),
    );
    expect(container.querySelector('[data-crm-table="companies"]')).not.toBeNull();
    expect(screen.getByText('Acme Holdings')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-record="o1"]') as HTMLElement);
    const drawer = container.querySelector('[data-crm-detail-drawer]') as HTMLElement;
    expect(drawer).not.toBeNull();
    expect(within(drawer).getByText('Acme Holdings, LLC')).toBeInTheDocument();
    expect(within(drawer).getByText('Linked deals')).toBeInTheDocument();
    await user.click(within(drawer).getByLabelText('Close detail'));
    expect(container.querySelector('[data-crm-detail-drawer]')).toBeNull();
  });

  it('company drawer shows the org’s real contacts, activities, and follow-up tasks + record actions (F1/F2)', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings', { detail: [{ label: 'Legal name', value: 'Acme Holdings, LLC' }] })] },
        people: {
          status: 'ready',
          records: [
            rec('p1', 'Jane Doe', { subtitle: 'CFO', organizationId: 'o1' }),
            rec('p2', 'Unrelated Person', { organizationId: 'other-org' }),
          ],
        },
        timelineEvents: {
          status: 'ready',
          records: [
            rec('a1', 'call', { subtitle: 'Called about renewal', occurredAt: '2026-06-20T10:00:00Z', organizationId: 'o1', eventType: 'call' }),
            rec('tk1', 'follow-up-task', { subtitle: 'Send term sheet', organizationId: 'o1', eventType: 'follow-up-task' }),
            rec('a2', 'note', { subtitle: 'unrelated activity', organizationId: 'other-org', eventType: 'note' }),
          ],
        },
      }),
    );

    // Cards read the real follow-up-task count (was hardcoded undefined).
    const followUps = container.querySelector('[data-crm-card="Follow-up activity"]') as HTMLElement;
    expect(within(followUps).getByText('1')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-record="o1"]') as HTMLElement);
    const drawer = container.querySelector('[data-crm-detail-drawer]') as HTMLElement;

    // F1 — only THIS company's related records, filtered from already-loaded data.
    expect(within(drawer).getByText('Jane Doe')).toBeInTheDocument();
    expect(within(drawer).queryByText('Unrelated Person')).toBeNull();
    expect(within(drawer).getByText('Called about renewal')).toBeInTheDocument();
    expect(within(drawer).getByText('Send term sheet')).toBeInTheDocument();
    expect(within(drawer).queryByText('unrelated activity')).toBeNull();

    // F2 — record-scoped governed write actions surface on the open company.
    expect(drawer.querySelector('[data-crm-actions-record]')).not.toBeNull();
    expect(drawer.querySelector('[data-crm-action="contact"]')).not.toBeNull();
    expect(drawer.querySelector('[data-crm-action="task"]')).not.toBeNull();
  });

  it('company drawer shows linked deals from the record-scoped read (F4)', async () => {
    const loadLinkedDeals = async () => ({
      status: 'ready' as const,
      deals: [{ id: 'd1', name: 'Acme Expansion', stage: 'Underwriting', status: 'Active', amount: '$2,000,000' }],
    });
    const { container } = render(
      <MemoryRouter>
        <CrmHubWorkspace
          loadData={async () => fixture({ organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings')] } })}
          loadLinkedDeals={loadLinkedDeals}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector('[data-crm-cards]')).not.toBeNull());
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-record="o1"]') as HTMLElement);
    const drawer = container.querySelector('[data-crm-detail-drawer]') as HTMLElement;
    await waitFor(() => expect(within(drawer).getByText('Acme Expansion')).toBeInTheDocument());
    expect(within(drawer).getByText(/Underwriting/)).toBeInTheDocument();
  });

  it('D16 — clicking a linked deal navigates to that deal\'s cockpit route (not a dead link)', async () => {
    const loadLinkedDeals = async () => ({
      status: 'ready' as const,
      deals: [
        { id: 'd1', name: 'Acme Expansion', stage: 'Underwriting', status: 'Active', amount: '$2,000,000' },
        { id: 'd2', name: 'Acme Refinance', stage: 'Credit Approval', status: 'Active', amount: '$500,000' },
      ],
    });
    let currentPath = '';
    function LocationProbe() {
      currentPath = useLocation().pathname;
      return null;
    }
    const { container } = render(
      <MemoryRouter initialEntries={['/crm']}>
        <CrmHubWorkspace
          loadData={async () => fixture({ organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings')] } })}
          loadLinkedDeals={loadLinkedDeals}
        />
        <LocationProbe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector('[data-crm-cards]')).not.toBeNull());
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-record="o1"]') as HTMLElement);
    const drawer = container.querySelector('[data-crm-detail-drawer]') as HTMLElement;
    await waitFor(() => expect(within(drawer).getByText('Acme Expansion')).toBeInTheDocument());
    // Two distinct linked deals present — clicking the SECOND one must navigate to ITS id, not
    // the first (proves correctness, not just "some navigation happened").
    await user.click(within(drawer).getByText('Acme Refinance'));
    await waitFor(() => expect(currentPath).toBe('/deals/d2'));
  });

  it('switches views and renders an activity timeline', async () => {
    const { container } = await renderHub(
      fixture({ timelineEvents: { status: 'ready', records: [rec('t1', 'Note added', { subtitle: 'Called borrower', occurredAt: '2026-06-20T10:00:00Z' })] } }),
    );
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-view="timeline"]') as HTMLElement);
    expect(container.querySelector('[data-crm-timeline]')).not.toBeNull();
    expect(screen.getByText('Note added')).toBeInTheDocument();
  });

  it('renders a polished empty state with guidance (not a bare 0)', async () => {
    const { container } = await renderHub(fixture());
    const emptyEl = container.querySelector('[data-crm-empty]') as HTMLElement;
    expect(emptyEl).not.toBeNull();
    expect(within(emptyEl).getByText('No companies yet')).toBeInTheDocument();
    expect(within(emptyEl).getByText(/will appear here/i)).toBeInTheDocument();
    // Timeline empty has the required guidance.
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-view="activities"]') as HTMLElement);
    expect(screen.getByText(/Log a call, meeting, or note once CRM updates are enabled/i)).toBeInTheDocument();
  });

  it('filters records via search', async () => {
    const { container } = await renderHub(
      fixture({ organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings'), rec('o2', 'Globex Inc')] } }),
    );
    const user = userEvent.setup();
    await user.type(container.querySelector('[data-crm-search]') as HTMLInputElement, 'glob');
    expect(screen.queryByText('Acme Holdings')).toBeNull();
    expect(screen.getByText('Globex Inc')).toBeInTheDocument();
  });

  it('company drawer exposes a governed Industry/NAICS edit path with provenance, Industry seeded from raw (not the derived sector), and Type kept separate', async () => {
    const derivedSector = 'Administrative and Support and Waste Management and Remediation Services';
    const { container } = await renderHub(
      fixture({
        organizations: {
          status: 'ready',
          records: [
            rec('o1', 'Waste Co', {
              subtitle: derivedSector, // displayed Industry (NAICS-derived), no manual override
              tertiary: 'Borrower',
              orgNaicsCode: '561110',
              orgIndustryDerivedSector: derivedSector,
              orgIndustryDescriptor: undefined,
              detail: [
                { label: 'Type', value: 'Borrower' },
                { label: 'Industry', value: derivedSector },
              ],
            }),
          ],
        },
      }),
    );
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-record="o1"]') as HTMLElement);
    const drawer = container.querySelector('[data-crm-detail-drawer]') as HTMLElement;

    // Provenance is shown: the displayed Industry is derived from the NAICS code.
    const provenance = drawer.querySelector('[data-crm-industry-provenance]') as HTMLElement;
    expect(provenance).not.toBeNull();
    expect(provenance.textContent).toMatch(/Derived from NAICS 561110/);

    // NAICS is now an editable governed field, seeded with the real code.
    const naics = drawer.querySelector('[data-crm-inline-edit-trigger="cr664_naicscode"]') as HTMLElement;
    expect(naics).not.toBeNull();
    expect(naics.textContent).toContain('561110');

    // The Industry manual-override editor seeds from the RAW descriptor (empty here) — it must NOT
    // pre-fill the derived sector (which would silently persist a NAICS-derived value as an override).
    const industry = drawer.querySelector('[data-crm-inline-edit-trigger="cr664_industry"]') as HTMLElement;
    expect(industry).not.toBeNull();
    expect(industry.textContent).not.toContain(derivedSector);

    // Type is a distinct editable field, seeded with the party role — never conflated with Industry.
    const type = drawer.querySelector('[data-crm-inline-edit-trigger="cr664_organizationtype"]') as HTMLElement;
    expect(type).not.toBeNull();
    expect(type.textContent).toContain('Borrower');
  });

  it('Factory Arc Phase 8 — "Missing contact roles" counts organizations with zero linked people', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: {
          status: 'ready',
          records: [rec('o1', 'Has Contact'), rec('o2', 'No Contact'), rec('o3', 'Also No Contact')],
        },
        people: { status: 'ready', records: [rec('p1', 'Jane Doe', { organizationId: 'o1' })] },
      }),
    );
    const card = container.querySelector('[data-crm-card="Missing contact roles"]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText('2')).toBeInTheDocument();
  });

  it('Factory Arc Phase 8 — an honest empty state when every organization has a contact', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Has Contact')] },
        people: { status: 'ready', records: [rec('p1', 'Jane Doe', { organizationId: 'o1' })] },
      }),
    );
    const card = container.querySelector('[data-crm-card="Missing contact roles"]') as HTMLElement;
    expect(within(card).getByText('Every company has a contact')).toBeInTheDocument();
  });

  it('Factory Arc Phase 8 — "Recent activity" shows the real last-activity date (the first loaded record)', async () => {
    // loadCrmWorkspaceData() (crmWorkspaceData.ts) always pre-sorts the timeline domain
    // newest-first before this component ever sees it (this test injects loadData
    // directly, bypassing that loader, so the fixture below supplies the order the
    // real loader would have produced — records[0] is what the component reads).
    const { container } = await renderHub(
      fixture({
        timelineEvents: {
          status: 'ready',
          records: [
            rec('a2', 'note', { occurredAt: '2026-06-20T10:00:00Z', eventType: 'note' }),
            rec('a1', 'call', { occurredAt: '2026-06-01T10:00:00Z', eventType: 'call' }),
          ],
        },
      }),
    );
    const card = container.querySelector('[data-crm-card="Recent activity"]') as HTMLElement;
    expect(card.textContent).toMatch(/Jun.*20.*2026|2026.*Jun.*20/i);
  });

  it('uses no banker-facing engineering language', async () => {
    const { container } = await renderHub(fixture());
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['not wired', 'writeback gated', 'future phase', 'command center readiness', 'no governed', 'read-only in this release', 'diagnostics']) {
      expect(text).not.toContain(banned);
    }
    // The footer states writes are verified + recorded (governed, bank-friendly).
    expect(text).toContain('verified and recorded');
  });
});

describe('N-33 — duplicate-company banner (Production Remediation Factory Arc Phase 2)', () => {
  it('the exact reported production scenario: "OmniCare 365" x2 + "Omnicare 365" x1 surfaces one cluster on the Companies view', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: {
          status: 'ready',
          records: [
            rec('org-omnicare-1', 'OmniCare 365'),
            rec('org-omnicare-2', 'OmniCare 365'),
            rec('org-omnicare-3', 'Omnicare 365'),
            rec('org-other', 'Totally Unrelated Co'),
          ],
        },
      }),
    );
    await waitFor(() => expect(container.querySelector('[data-crm-duplicate-banner]')).not.toBeNull());
    const banner = container.querySelector('[data-crm-duplicate-banner]') as HTMLElement;
    expect(banner.textContent).toMatch(/1 possible duplicate company group found/i);
    const cluster = container.querySelector('[data-crm-duplicate-cluster="name"]') as HTMLElement;
    expect(cluster.textContent).toContain('OmniCare 365');
    expect(cluster.textContent).toContain('Omnicare 365');
    expect(cluster.textContent).not.toContain('Totally Unrelated Co');
  });

  it('renders no banner at all when there are no duplicates', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings'), rec('o2', 'Globex Inc')] },
      }),
    );
    await waitFor(() => expect(container.querySelector('[data-crm-cards]')).not.toBeNull());
    expect(container.querySelector('[data-crm-duplicate-banner]')).toBeNull();
  });

  it('never merges or deletes -- both duplicate records still render as separate rows in the table', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: {
          status: 'ready',
          records: [rec('org-omnicare-1', 'OmniCare 365'), rec('org-omnicare-2', 'OmniCare 365')],
        },
      }),
    );
    await waitFor(() => expect(container.querySelector('[data-crm-duplicate-banner]')).not.toBeNull());
    expect(container.querySelectorAll('[data-crm-record]').length).toBe(2);
  });
});
