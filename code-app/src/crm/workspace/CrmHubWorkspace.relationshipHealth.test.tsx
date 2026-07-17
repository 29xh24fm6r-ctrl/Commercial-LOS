// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));
// CRM-ELITE-1 Phase 2 — force the display flag on so the health card + team
// rollup render, without waiting on the real flag flip. Only this test file's
// module graph sees the flag as enabled; CrmHubWorkspace.test.tsx keeps
// exercising the real (off) default.
vi.mock('../crmFeatureFlags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../crmFeatureFlags')>();
  return { ...actual, CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED: true };
});
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrmHubWorkspace } from './CrmHubWorkspace';
import type { CrmWorkspaceData, CrmDomainKey, CrmRecord } from './crmWorkspaceData';

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

describe('CRM-ELITE-1 Phase 2 — real relationship health + team rollup (flag on)', () => {
  it('an unauthorized viewer sees the entitlement-blocked rollup, never aggregated numbers', async () => {
    await renderHub(fixture({ organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings')] } }));
    const rollup = screen.getByTestId('crm-rollup-team');
    expect(rollup).toHaveAttribute('data-entitled', 'false');
    expect(screen.getByText(/Not entitled to this CRM rollup/i)).toBeInTheDocument();
  });

  it('shows the team rollup above the record table with the real derived counts once authorized', async () => {
    const utils = render(
      <CrmHubWorkspace
        actorEmail="banker@bank.example"
        actorSystemUserId="sysuser-1"
        loadData={async () =>
          fixture({
            organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings')] },
            people: { status: 'ready', records: [rec('p1', 'Jane Doe', { organizationId: 'o1' })] },
            relationships: { status: 'ready', records: [rec('rel1', 'Acme Coverage', { organizationId: 'o1' })] },
            timelineEvents: {
              status: 'ready',
              records: [rec('a1', 'call', { organizationId: 'o1', eventType: 'call', occurredAt: '2026-07-01T00:00:00Z' })],
            },
          })
        }
      />,
    );
    await waitFor(() => expect(utils.container.querySelector('[data-crm-cards]')).not.toBeNull());
    const rollup = await screen.findByTestId('crm-rollup-team');
    expect(rollup).toHaveAttribute('data-entitled', 'true');
    expect(within(screen.getByTestId('crm-team-totals')).getByText(/open tasks 0/)).toBeInTheDocument();
  });

  it('shows the real relationship-health card in the company detail drawer, derived from this org’s data', async () => {
    const { container } = await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings')] },
        people: { status: 'ready', records: [rec('p1', 'Jane Doe', { organizationId: 'o1' })] },
        relationships: { status: 'ready', records: [rec('rel1', 'Acme Coverage', { organizationId: 'o1' })] },
      }),
    );
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-record="o1"]') as HTMLElement);
    const drawer = container.querySelector('[data-crm-detail-drawer]') as HTMLElement;
    const healthCard = within(drawer).getByTestId('crm-relationship-health');
    expect(healthCard).toBeInTheDocument();
    // 1 contact + 1 coverage relationship on record → real, non-fabricated evidence.
    expect(within(healthCard).getByText(/1 contact\(s\) on record/)).toBeInTheDocument();
    expect(within(healthCard).getByText(/1 authorized coverage member\(s\) on record/)).toBeInTheDocument();
  });

  it('does not render a health card when the selected record has no health input (e.g. an unrelated view record)', async () => {
    const { container } = await renderHub(
      fixture({
        vendorProfiles: { status: 'ready', records: [rec('v1', 'Title Co', { subtitle: 'Title' })] },
      }),
    );
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-view="vendors"]') as HTMLElement);
    await user.click(container.querySelector('[data-crm-record="v1"]') as HTMLElement);
    const drawer = container.querySelector('[data-crm-detail-drawer]') as HTMLElement;
    expect(within(drawer).queryByTestId('crm-relationship-health')).toBeNull();
  });
});
