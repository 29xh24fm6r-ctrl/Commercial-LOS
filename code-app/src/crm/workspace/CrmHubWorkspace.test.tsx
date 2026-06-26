// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  const utils = render(<CrmHubWorkspace loadData={async () => data} />);
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

  it('renders the scaffolding immediately (header present even before data resolves — never blank)', () => {
    const { container } = render(<CrmHubWorkspace loadData={() => new Promise(() => {})} />);
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
