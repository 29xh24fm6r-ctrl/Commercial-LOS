// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OgbCrmWorkflowActivationPanel } from './OgbCrmWorkflowActivationPanel';

/**
 * Phase 202 — OGB CRM / Lending Workflow activation panel tests.
 *
 * Read-only admin projection: shows internal OGB CRM + lending workflow as
 * active, with unsafe write categories gated. No action controls, no external
 * brand copy, no "external connection disabled" posture.
 */

describe('OgbCrmWorkflowActivationPanel', () => {
  it('renders the title', () => {
    render(<OgbCrmWorkflowActivationPanel />);
    expect(screen.getByText(/OGB CRM & Lending Workflow Activation/)).toBeTruthy();
  });

  it('shows internal OGB CRM and lending workflow as active', () => {
    render(<OgbCrmWorkflowActivationPanel />);
    expect(screen.getByText('OGB CRM active')).toBeTruthy();
    expect(screen.getByText('Internal lending workflow active')).toBeTruthy();
  });

  it('shows the launched write categories as enabled', () => {
    const { container } = render(<OgbCrmWorkflowActivationPanel />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Writeback enabled/i);
    expect(text).toMatch(/Checklist generation enabled/i);
    expect(text).toMatch(/Borrower comms enabled/i);
    expect(text).toMatch(/Pilot create enabled \(pilot-only\)/i);
  });

  it('renders no action controls (read-only)', () => {
    const { container } = render(<OgbCrmWorkflowActivationPanel />);
    // The no-button checks are authoritative for "action-free".
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input, a[href], [role="button"]')).toHaveLength(0);
    // No action-affordance phrasing (status copy like "Pilot create" is fine).
    expect(container.textContent).not.toMatch(/Sync now|Enable live|Apply now|Create now|Send now/i);
  });

  it('does not present an external-connection-disabled posture or external brand copy', () => {
    const { container } = render(<OgbCrmWorkflowActivationPanel />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/external connection disabled/i);
    expect(html).not.toMatch(/\bSalesforce\b/i);
    expect(html).not.toMatch(/\bnCino\b/i);
  });
});
