// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompetitiveCapabilityDashboard } from './CompetitiveCapabilityDashboard';

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
