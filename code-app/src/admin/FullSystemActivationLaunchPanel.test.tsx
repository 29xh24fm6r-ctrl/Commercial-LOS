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
    // After the 256B full launch, all six domains are certified and enabled.
    expect(screen.getByText(/Full launch achieved/i)).toBeInTheDocument();
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
    // After the 256B full launch, all six live-write domains report Enabled.
    expect(within(region).getAllByText('Enabled').length).toBe(6);
    expect(within(region).queryAllByText('Blocked').length).toBe(0);
  });

  it('exposes no buttons, forms, inputs, or write controls (read-only)', () => {
    const { container } = render(<FullSystemActivationLaunchPanel />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });
});
