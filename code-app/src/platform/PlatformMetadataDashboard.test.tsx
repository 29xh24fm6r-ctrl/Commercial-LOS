// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformMetadataDashboard } from './PlatformMetadataDashboard';

describe('Phase 142B — platform metadata dashboard', () => {
  it('renders the dashboard with object / view / relationship counts', () => {
    render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(screen.getByText('Objects')).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Relationship edges')).toBeInTheDocument();
  });

  it('shows the metadata-only safety banner', () => {
    render(<PlatformMetadataDashboard />);
    expect(screen.getByText(/Metadata only — no schema mutation/i)).toBeInTheDocument();
  });

  it('renders workspace capability groups and next phases', () => {
    render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(screen.getByText(/Workspace capability groups/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 142C/)).toBeInTheDocument();
  });

  it('has no mutation controls (no buttons) and no external links', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('a[href^="http"]').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });

  it('is permission-scoped (banker dashboard hides manager-only objects)', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'banker' }} />);
    expect(container.textContent ?? '').not.toContain('FDIC Package');
  });

  it('renders without workflow routing data (optional prop)', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(container.textContent ?? '').not.toContain('Workflow routing (142C)');
  });

  it('renders the workflow routing summary when provided (no activation controls)', () => {
    const { container } = render(
      <PlatformMetadataDashboard
        context={{ workspace: 'strategy' }}
        workflowRouting={{ routeCount: 14, creditCommitteeRouteCount: 3, annualReviewRouteCount: 4, exceptionRouteCount: 1, selectedRoutePreview: 'sba_7a_standard' }}
      />,
    );
    expect(screen.getByText(/Workflow routing \(142C\)/)).toBeInTheDocument();
    expect(screen.getByText(/Routes: 14/)).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders without product/process template data (optional prop)', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(container.textContent ?? '').not.toContain('Product / process templates (142D)');
  });

  it('renders the product/process template summary when provided (no mutation controls)', () => {
    const { container } = render(
      <PlatformMetadataDashboard
        context={{ workspace: 'strategy' }}
        productProcessTemplates={{ totalTemplates: 10, activeCount: 10, plannedCount: 0, disabledCount: 0, productFamilies: ['SBA', 'commercial', 'CRE'], annualReviewTemplateCount: 2, fdicCommitteeTemplateCount: 2 }}
      />,
    );
    expect(screen.getByText(/Product \/ process templates \(142D\)/)).toBeInTheDocument();
    expect(screen.getByText(/Templates: 10/)).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders without servicing lifecycle data (optional prop)', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(container.textContent ?? '').not.toContain('Servicing lifecycle (142E)');
  });

  it('renders the servicing lifecycle summary when provided (no mutation controls)', () => {
    const { container } = render(
      <PlatformMetadataDashboard
        context={{ workspace: 'strategy' }}
        servicing={{ lifecycleStage: 'booked_active', lifecycleHealth: 'healthy', servicingExpectationCount: 4, blockerCount: 0, nextBestAction: 'Continue read-only lifecycle monitoring.' }}
      />,
    );
    expect(screen.getByText(/Servicing lifecycle \(142E\)/)).toBeInTheDocument();
    expect(screen.getByText(/Stage: booked_active/)).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders without integration readiness data (optional prop)', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(container.textContent ?? '').not.toContain('Integration readiness (142F)');
  });

  it('renders the integration readiness summary when provided (no mutation controls)', () => {
    const { container } = render(
      <PlatformMetadataDashboard
        context={{ workspace: 'strategy' }}
        integration={{ requiredCount: 4, blockedCount: 20, missingPolicyApprovals: 2, nextBestAction: 'Configure transport and obtain policy approval.' }}
      />,
    );
    expect(screen.getByText(/Integration readiness \(142F\)/)).toBeInTheDocument();
    expect(screen.getByText(/Required integrations: 4/)).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders without admin configuration data (optional prop)', () => {
    const { container } = render(<PlatformMetadataDashboard context={{ workspace: 'strategy' }} />);
    expect(container.textContent ?? '').not.toContain('Admin configuration review (142G)');
  });

  it('renders the admin configuration summary when provided (no apply controls)', () => {
    const { container } = render(
      <PlatformMetadataDashboard
        context={{ workspace: 'strategy' }}
        adminConfiguration={{ pendingCount: 3, blockedUnsafeCount: 2, approvedNotAppliedCount: 1, highRiskCount: 2, nextBestAction: 'Review pending proposals (no apply).' }}
      />,
    );
    expect(screen.getByText(/Admin configuration review \(142G\)/)).toBeInTheDocument();
    expect(screen.getByText(/Pending proposals: 3/)).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders the admin configuration persistence readiness when provided (142J)', () => {
    const { container } = render(
      <PlatformMetadataDashboard
        context={{ workspace: 'strategy' }}
        adminConfiguration={{ pendingCount: 1, persistenceMode: 'disabled', persistenceSchemaStatus: 'not ready' }}
      />,
    );
    expect(screen.getByText(/Persistence: disabled \(schema not ready\)/)).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
