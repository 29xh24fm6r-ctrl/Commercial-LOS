// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ManagerOperatingCommandCenter } from './ManagerOperatingCommandCenter';

describe('Phase 233 — Manager Operating Command Center', () => {
  it('renders a team CRM + LOS supervision cockpit', () => {
    render(<ManagerOperatingCommandCenter />);

    expect(
      screen.getByRole('region', { name: /Manager Operating Command Center/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('CRM + LOS active')).toBeInTheDocument();
    expect(screen.getByText(/Team CRM \+ LOS supervision cockpit/i)).toBeInTheDocument();
  });

  it('shows all major manager supervision domains', () => {
    render(<ManagerOperatingCommandCenter />);
    const region = screen.getByRole('region', { name: /Manager Operating Command Center/i });

    for (const label of [
      'Pipeline supervision',
      'Banker workload balance',
      'CRM relationship coverage',
      'Workflow bottlenecks',
      'New Deal intake gate posture',
      'Document checklist readiness',
      'CRM writeback gate',
      'Borrower communication gate',
      'Portfolio boarding gate',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('points managers to existing supervision anchors', () => {
    render(<ManagerOperatingCommandCenter />);
    const anchors = screen.getByRole('region', { name: /Supervision anchors/i });

    expect(within(anchors).getByText('manager-workflow-launch-readiness')).toBeInTheDocument();
    expect(within(anchors).getByText('crm-manager-working-surface')).toBeInTheDocument();
  });

  it('exposes no buttons, forms, inputs, or write controls', () => {
    const { container } = render(<ManagerOperatingCommandCenter />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });
});
