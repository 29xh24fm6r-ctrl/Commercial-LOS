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
    // Completion Phase A reset the live-write gates to their safe defaults (off), so the
    // forbidden-gate guard is not tripped and the governed read/operate restart is certified.
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

  it('surfaces the WF-1A posture: live-mutation expansion enabled (stage advance armed) with the other categories still gated', () => {
    render(<V1GoLiveReleaseCertificationPanel />);
    // WF-1A armed the stage-advancement live-write gate, so live mutation expansion reads enabled.
    expect(screen.getByText(/Live mutation expansion: enabled/i)).toBeInTheDocument();
    const gated = screen.getByRole('region', { name: /Intentionally gated live-write categories/i });
    // New Deal create + portfolio boarding stay gated; stage advancement is no longer gated.
    expect(within(gated).getByText('New Deal create')).toBeInTheDocument();
    expect(within(gated).getByText('Portfolio boarding live persistence')).toBeInTheDocument();
    expect(within(gated).queryByText('Stage advancement')).not.toBeInTheDocument();
  });

  it('exposes no buttons, forms, inputs, or write controls (read-only)', () => {
    const { container } = render(<V1GoLiveReleaseCertificationPanel />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });
});
