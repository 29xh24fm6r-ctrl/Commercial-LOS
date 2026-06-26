// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrmHubWorkspace } from './CrmHubWorkspace';
import type { CrmWorkspaceData, CrmDomainKey, CrmRecord } from './crmWorkspaceData';

/**
 * Phase 258 — CRM Hub renders live-shaped records (from fixtures), opens a
 * record detail drawer, and surfaces honest empty / unavailable states.
 */

function rec(id: string, title: string, extra: Partial<CrmRecord> = {}): CrmRecord {
  return { id, title, detail: [], ...extra };
}

function emptyResult() {
  return { status: 'ready' as const, records: [] as CrmRecord[] };
}

function fixture(overrides: Partial<Record<CrmDomainKey, CrmWorkspaceData[CrmDomainKey]>> = {}): CrmWorkspaceData {
  const base: CrmWorkspaceData = {
    organizations: emptyResult(),
    people: emptyResult(),
    relationships: emptyResult(),
    roleAssignments: emptyResult(),
    contactPoints: emptyResult(),
    communicationPreferences: emptyResult(),
    contactAuthorizations: emptyResult(),
    vendorProfiles: emptyResult(),
    timelineEvents: emptyResult(),
    auditEntries: emptyResult(),
  };
  return { ...base, ...overrides };
}

function loaderFor(data: CrmWorkspaceData) {
  return async () => data;
}

async function renderHub(data: CrmWorkspaceData) {
  const utils = render(<CrmHubWorkspace loadData={loaderFor(data)} />);
  await waitFor(() => {
    expect(utils.container.querySelector('[data-crm-cards]')).not.toBeNull();
  });
  return utils;
}

describe('Phase 258 — CrmHubWorkspace', () => {
  it('renders dashboard count cards for all 10 CRM domains', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Acme'), rec('o2', 'Globex')] },
        people: { status: 'ready', records: [rec('p1', 'Dana Banker')] },
      }),
    );
    expect(container.querySelectorAll('[data-crm-card]').length).toBe(10);
    const orgCard = container.querySelector('[data-crm-card="organizations"]') as HTMLElement;
    expect(within(orgCard).getByText('2')).toBeInTheDocument();
    const peopleCard = container.querySelector('[data-crm-card="people"]') as HTMLElement;
    expect(within(peopleCard).getByText('1')).toBeInTheDocument();
  });

  it('renders organizations by default and switches to people/relationships on card click', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings', { subtitle: 'Manufacturing' })] },
        people: { status: 'ready', records: [rec('p1', 'Dana Banker', { subtitle: 'CFO' })] },
        relationships: { status: 'ready', records: [rec('r1', 'Acme ⇄ Dana', { badge: 'Active' })] },
      }),
    );
    const user = userEvent.setup();
    // Default domain is organizations.
    expect(container.querySelector('[data-crm-list="organizations"]')).not.toBeNull();
    expect(screen.getByText('Acme Holdings')).toBeInTheDocument();

    await user.click(container.querySelector('[data-crm-card="people"]') as HTMLElement);
    expect(container.querySelector('[data-crm-list="people"]')).not.toBeNull();
    expect(screen.getByText('Dana Banker')).toBeInTheDocument();

    await user.click(container.querySelector('[data-crm-card="relationships"]') as HTMLElement);
    expect(container.querySelector('[data-crm-list="relationships"]')).not.toBeNull();
    expect(screen.getByText('Acme ⇄ Dana')).toBeInTheDocument();
  });

  it('opens a record detail drawer with detail rows on record click', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: {
          status: 'ready',
          records: [
            rec('o1', 'Acme Holdings', {
              subtitle: 'Manufacturing',
              badge: 'Active',
              detail: [
                { label: 'Legal name', value: 'Acme Holdings, LLC' },
                { label: 'Industry', value: 'Manufacturing' },
              ],
            }),
          ],
        },
      }),
    );
    const user = userEvent.setup();
    expect(container.querySelector('[data-crm-detail-drawer]')).toBeNull();

    await user.click(container.querySelector('[data-crm-record="o1"]') as HTMLElement);
    const drawer = container.querySelector('[data-crm-detail-drawer]') as HTMLElement;
    expect(drawer).not.toBeNull();
    expect(within(drawer).getByText('Acme Holdings, LLC')).toBeInTheDocument();
    expect(within(drawer).getByText('Industry')).toBeInTheDocument();

    // Drawer closes.
    await user.click(within(drawer).getByLabelText('Close detail'));
    expect(container.querySelector('[data-crm-detail-drawer]')).toBeNull();
  });

  it('shows honest empty and per-domain unavailable states (no fabricated rows)', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: emptyResult(),
        vendorProfiles: { status: 'failed', records: [], error: 'read failed' },
      }),
    );
    const user = userEvent.setup();
    // Empty organizations.
    expect(screen.getByText(/No organization records yet/i)).toBeInTheDocument();
    // A failed domain card shows "—" and its list is unavailable.
    const vendorCard = container.querySelector('[data-crm-card="vendorProfiles"]') as HTMLElement;
    expect(within(vendorCard).getByText('—')).toBeInTheDocument();
    await user.click(vendorCard);
    expect(container.querySelector('[data-crm-list-unavailable]')).not.toBeNull();
  });

  it('renders an activity timeline domain', async () => {
    const { container } = await renderHub(
      fixture({
        timelineEvents: {
          status: 'ready',
          records: [rec('t1', 'Note added', { subtitle: 'Called borrower', occurredAt: '2026-06-20T10:00:00Z' })],
        },
      }),
    );
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-card="timelineEvents"]') as HTMLElement);
    expect(container.querySelector('[data-crm-list="timelineEvents"]')).not.toBeNull();
    expect(screen.getByText('Note added')).toBeInTheDocument();
  });

  it('uses no developer/readiness/command-center copy', async () => {
    const { container } = await renderHub(fixture());
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['writeback gated', 'readiness', 'command center', 'source-of-truth', 'not yet wired', 'read-only command']) {
      expect(text).not.toContain(banned);
    }
  });
});
