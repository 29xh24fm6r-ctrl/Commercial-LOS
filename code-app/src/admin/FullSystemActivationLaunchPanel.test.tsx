// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FullSystemActivationLaunchPanel } from './FullSystemActivationLaunchPanel';

describe('Phase 237 — Full System Activation Launch panel', () => {
  it('renders the read-only activation certification', () => {
    render(<FullSystemActivationLaunchPanel />);
    expect(
      screen.getByRole('region', { name: /Full System Activation Launch Certification/i }),
    ).toBeInTheDocument();
    // Launch Phase 5: the committed final-launch evidence is integrity-insufficient, so the
    // panel honestly reports launch NOT yet achieved (it no longer contradicts the verifier).
    expect(screen.getByText(/Full launch not yet achieved/i)).toBeInTheDocument();
  });

  it('shows all six live-write domains with a status', () => {
    render(<FullSystemActivationLaunchPanel />);
    const region = screen.getByRole('region', { name: /Full System Activation Launch Certification/i });
    for (const label of [
      'New Deal create',
      'CRM writeback / live persistence',
      'Document checklist generation',
      'Borrower communication send',
      'Stage advancement',
      'Portfolio boarding live persistence',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
    // Launch Phase 5: only New Deal create (pilot-certified) is Enabled; the five
    // evidence-gated domains are Blocked until authentic evidence lands.
    expect(within(region).getAllByText('Enabled').length).toBe(1);
    expect(within(region).getAllByText('Blocked').length).toBe(5);
  });

  it('exposes no buttons, forms, inputs, or write controls (read-only)', () => {
    const { container } = render(<FullSystemActivationLaunchPanel />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });
});
