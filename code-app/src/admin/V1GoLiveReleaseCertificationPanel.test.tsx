// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { V1GoLiveReleaseCertificationPanel } from './V1GoLiveReleaseCertificationPanel';

describe('Phase 236 — V1.0 Go-Live Release Certification panel', () => {
  it('renders the read-only release certification', () => {
    render(<V1GoLiveReleaseCertificationPanel />);
    expect(
      screen.getByRole('region', { name: /V1.0 Go-Live Release Certification/i }),
    ).toBeInTheDocument();
    // After the 256B launch the live-write gates are enabled, so the model trips its
    // forbidden-gate guard (checklist generation on) and reports verify-required.
    expect(screen.getByText(/Verify required/i)).toBeInTheDocument();
  });

  it('shows the required coverage gates', () => {
    render(<V1GoLiveReleaseCertificationPanel />);
    const region = screen.getByRole('region', { name: /V1.0 Go-Live Release Certification/i });
    for (const label of [
      'Production build gate',
      'Full regression suite gate',
      'Banker operating coverage',
      'Manager operating coverage',
      'Executive restart readiness coverage',
      'Admin operator action queue coverage',
      'Internal CRM + LOS activation coverage',
      'Portfolio boarding readiness coverage',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('surfaces the launched live-write posture with New Deal create still gated', () => {
    render(<V1GoLiveReleaseCertificationPanel />);
    // Live-write categories are enabled after the launch, so expansion now reads enabled.
    expect(screen.getByText(/Live mutation expansion: enabled/i)).toBeInTheDocument();
    const gated = screen.getByRole('region', { name: /Intentionally gated live-write categories/i });
    // New Deal create stays gated by its global constant; portfolio boarding is now live.
    expect(within(gated).getByText('New Deal create')).toBeInTheDocument();
    expect(within(gated).queryByText('Portfolio boarding live persistence')).toBeNull();
  });

  it('exposes no buttons, forms, inputs, or write controls (read-only)', () => {
    const { container } = render(<V1GoLiveReleaseCertificationPanel />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });
});
