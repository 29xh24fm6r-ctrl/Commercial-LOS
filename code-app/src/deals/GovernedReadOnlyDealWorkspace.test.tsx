// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { GovernedReadOnlyDealWorkspace } from './GovernedReadOnlyDealWorkspace';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { get: vi.fn() },
}));

const getDeal = vi.mocked(Cr664_loandealsService.get);

beforeEach(() => getDeal.mockReset());

describe('GovernedReadOnlyDealWorkspace', () => {
  it('reads one Dataverse deal and exposes no mutation controls', async () => {
    getDeal.mockResolvedValue({
      success: true,
      data: {
        cr664_loandealid: 'deal-1',
        cr664_dealname: 'Acme Expansion',
        cr664_clientname: 'Acme Corp',
        cr664_stagereferencename: 'Underwriting',
        cr664_statusreferencename: 'Open',
      },
    } as never);
    render(
      <MemoryRouter>
        <GovernedReadOnlyDealWorkspace dealId="deal-1" role="Executive" returnTo="/workspaces/executive" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Acme Expansion')).toBeInTheDocument());
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('fails closed when Dataverse denies or cannot return the record', async () => {
    getDeal.mockResolvedValue({ success: false, error: { message: '403 raw transport detail' } } as never);
    render(
      <MemoryRouter>
        <GovernedReadOnlyDealWorkspace dealId="deal-2" role="Admin" returnTo="/workspaces/admin" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Deal unavailable')).toBeInTheDocument());
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw transport detail');
  });
});
