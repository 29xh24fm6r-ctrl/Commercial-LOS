// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AdminData } from './AdminDataProvider';

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
    // Eight category labels exist.
    expect(screen.getByText(/Workspace isolation/i)).toBeInTheDocument();
    expect(screen.getByText(/Permission-before-query/i)).toBeInTheDocument();
    expect(screen.getByText(/Executive snapshot safety/i)).toBeInTheDocument();
    expect(screen.getByText(/Admin diagnostics health/i)).toBeInTheDocument();
    expect(screen.getByText(/Governed write coverage/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage progression readiness/i)).toBeInTheDocument();
    expect(screen.getByText(/Data quality \/ alert backlog/i)).toBeInTheDocument();
    expect(screen.getByText(/Test coverage \/ build verification/i)).toBeInTheDocument();
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
    const row = screen
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
