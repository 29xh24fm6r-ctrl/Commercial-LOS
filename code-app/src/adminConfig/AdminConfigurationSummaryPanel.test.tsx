// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminConfigurationSummaryPanel } from './AdminConfigurationSummaryPanel';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import { deriveAdminConfigurationReviewQueue } from './deriveAdminConfigurationReviewQueue';
import type { AdminConfigurationProposal } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';

function p(id: string, type: Parameters<typeof buildAdminConfigurationProposal>[0]['proposalType']): AdminConfigurationProposal {
  return buildAdminConfigurationProposal({
    proposalId: id, proposalType: type,
    title: `Proposal ${id}`, summary: 'A governed metadata change.', proposedChangeSummary: 'Reorder columns.',
    requestedBy: 'admin-1', clock: CLOCK, submitForReview: true,
  });
}

function queue() {
  const proposals = [p('P1', 'platform_object_change'), p('P2', 'dataverse_schema_change'), p('P3', 'integration_provider_change')];
  return deriveAdminConfigurationReviewQueue({ proposals, reviewContext: { grantedPermissions: ['admin.config.review'] }, queueId: 'Q1', generatedAt: CLOCK });
}

describe('Phase 142G — AdminConfigurationSummaryPanel', () => {
  it('renders summary counts', () => {
    render(<AdminConfigurationSummaryPanel queue={queue()} />);
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Blocked unsafe')).toBeTruthy();
  });

  it('renders the risk distribution', () => {
    render(<AdminConfigurationSummaryPanel queue={queue()} />);
    expect(screen.getByText('Risk distribution')).toBeTruthy();
  });

  it('renders the governance banner', () => {
    render(<AdminConfigurationSummaryPanel queue={queue()} />);
    expect(screen.getByText(/no configuration is applied, deployed, published, or activated/i)).toBeTruthy();
  });

  it('exposes no mutation controls', () => {
    const { container } = render(<AdminConfigurationSummaryPanel queue={queue()} />);
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders without persistence data and renders it when provided (no controls)', () => {
    const { container: without } = render(<AdminConfigurationSummaryPanel queue={queue()} />);
    expect(without.textContent ?? '').not.toContain('Persistence readiness (142J)');
    const { container } = render(<AdminConfigurationSummaryPanel queue={queue()} persistence={{ persistenceMode: 'disabled', schemaStatus: 'not ready' }} />);
    expect(screen.getByText(/Persistence readiness \(142J\)/)).toBeTruthy();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders the controlled apply summary when provided (no apply controls)', () => {
    const { container } = render(<AdminConfigurationSummaryPanel queue={queue()} apply={{ previewReadyCount: 1, blockedCount: 2, dryRunOnly: true }} />);
    expect(screen.getByText(/Controlled apply \(142K\)/)).toBeTruthy();
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
