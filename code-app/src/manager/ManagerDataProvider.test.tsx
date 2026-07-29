// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ManagerDataProvider } from './ManagerDataProvider';
import {
  loadManagerTeamDocuments,
  loadManagerTeamMemos,
  loadManagerTeamMemoSections,
  loadManagerTeamTasks,
  loadTeamBankers,
  loadTeamPipeline,
} from './managerQueries';

vi.mock('./ManagerContext', () => ({
  useManager: () => ({ teamId: 'team-1' }),
}));

vi.mock('./managerQueries', () => ({
  loadTeamPipeline: vi.fn(),
  loadTeamBankers: vi.fn(),
  loadManagerTeamTasks: vi.fn(),
  loadManagerTeamDocuments: vi.fn(),
  loadManagerTeamMemos: vi.fn(),
  loadManagerTeamMemoSections: vi.fn(),
}));

const loadTeamPipelineMock = vi.mocked(loadTeamPipeline);
const loadTeamBankersMock = vi.mocked(loadTeamBankers);
const loadManagerTeamTasksMock = vi.mocked(loadManagerTeamTasks);
const loadManagerTeamDocumentsMock = vi.mocked(loadManagerTeamDocuments);
const loadManagerTeamMemosMock = vi.mocked(loadManagerTeamMemos);
const loadManagerTeamMemoSectionsMock = vi.mocked(loadManagerTeamMemoSections);

describe('ManagerDataProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadTeamBankersMock.mockResolvedValue([
      {
        id: 'banker-1',
        fullName: 'Banker One',
        email: 'banker@example.com',
        roleType: 'Banker',
        active: true,
      },
    ]);
    loadTeamPipelineMock.mockResolvedValue([]);
    loadManagerTeamTasksMock.mockResolvedValue([]);
    loadManagerTeamDocumentsMock.mockResolvedValue([]);
    loadManagerTeamMemosMock.mockResolvedValue([]);
    loadManagerTeamMemoSectionsMock.mockResolvedValue([]);
  });

  it('loads the manager pipeline with the same governed production population as banker dashboard views', async () => {
    render(
      <ManagerDataProvider>
        <div>child</div>
      </ManagerDataProvider>,
    );

    await waitFor(() => {
      expect(loadTeamPipelineMock).toHaveBeenCalledWith('team-1', {
        memberBankerIds: ['banker-1'],
      });
    });
  });

  it('keeps the governed default pipeline when the banker roster fallback is used', async () => {
    loadTeamBankersMock.mockRejectedValueOnce(new Error('roster unavailable'));

    render(
      <ManagerDataProvider>
        <div>child</div>
      </ManagerDataProvider>,
    );

    await waitFor(() => {
      expect(loadTeamPipelineMock).toHaveBeenCalledWith('team-1');
    });
  });
});
