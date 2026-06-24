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
    expect(screen.getByText(/Operating restart ready/i)).toBeInTheDocument();
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

  it('surfaces the gated live-write posture (expansion gated, not enabled)', () => {
    render(<V1GoLiveReleaseCertificationPanel />);
    expect(screen.getByText(/Live-write expansion gated/i)).toBeInTheDocument();
    const gated = screen.getByRole('region', { name: /Intentionally gated live-write categories/i });
    expect(within(gated).getByText('New Deal create')).toBeInTheDocument();
    expect(within(gated).getByText('Portfolio boarding live persistence')).toBeInTheDocument();
  });

  it('exposes no buttons, forms, inputs, or write controls (read-only)', () => {
    const { container } = render(<V1GoLiveReleaseCertificationPanel />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });
});
