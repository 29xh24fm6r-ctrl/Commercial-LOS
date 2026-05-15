// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { AdminData } from './AdminDataProvider';
import {
  DELIBERATELY_BLOCKED,
  GOVERNED_WRITES,
  LOCAL_ONLY_FLOWS,
  NOT_WIRED,
} from '../shared/governance/platformInventory';

// The real AdminDataProvider transitively imports @microsoft/power-apps
// service files Vitest cannot resolve. Stub the hook the same way
// DealStageProgressionCard.test.tsx stubs useDealData.
vi.mock('./AdminDataProvider', () => ({
  useAdminData: vi.fn(),
}));

import { useAdminData } from './AdminDataProvider';
import { ReleaseReadinessGate } from './ReleaseReadinessGate';

const useAdminDataMock = vi.mocked(useAdminData);

function makeAdminData(overrides: Partial<AdminData> = {}): AdminData {
  return {
    dataQuality: { kind: 'ready', data: [] },
    auditAnomalies: { kind: 'ready', data: [] },
    alerts: { kind: 'ready', data: [] },
    refreshStatus: { kind: 'ready', data: null },
    configuration: {
      kind: 'ready',
      data: { systemSettings: [], activeKpiThresholds: [] },
    },
    refresh: () => undefined,
    ...overrides,
  };
}

describe('ReleaseReadinessGate — Phase 30 admin dashboard', () => {
  it('renders the overall badge and the eight category rows', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    // Overall badge — at minimum we see one of the four phrases.
    const overallTexts = screen.getAllByText(
      /Not ready to promote|Review required|Cannot fully verify|Ready to promote/i,
    );
    expect(overallTexts.length).toBeGreaterThan(0);
    // Eight category labels exist inside the readiness list.
    // Phase 68 added a Capability Inventory section that also
    // surfaces some of the same labels; scope queries to the
    // readiness list so the assertion remains unambiguous.
    const readinessList = screen.getByRole('list', {
      name: /release readiness categories/i,
    });
    expect(
      within(readinessList).getByText(/Workspace isolation/i),
    ).toBeInTheDocument();
    expect(
      within(readinessList).getByText(/Permission-before-query/i),
    ).toBeInTheDocument();
    expect(
      within(readinessList).getByText(/Executive snapshot safety/i),
    ).toBeInTheDocument();
    expect(
      within(readinessList).getByText(/Admin diagnostics health/i),
    ).toBeInTheDocument();
    expect(
      within(readinessList).getByText(/Governed write coverage/i),
    ).toBeInTheDocument();
    expect(
      within(readinessList).getByText(/Stage progression readiness/i),
    ).toBeInTheDocument();
    expect(
      within(readinessList).getByText(/Data quality \/ alert backlog/i),
    ).toBeInTheDocument();
    expect(
      within(readinessList).getByText(/Test coverage \/ build verification/i),
    ).toBeInTheDocument();
  });

  it('reports the Stage Progression row as Blocked (Phase 28 schema gap, observable today)', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    // The stage row carries a Blocked badge. The badge is
    // appearance="outline"; check for the text variant.
    const stageRow = screen
      .getByText(/Stage progression readiness/i)
      .closest('li')!;
    expect(stageRow.textContent).toMatch(/Blocked/i);
  });

  it('reports Test coverage / build verification as Not Wired (per the brief guardrail)', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    // Scope to the readiness list since Phase 68's Capability
    // Inventory also surfaces a NOT_WIRED entry with a similar
    // label ("Test coverage / build verification (in-app)").
    const readinessList = screen.getByRole('list', {
      name: /release readiness categories/i,
    });
    const row = within(readinessList)
      .getByText(/Test coverage \/ build verification/i)
      .closest('li')!;
    expect(row.textContent).toMatch(/Not Wired/i);
    expect(row.textContent).toMatch(/no in-process signal/i);
  });

  it('rolls overall up to "Not ready to promote" because the stage row is Blocked', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    expect(
      screen.getByText(/Not ready to promote — blockers open/i),
    ).toBeInTheDocument();
  });

  it('renders NO action / promote / deploy / approve button — read-only gate', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    // The brief: "No promotion or remediation action is performed here."
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('footer reiterates read-only intent and the Not-Wired honesty rule', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    expect(
      screen.getByText(/Read-only governance gate/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not observable in-app is reported as Not Wired/i),
    ).toBeInTheDocument();
  });

  it('rolls up to Blocked when a critical alert is observed in the admin data', () => {
    useAdminDataMock.mockReturnValue(
      makeAdminData({
        alerts: {
          kind: 'ready',
          data: [
            {
              id: 'a1',
              alertName: 'SLA breach',
              alertStatus: 'Open',
              severity: 'Critical',
              severityKey: 'Critical',
              priority: undefined,
              alertCategory: undefined,
              alertType: undefined,
              assignedToName: undefined,
              assignedToId: undefined,
              createdDate: undefined,
              dueDate: undefined,
              slaBreachDate: undefined,
              slaDueDate: undefined,
              escalationLevel: undefined,
            },
          ],
        },
      }),
    );
    render(<ReleaseReadinessGate />);
    const row = screen
      .getByText(/Data quality \/ alert backlog/i)
      .closest('li')!;
    expect(row.textContent).toMatch(/Blocked/i);
    expect(row.textContent).toMatch(/1 critical alert/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 68 — Capability inventory section assertions
//
// The Capability Inventory surfaces the platformInventory canonical data
// so stakeholders can distinguish governed writes from local-only flows,
// not-wired-by-blocker-kind, and deliberately-blocked surfaces. The
// existing readiness rollup is unchanged — these tests pin the new
// section's content and conservative-copy discipline.
// ---------------------------------------------------------------------------

function getInventorySection(): HTMLElement {
  return screen.getByRole('region', { name: /capability inventory/i });
}

describe('ReleaseReadinessGate — Phase 68 capability inventory', () => {
  it('renders the Capability inventory section with its lead sentence', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const inv = getInventorySection();
    expect(inv).toBeInTheDocument();
    expect(
      within(inv).getByText(/Derived from the canonical platformInventory/i),
    ).toBeInTheDocument();
  });

  it('reports the current count of governed writes (count is 11 at Phase 70)', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const inv = getInventorySection();
    expect(GOVERNED_WRITES.length).toBe(11);
    expect(
      within(inv).getByText(`Governed writes (${GOVERNED_WRITES.length})`),
    ).toBeInTheDocument();
  });

  it('lists every LOCAL_ONLY flow with the "Local-only · no Dataverse write" pin', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const inv = getInventorySection();
    // Each LOCAL_ONLY_FLOWS label appears.
    for (const flow of LOCAL_ONLY_FLOWS) {
      expect(within(inv).getByText(flow.label)).toBeInTheDocument();
    }
    // The borrower-safe status packet (Phase 66 / 67) is explicitly
    // present.
    expect(
      within(inv).getByText('Borrower-safe status packet'),
    ).toBeInTheDocument();
    // The Phase 67 in-modal handoff is mentioned by the flow's note.
    expect(
      within(inv).getByText(/mailto/i),
    ).toBeInTheDocument();
    // The "Local-only · no Dataverse write" pin appears at least once
    // per flow.
    const pins = within(inv).getAllByText(
      /Local-only · no Dataverse write/i,
    );
    expect(pins.length).toBe(LOCAL_ONLY_FLOWS.length);
  });

  it('groups NOT_WIRED entries by blockerKind (connector / schema / compound / governance / observability)', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const inv = getInventorySection();
    // Each kind that has at least one entry surfaces its sub-group
    // header. At Phase 68 the inventory carries all five.
    expect(
      within(inv).getByText(/Connector not registered \(upstream blocked\)/i),
    ).toBeInTheDocument();
    expect(
      within(inv).getByText(/Schema column missing \(upstream blocked\)/i),
    ).toBeInTheDocument();
    expect(
      within(inv).getByText(/Compound upstream blocker/i),
    ).toBeInTheDocument();
    expect(
      within(inv).getByText(/Governance non-goal/i),
    ).toBeInTheDocument();
    expect(
      within(inv).getByText(/In-app observability not wired/i),
    ).toBeInTheDocument();
  });

  it('surfaces the borrower-portal entry as a compound upstream blocker (still NOT_WIRED)', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const inv = getInventorySection();
    const entry = NOT_WIRED.find((e) => e.id === 'borrower-portal');
    expect(entry).toBeDefined();
    expect(entry!.blockerKind).toBe('compound');
    expect(within(inv).getByText(entry!.label)).toBeInTheDocument();
  });

  it('surfaces document-upload as a schema-blocker (still NOT_WIRED)', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const inv = getInventorySection();
    const entry = NOT_WIRED.find((e) => e.id === 'document-upload');
    expect(entry).toBeDefined();
    expect(entry!.blockerKind).toBe('schema');
    expect(within(inv).getByText(entry!.label)).toBeInTheDocument();
  });

  it('surfaces outlook-connector-live-send as a connector-blocker (still NOT_WIRED)', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const inv = getInventorySection();
    const entry = NOT_WIRED.find(
      (e) => e.id === 'outlook-connector-live-send',
    );
    expect(entry).toBeDefined();
    expect(entry!.blockerKind).toBe('connector');
    expect(within(inv).getByText(entry!.label)).toBeInTheDocument();
  });

  it('lists every DELIBERATELY_BLOCKED entry with reason text', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const inv = getInventorySection();
    for (const entry of DELIBERATELY_BLOCKED) {
      expect(within(inv).getByText(entry.label)).toBeInTheDocument();
    }
    // Each entry carries the "Deliberately blocked" pin. The group
    // heading also contains the phrase, so the regex matches at
    // least (DELIBERATELY_BLOCKED.length + 1) times — header + N pins.
    const pins = within(inv).getAllByText(/Deliberately blocked/i);
    expect(pins.length).toBeGreaterThanOrEqual(DELIBERATELY_BLOCKED.length);
  });

  it('no LOCAL_ONLY flow ID appears in GOVERNED_WRITES (Phase 68 classification invariant)', () => {
    const writeIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    for (const flow of LOCAL_ONLY_FLOWS) {
      expect(writeIds.has(flow.id)).toBe(false);
    }
  });

  it('no NOT_WIRED ID appears in GOVERNED_WRITES (Phase 68 classification invariant)', () => {
    const writeIds = new Set(GOVERNED_WRITES.map((w) => w.id));
    for (const entry of NOT_WIRED) {
      expect(writeIds.has(entry.id)).toBe(false);
    }
  });
});

describe('ReleaseReadinessGate — Phase 68 conservative-copy ban list', () => {
  it('renders NO "production-ready" / "production ready" claim anywhere on screen', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bproduction[ -]?ready\b/i);
  });

  it('renders NO "live email enabled" / "email sent" / "email delivered" claim', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\blive email enabled\b/i);
    expect(everyText).not.toMatch(/\bemail (sent|delivered)\b/i);
    expect(everyText).not.toMatch(/\bsent\s+(an?\s+)?email\b/i);
  });

  it('renders NO "portal available" / "upload available" claim', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bportal available\b/i);
    expect(everyText).not.toMatch(/\bupload available\b/i);
  });

  it('uses the Phase 68 canonical labels verbatim ("handoff", "local-only", "not wired", "upstream", "connector not registered", "schema column missing")', () => {
    useAdminDataMock.mockReturnValue(makeAdminData());
    render(<ReleaseReadinessGate />);
    const everyText = document.body.textContent ?? '';
    // Each canonical label appears at least once in the rendered
    // gate. "Not wired" appears as a pin and as the overall
    // status; "upstream blocked" appears in the sub-group headings;
    // "handoff" appears in the LOCAL_ONLY note for the Phase 67
    // borrower-safe status packet.
    expect(everyText).toMatch(/handoff/i);
    expect(everyText).toMatch(/local-only/i);
    expect(everyText).toMatch(/not wired/i);
    expect(everyText).toMatch(/upstream/i);
    expect(everyText).toMatch(/connector not registered/i);
    expect(everyText).toMatch(/schema column missing/i);
  });
});
