// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminConfigurationReviewQueuePanel } from './AdminConfigurationReviewQueuePanel';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import { validateAdminConfigurationProposal } from './validateAdminConfigurationProposal';
import { deriveAdminConfigurationReviewQueue } from './deriveAdminConfigurationReviewQueue';
import type { AdminConfigurationProposal } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';

function p(id: string, type: Parameters<typeof buildAdminConfigurationProposal>[0]['proposalType'], over: Record<string, unknown> = {}): AdminConfigurationProposal {
  return buildAdminConfigurationProposal({
    proposalId: id, proposalType: type,
    title: `Proposal ${id}`, summary: 'A governed metadata change.', proposedChangeSummary: 'Reorder columns.',
    requestedBy: 'admin-1', clock: CLOCK, submitForReview: true, ...over,
  });
}

function queue(proposals: AdminConfigurationProposal[]) {
  const validations = proposals.map((proposal) => validateAdminConfigurationProposal({ proposal }));
  return deriveAdminConfigurationReviewQueue({ proposals, validations, reviewContext: { grantedPermissions: ['admin.config.review'] }, queueId: 'Q1', generatedAt: CLOCK });
}

describe('Phase 142G — AdminConfigurationReviewQueuePanel', () => {
  it('renders the proposal queue and review-only banner', () => {
    render(<AdminConfigurationReviewQueuePanel queue={queue([p('P1', 'platform_object_change')])} />);
    expect(screen.getByText(/Review-only — proposed configuration changes are not applied/i)).toBeTruthy();
    expect(screen.getByText('Proposal P1')).toBeTruthy();
  });

  it('renders a blocked schema proposal with its validation blockers', () => {
    render(<AdminConfigurationReviewQueuePanel queue={queue([p('P2', 'dataverse_schema_change')])} />);
    expect(screen.getByText('Validation blockers')).toBeTruthy();
  });

  it('renders the approved_not_applied banner', () => {
    const approved = { ...p('P3', 'platform_object_change'), status: 'approved_not_applied' as const };
    render(<AdminConfigurationReviewQueuePanel queue={queue([approved])} />);
    expect(screen.getByText(/Approved for future implementation only/i)).toBeTruthy();
  });

  it('exposes no apply / deploy / publish / activate / schema / integration / route / workflow / credit / send controls', () => {
    const { container } = render(<AdminConfigurationReviewQueuePanel queue={queue([p('P1', 'platform_object_change'), p('P2', 'dataverse_schema_change')])} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['apply proposal', 'deploy', 'publish', 'activate', 'create field', 'edit schema', 'enable integration', 'register route', 'save config', 'execute workflow', 'approve credit', 'waive covenant', 'send borrower']) {
      expect(text).not.toContain(w);
    }
  });

  it('renders without persistence readiness data (optional prop)', () => {
    const { container } = render(<AdminConfigurationReviewQueuePanel queue={queue([p('P1', 'platform_object_change')])} />);
    expect(container.textContent ?? '').not.toContain('Persistence readiness (142J)');
  });

  it('renders the persistence readiness summary when provided (no save / apply controls)', () => {
    const { container } = render(
      <AdminConfigurationReviewQueuePanel
        queue={queue([p('P1', 'platform_object_change')])}
        persistence={{ persistenceMode: 'disabled', schemaStatus: 'not ready', saveDisabledReason: 'persistence disabled', applyDisabledReason: 'apply forbidden' }}
      />,
    );
    expect(screen.getByText(/Persistence readiness \(142J\)/)).toBeTruthy();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders without apply workflow data and renders it when provided (no apply controls)', () => {
    const { container: without } = render(<AdminConfigurationReviewQueuePanel queue={queue([p('P1', 'platform_object_change')])} />);
    expect(without.textContent ?? '').not.toContain('Controlled apply (142K)');
    const { container } = render(
      <AdminConfigurationReviewQueuePanel
        queue={queue([p('P1', 'platform_object_change')])}
        apply={{ previewReadyCount: 1, blockedCount: 2, dryRunOnly: true, executionDisabledReason: 'execution disabled', nextBestAction: 'Prepare operator spec.' }}
      />,
    );
    expect(screen.getByText(/Controlled apply \(142K\)/)).toBeTruthy();
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
