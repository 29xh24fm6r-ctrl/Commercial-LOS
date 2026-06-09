// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompetitiveCapabilityDashboard } from './CompetitiveCapabilityDashboard';
import { deriveExecutiveProductStrategyDashboard } from './deriveExecutiveProductStrategyDashboard';

/**
 * Phase 142A — competitive dashboard pins (strategy / read-only).
 */

describe('Phase 142A — competitive dashboard', () => {
  it('renders the matrix summary, gaps, and next phases', () => {
    render(<CompetitiveCapabilityDashboard />);
    expect(screen.getByText(/categories scored across/i)).toBeInTheDocument();
    expect(screen.getByText(/top gaps to close/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 142B/)).toBeInTheDocument();
  });

  it('renders the backlog with risk classes', () => {
    render(<CompetitiveCapabilityDashboard />);
    expect(screen.getAllByText(/metadata_only|credit_decision_support|external_integration_disabled/).length).toBeGreaterThanOrEqual(1);
  });

  it('has no write controls and no external links', () => {
    const { container } = render(<CompetitiveCapabilityDashboard />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('a[href^="http"]').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});

describe('Phase 142B — competitive dashboard platform-metadata integration', () => {
  it('renders without platform metadata (optional prop)', () => {
    const { container } = render(<CompetitiveCapabilityDashboard />);
    expect(container.textContent ?? '').not.toContain('Platform metadata status');
  });

  it('renders the platform metadata summary when provided', () => {
    render(
      <CompetitiveCapabilityDashboard
        platformMetadata={{ objectModelStatus: '22 objects (read-only)', viewModelStatus: '12 views', workflowRoutingStatus: '10 routes', productProcessStatus: '8 templates' }}
      />,
    );
    expect(screen.getByText(/Platform metadata status/i)).toBeInTheDocument();
    expect(screen.getByText(/22 objects/)).toBeInTheDocument();
  });

  it('the integration adds no route / fetch / write', () => {
    const { container } = render(<CompetitiveCapabilityDashboard platformMetadata={{ objectModelStatus: 'ok' }} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});

describe('Phase 142H — competitive dashboard composition', () => {
  it('renders with only 142A data (no executive strategy)', () => {
    const { container } = render(<CompetitiveCapabilityDashboard />);
    expect(container.textContent ?? '').not.toContain('Executive product strategy');
  });

  it('renders the executive strategy, reference, and safety panels when provided', () => {
    const state = deriveExecutiveProductStrategyDashboard({ generatedAt: '2026-06-09T00:00:00.000Z' });
    render(<CompetitiveCapabilityDashboard executiveStrategy={state} />);
    expect(screen.getByText('Executive product strategy')).toBeInTheDocument();
    expect(screen.getByText('Competitive reference platforms')).toBeInTheDocument();
    expect(screen.getAllByText('Safety posture').length).toBeGreaterThanOrEqual(1);
  });

  it('adds no action buttons, fetch, or route registration', () => {
    const state = deriveExecutiveProductStrategyDashboard({ generatedAt: '2026-06-09T00:00:00.000Z' });
    const { container } = render(<CompetitiveCapabilityDashboard executiveStrategy={state} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
