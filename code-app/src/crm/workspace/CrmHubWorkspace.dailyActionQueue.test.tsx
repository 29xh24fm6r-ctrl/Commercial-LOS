// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));
// CRM-ELITE-1 Phase 4 — force the daily-action-queue flag on so it renders,
// without waiting on the real flag flip.
vi.mock('../crmFeatureFlags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../crmFeatureFlags')>();
  return { ...actual, CRM_DAILY_ACTION_QUEUE_ENABLED: true };
});
import { render, screen, waitFor } from '@testing-library/react';
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

describe('CRM-ELITE-1 Phase 4 — banker daily action queue (flag on)', () => {
  it('shows real missing-contact and activity-gap actions on the Companies view, never the metaphor-lane categories', async () => {
    await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings'), rec('o2', 'Globex Inc')] },
        people: { status: 'ready', records: [] }, // both orgs have zero contacts — real gap
        timelineEvents: { status: 'ready', records: [] }, // both orgs have zero activity — real gap
      }),
    );
    expect(screen.getByText('CRM Daily Action Queue')).toBeInTheDocument();
    // 2 orgs x (missing contact + activity gap) = 4 actions, no metaphor-lane categories.
    expect(screen.getByText(/Total: 4/)).toBeInTheDocument();
    expect(screen.getAllByText(/has no CRM contacts on record/).length).toBe(2);
    expect(screen.getAllByText(/No activity on record/).length).toBe(2);
    expect(screen.queryByText(/Review CRM match/)).toBeNull();
    expect(screen.queryByText(/Resolve source-of-truth conflict/)).toBeNull();
  });

  it('is not shown on other views (mounted only at the top of Companies)', async () => {
    const { container } = await renderHub(
      fixture({ organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings')] } }),
    );
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-crm-view="contacts"]') as HTMLElement);
    expect(screen.queryByText('CRM Daily Action Queue')).toBeNull();
  });

  it('shows the honest empty state when there are no real gaps', async () => {
    await renderHub(
      fixture({
        organizations: { status: 'ready', records: [rec('o1', 'Acme Holdings')] },
        people: { status: 'ready', records: [rec('p1', 'Jane Doe', { organizationId: 'o1' })] },
        timelineEvents: {
          status: 'ready',
          records: [rec('a1', 'call', { organizationId: 'o1', eventType: 'call', occurredAt: new Date().toISOString() })],
        },
      }),
    );
    expect(screen.getByText(/Total: 0/)).toBeInTheDocument();
    expect(screen.getByText('No CRM review actions.')).toBeInTheDocument();
  });
});
