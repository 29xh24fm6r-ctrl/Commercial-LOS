// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./AdminDataProvider', () => ({
  useAdminData: vi.fn(),
}));
vi.mock('./AdminContext', () => ({
  useAdmin: vi.fn(),
}));
vi.mock('./dataQuality/loadDataQualityScanInputs', () => ({
  loadDataQualityScanInputs: vi.fn(),
}));
vi.mock('./createDataQualityFlagAction', () => ({
  createDataQualityFlag: vi.fn(),
}));

import { useAdminData } from './AdminDataProvider';
import { useAdmin } from './AdminContext';
import { loadDataQualityScanInputs } from './dataQuality/loadDataQualityScanInputs';
import { createDataQualityFlag } from './createDataQualityFlagAction';
import { AdminDataQualityDetectionPanel } from './AdminDataQualityDetectionPanel';

const useAdminDataMock = vi.mocked(useAdminData);
const useAdminMock = vi.mocked(useAdmin);
const loadInputsMock = vi.mocked(loadDataQualityScanInputs);
const createFlagMock = vi.mocked(createDataQualityFlag);

const refresh = vi.fn();

function baseAdminData(overrides: Partial<ReturnType<typeof useAdminData>> = {}) {
  return {
    dataQuality: { kind: 'ready', data: [] },
    auditAnomalies: { kind: 'ready', data: [] },
    alerts: { kind: 'ready', data: [] },
    refreshStatus: { kind: 'ready', data: null },
    configuration: { kind: 'ready', data: {} },
    platformOperations: { kind: 'ready', data: {} },
    refresh,
    ...overrides,
  } as unknown as ReturnType<typeof useAdminData>;
}

function baseAdmin(overrides: Partial<ReturnType<typeof useAdmin>> = {}) {
  return {
    upn: 'admin@oldglorybank.com',
    fullName: 'Admin User',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...overrides,
  } as unknown as ReturnType<typeof useAdmin>;
}

const emptyInputs = {
  inputs: { organizations: [], deals: [], entitlements: [], boardedLoans: [] },
  failedDomains: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAdminDataMock.mockReturnValue(baseAdminData());
  useAdminMock.mockReturnValue(baseAdmin());
});

describe('AdminDataQualityDetectionPanel', () => {
  it('renders nothing scan-related before the button is clicked', () => {
    render(<AdminDataQualityDetectionPanel />);
    expect(screen.getByText('Scan for data quality issues')).toBeInTheDocument();
    expect(screen.queryByText(/candidate/i)).not.toBeInTheDocument();
  });

  it('shows "no new data quality issues detected" when the scan finds nothing', async () => {
    loadInputsMock.mockResolvedValue(emptyInputs);
    const user = userEvent.setup();
    render(<AdminDataQualityDetectionPanel />);
    await user.click(screen.getByText('Scan for data quality issues'));
    await waitFor(() => {
      expect(screen.getByText('No new data quality issues detected.')).toBeInTheDocument();
    });
  });

  it('renders a candidate row with its category, description, and source', async () => {
    loadInputsMock.mockResolvedValue({
      inputs: {
        organizations: [],
        deals: [
          { dealId: 'd1', dealName: 'X', amount: 0 },
        ],
        entitlements: [],
        boardedLoans: [],
      },
      failedDomains: [],
    });
    const user = userEvent.setup();
    render(<AdminDataQualityDetectionPanel />);
    await user.click(screen.getByText('Scan for data quality issues'));
    await waitFor(() => {
      expect(screen.getByText('Active deal with no recorded amount')).toBeInTheDocument();
    });
    expect(screen.getByText(/zero-amount-deal/)).toBeInTheDocument();
    expect(screen.getByText(/cr664_loandeal \/ d1/)).toBeInTheDocument();
  });

  it('excludes a candidate that already matches an open flag', async () => {
    useAdminDataMock.mockReturnValue(
      baseAdminData({
        dataQuality: {
          kind: 'ready',
          data: [
            {
              id: 'f1',
              flagName: 'Active deal with no recorded amount',
              flagDescription: undefined,
              flagType: 'InvalidValue',
              resolutionStatus: 'Open',
              flaggedDate: undefined,
              sourceTable: 'cr664_loandeal',
              sourceRecordId: 'd1',
            },
          ],
        },
      }) as never,
    );
    loadInputsMock.mockResolvedValue({
      inputs: {
        organizations: [],
        deals: [{ dealId: 'd1', dealName: 'X', amount: 0 }],
        entitlements: [],
        boardedLoans: [],
      },
      failedDomains: [],
    });
    const user = userEvent.setup();
    render(<AdminDataQualityDetectionPanel />);
    await user.click(screen.getByText('Scan for data quality issues'));
    await waitFor(() => {
      expect(screen.getByText('No new data quality issues detected.')).toBeInTheDocument();
    });
  });

  it('creates a flag on click and shows "Flag created" afterward, then refreshes', async () => {
    loadInputsMock.mockResolvedValue({
      inputs: {
        organizations: [],
        deals: [{ dealId: 'd1', dealName: 'X', amount: 0 }],
        entitlements: [],
        boardedLoans: [],
      },
      failedDomains: [],
    });
    createFlagMock.mockResolvedValue({ kind: 'success', flagId: 'flag-1', auditEventId: 'audit-1' });
    const user = userEvent.setup();
    render(<AdminDataQualityDetectionPanel />);
    await user.click(screen.getByText('Scan for data quality issues'));
    await waitFor(() => {
      expect(screen.getByText('Create flag')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create flag'));
    await waitFor(() => {
      expect(screen.getByText('Flag created')).toBeInTheDocument();
    });
    expect(refresh).toHaveBeenCalledWith('after-dq-create');
  });

  it('shows the create error inline and keeps the button enabled when creation fails', async () => {
    loadInputsMock.mockResolvedValue({
      inputs: {
        organizations: [],
        deals: [{ dealId: 'd1', dealName: 'X', amount: 0 }],
        entitlements: [],
        boardedLoans: [],
      },
      failedDomains: [],
    });
    createFlagMock.mockResolvedValue({ kind: 'create-failed', createError: 'boom' });
    const user = userEvent.setup();
    render(<AdminDataQualityDetectionPanel />);
    await user.click(screen.getByText('Scan for data quality issues'));
    await waitFor(() => {
      expect(screen.getByText('Create flag')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create flag'));
    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument();
    });
    expect(screen.getByText('Create flag')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not render Create flag buttons when the admin has no systemUserId (write disabled)', async () => {
    useAdminMock.mockReturnValue(baseAdmin({ systemUserId: undefined, writeDisabledReason: 'no core user bind' }));
    loadInputsMock.mockResolvedValue({
      inputs: {
        organizations: [],
        deals: [{ dealId: 'd1', dealName: 'X', amount: 0 }],
        entitlements: [],
        boardedLoans: [],
      },
      failedDomains: [],
    });
    const user = userEvent.setup();
    render(<AdminDataQualityDetectionPanel />);
    await user.click(screen.getByText('Scan for data quality issues'));
    await waitFor(() => {
      expect(screen.getByText('Active deal with no recorded amount')).toBeInTheDocument();
    });
    expect(screen.queryByText('Create flag')).not.toBeInTheDocument();
    expect(screen.getByText(/no core user bind/)).toBeInTheDocument();
  });

  it('surfaces which domains failed to load without blocking the candidates that did load', async () => {
    loadInputsMock.mockResolvedValue({
      inputs: {
        organizations: [],
        deals: [{ dealId: 'd1', dealName: 'X', amount: 0 }],
        entitlements: [],
        boardedLoans: [],
      },
      failedDomains: [{ domain: 'entitlements', message: 'read failed' }],
    });
    const user = userEvent.setup();
    render(<AdminDataQualityDetectionPanel />);
    await user.click(screen.getByText('Scan for data quality issues'));
    await waitFor(() => {
      expect(screen.getByText(/Could not scan: entitlements/)).toBeInTheDocument();
    });
  });

  it('shows a scan-failed error block when the loader throws', async () => {
    loadInputsMock.mockRejectedValue(new Error('network unavailable'));
    const user = userEvent.setup();
    render(<AdminDataQualityDetectionPanel />);
    await user.click(screen.getByText('Scan for data quality issues'));
    await waitFor(() => {
      expect(screen.getByText('Scan failed')).toBeInTheDocument();
    });
    expect(screen.getByText('network unavailable')).toBeInTheDocument();
  });
});
