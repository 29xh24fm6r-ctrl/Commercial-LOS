// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const { useDealDataMock } = vi.hoisted(() => ({ useDealDataMock: vi.fn() }));
vi.mock('../deals/DealDataProvider', () => ({ useDealData: useDealDataMock }));

import { buildSafeTeamsChannelPreview, redactTeamsChannelContent } from './teamsChannelContentPolicy';
import {
  createDisabledTeamsChannelPostAdapter,
  createGovernedTeamsChannelPostAdapter,
  getApprovedTeamsChannelTargets,
  resetTeamsChannelPostAdapterForTest,
} from './teamsChannelPostAdapter';
import { resolveTeamsChannelPostEnabled } from './teamsChannelPostFeatureFlags';
import { TeamsChannelPostPanel } from './TeamsChannelPostPanel';

afterEach(() => resetTeamsChannelPostAdapterForTest());

describe('M365-5 Teams channel posting boundary', () => {
  it('feature gate defaults disabled', () => {
    expect(resolveTeamsChannelPostEnabled({})).toBe(false);
    expect(resolveTeamsChannelPostEnabled({ VITE_TEAMS_CHANNEL_POST_ENABLED: 'false' })).toBe(false);
    expect(resolveTeamsChannelPostEnabled({ VITE_TEAMS_CHANNEL_POST_ENABLED: 'true' })).toBe(true);
  });

  it('redacts forbidden content from safe previews', () => {
    const redacted = redactTeamsChannelContent('TIN: 12-3456789 account number 123456789 Bearer abc.def');
    expect(redacted).not.toContain('12-3456789');
    expect(redacted).not.toContain('123456789');
    expect(redacted).not.toContain('Bearer abc.def');
    expect(redacted).toContain('[REDACTED]');
  });

  it('builds proposal with governed alias and content hash', () => {
    const proposal = buildSafeTeamsChannelPreview({
      dealId: 'deal-1',
      dealName: 'Riverside',
      stage: 'Underwriting',
      assignedBanker: 'Banker A',
      blockers: ['Missing appraisal'],
      targetAlias: 'credit-ops-test-channel',
      correlationId: 'corr',
    });
    expect(proposal.targetAlias).toBe('credit-ops-test-channel');
    expect(proposal.contentHash).toMatch(/^h[0-9a-f]{8}$/);
    expect(proposal.idempotencyKey).toBe(`credit-ops-test-channel|${proposal.contentHash}|corr`);
    expect(proposal.safePreview).toMatch(/Missing appraisal/);
  });

  it('ships approved channel targets inactive until operator activation', () => {
    const targets = getApprovedTeamsChannelTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].alias).toBe('credit-ops-test-channel');
    expect(targets[0].active).toBe(false);
  });

  it('disabled adapter never posts', async () => {
    const proposal = buildSafeTeamsChannelPreview({
      dealId: 'deal-1',
      dealName: 'Riverside',
      targetAlias: 'credit-ops-test-channel',
      correlationId: 'corr',
    });
    const outcome = await createDisabledTeamsChannelPostAdapter().post(proposal);
    expect(outcome.kind).toBe('WRITE_DISABLED');
    expect(outcome.message).toMatch(/disabled/);
  });

  it('governed adapter blocks inactive targets before transport send', async () => {
    const proposal = buildSafeTeamsChannelPreview({
      dealId: 'deal-1',
      dealName: 'Riverside',
      targetAlias: 'credit-ops-test-channel',
      correlationId: 'corr',
    });
    const transport = { send: vi.fn() };
    const outcome = await createGovernedTeamsChannelPostAdapter({ transport }).post(proposal);
    expect(outcome.kind).toBe('WRITE_DISABLED');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('panel previews and confirms into disabled state without claiming success', async () => {
    useDealDataMock.mockReturnValue({
      deal: { id: 'deal-1', dealName: 'Riverside', stage: 'Underwriting', bankerName: 'Banker A' },
    });
    render(<TeamsChannelPostPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Prepare Teams channel post/i }));
    expect(screen.getByRole('dialog', { name: /Teams channel post preview/i })).toBeInTheDocument();
    expect(screen.getByText(/Target alias: credit-ops-test-channel/i)).toBeInTheDocument();
    expect(screen.getByText(/Idempotency key: credit-ops-test-channel\|/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirm server-side post request/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/WRITE_DISABLED/);
    expect(screen.queryByText(/posted successfully/i)).not.toBeInTheDocument();
  });
});
