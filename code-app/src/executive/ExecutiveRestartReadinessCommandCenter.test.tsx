// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExecutiveRestartReadinessCommandCenter } from './ExecutiveRestartReadinessCommandCenter';

describe('Phase 233 — Executive Restart Readiness Command Center', () => {
  it('renders a high-visibility lending restart readiness cockpit', () => {
    render(<ExecutiveRestartReadinessCommandCenter />);

    expect(
      screen.getByRole('region', { name: /Executive Restart Readiness Command Center/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Lending department restart readiness/i)).toBeInTheDocument();
  });

  it('shows the restart domains across roles and live gate categories', () => {
    render(<ExecutiveRestartReadinessCommandCenter />);
    const region = screen.getByRole('region', { name: /Executive Restart Readiness Command Center/i });

    for (const label of [
      'Banker operating readiness',
      'Manager supervision readiness',
      'Admin activation readiness',
      'Internal OGB CRM',
      'Internal lending workflow',
      'Portfolio boarding',
      'Live gate categories',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('surfaces leadership assurances and no-hidden-writes copy', () => {
    render(<ExecutiveRestartReadinessCommandCenter />);
    expect(
      screen.getByText(/No hidden writes are enabled by this restart readiness view/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No external Salesforce or nCino dependency is implied/i),
    ).toBeInTheDocument();
  });

  it('exposes no buttons, forms, inputs, or write controls', () => {
    const { container } = render(<ExecutiveRestartReadinessCommandCenter />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });
});
