// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./AdminDataProvider', () => ({ useAdminData: vi.fn() }));

import { useAdminData } from './AdminDataProvider';
import { PlatformOperationsWorkspacePanel } from './PlatformOperationsWorkspacePanel';

const useAdminDataMock = vi.mocked(useAdminData);

/**
 * Factory Arc Phase 4 — the AdminWorkspace wrapper around the (pre-existing,
 * Phase 210) observe-only OperatorLaunchConsole. Verifies the three async
 * states and that a ready state actually renders the injected capabilities —
 * no fabricated "ready" state while data is loading/failed.
 */
describe('PlatformOperationsWorkspacePanel', () => {
  it('shows a loading state while data has not resolved', () => {
    useAdminDataMock.mockReturnValue({ platformOperations: { kind: 'loading' } } as unknown as ReturnType<
      typeof useAdminData
    >);
    render(<PlatformOperationsWorkspacePanel />);
    expect(screen.getByText(/Loading platform operations/i)).toBeInTheDocument();
  });

  it('shows an honest local error state when the query fails', () => {
    useAdminDataMock.mockReturnValue({
      platformOperations: { kind: 'failed', message: 'not_registered: cr664_auditevents' },
    } as unknown as ReturnType<typeof useAdminData>);
    render(<PlatformOperationsWorkspacePanel />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Could not load platform operations/i);
    expect(alert.textContent).toMatch(/not_registered/i);
  });

  it('renders the console with the live capabilities when ready', () => {
    useAdminDataMock.mockReturnValue({
      platformOperations: {
        kind: 'ready',
        data: {
          deploymentCommit: 'abc1234',
          capabilities: [
            {
              key: 'new-deal-create',
              label: 'New Deal creation',
              category: 'deal',
              flags: [{ name: 'BANKER_CREATE_PILOT_ENABLED', value: true, required: true }],
              rollback: 'Set BANKER_CREATE_PILOT_ENABLED = false.',
            },
          ],
        },
      },
    } as unknown as ReturnType<typeof useAdminData>);
    render(<PlatformOperationsWorkspacePanel />);
    expect(screen.getByTestId('capability-new-deal-create')).toBeInTheDocument();
    expect(screen.getByTestId('operator-launch-console-deployment-commit').textContent).toMatch(/abc1234/);
  });
});
