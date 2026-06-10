// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminConfigurationApplyPreviewPanel } from './AdminConfigurationApplyPreviewPanel';
import { createAdminConfigurationControlledApplyEngine } from './createAdminConfigurationControlledApplyEngine';
import { deriveAdminConfigurationApplyReadiness } from './deriveAdminConfigurationApplyReadiness';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import { validateAdminConfigurationProposal } from './validateAdminConfigurationProposal';
import { resolveAdminConfigApplyFeatureFlags } from './adminConfigurationApplyFeatureFlags';
import { submitAdminConfigurationApplyProof, buildAdminConfigurationApplyProofRequest } from './adminConfigurationTransport';
import type { AdminConfigurationProposal, AdminConfigurationProposalType } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';
const FLAGS = resolveAdminConfigApplyFeatureFlags();
const ENGINE = createAdminConfigurationControlledApplyEngine({ flags: FLAGS });

function proposal(type: AdminConfigurationProposalType): AdminConfigurationProposal {
  const base = buildAdminConfigurationProposal({ proposalId: 'P1', proposalType: type, title: 'Adjust view', summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK });
  return { ...base, status: 'approved_not_applied' };
}

function readinessFor(p: AdminConfigurationProposal) {
  return deriveAdminConfigurationApplyReadiness({ proposal: p, validation: validateAdminConfigurationProposal({ proposal: p }), flags: FLAGS });
}

describe('Phase 142K — AdminConfigurationApplyPreviewPanel', () => {
  it('renders the dry-run-only banner and the no-changes banner', () => {
    const p = proposal('platform_object_change');
    render(<AdminConfigurationApplyPreviewPanel readiness={readinessFor(p)} plan={ENGINE.previewApply(p).plan} proposalTitle="Adjust view" />);
    expect(screen.getByText(/Dry-run only/i)).toBeTruthy();
    expect(screen.getByText('No changes will be applied.')).toBeTruthy();
  });

  it('renders a safe preview plan', () => {
    const p = proposal('platform_object_change');
    render(<AdminConfigurationApplyPreviewPanel readiness={readinessFor(p)} plan={ENGINE.previewApply(p).plan} />);
    expect(screen.getByText(/Apply plan steps/i)).toBeTruthy();
  });

  it('renders a blocked unsafe plan', () => {
    const p = proposal('dataverse_schema_change');
    const preview = ENGINE.previewApply(p);
    render(<AdminConfigurationApplyPreviewPanel readiness={readinessFor(p)} plan={preview.plan} />);
    expect(screen.getByText('Blockers')).toBeTruthy();
  });

  it('exposes no apply / deploy / publish / activate / execute / save / schema / route controls', () => {
    const p = proposal('platform_object_change');
    const { container } = render(<AdminConfigurationApplyPreviewPanel readiness={readinessFor(p)} plan={ENGINE.previewApply(p).plan} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['apply now', 'deploy', 'publish', 'activate', 'save config', 'mutate schema', 'create field', 'register route', 'enable integration', 'widen permission']) {
      expect(text).not.toContain(w);
    }
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });

  it('renders the fake transport proof section when provided (no live write copy)', () => {
    const p = proposal('platform_object_change');
    const plan = ENGINE.previewApply(p).plan!;
    const proof = submitAdminConfigurationApplyProof(buildAdminConfigurationApplyProofRequest(plan, { requestedAt: CLOCK, actor: 'admin-1' }));
    const { container } = render(<AdminConfigurationApplyPreviewPanel readiness={readinessFor(p)} plan={plan} transportProof={proof} />);
    expect(screen.getByText(/Transport boundary proof \(fake \/ offline\)/i)).toBeTruthy();
    expect(screen.getByText(/Live write performed: false/)).toBeTruthy();
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toMatch(/live applied|applied live|deployed live|deploy now/);
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
