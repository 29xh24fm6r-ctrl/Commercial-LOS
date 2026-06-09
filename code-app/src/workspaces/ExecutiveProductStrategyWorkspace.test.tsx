// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutiveProductStrategyWorkspace } from './ExecutiveProductStrategyWorkspace';
import { buildExecutiveProductStrategySurfaceState } from '../competitive/buildExecutiveProductStrategySurfaceState';

describe('Phase 142I — ExecutiveProductStrategyWorkspace', () => {
  it('renders the product strategy command center title and safety banner', () => {
    render(<ExecutiveProductStrategyWorkspace />);
    expect(screen.getByText('Product Strategy Command Center')).toBeTruthy();
    expect(screen.getByText(/Read-only strategy surface\. No configuration changes/i)).toBeTruthy();
  });

  it('renders the executive strategy, reference, and safety panels', () => {
    render(<ExecutiveProductStrategyWorkspace />);
    expect(screen.getByText('Executive product strategy')).toBeTruthy();
    expect(screen.getByText('Competitive reference platforms')).toBeTruthy();
    expect(screen.getAllByText('Safety posture').length).toBeGreaterThanOrEqual(1);
  });

  it('renders caveats when optional metadata is missing', () => {
    const state = buildExecutiveProductStrategySurfaceState({ clock: '2026-06-09T00:00:00.000Z', includeIntegration: false });
    render(<ExecutiveProductStrategyWorkspace state={state} />);
    expect(screen.getByText('Data caveats')).toBeTruthy();
  });

  it('exposes no action buttons, fetch, writes, or external URLs', () => {
    const { container } = render(<ExecutiveProductStrategyWorkspace />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
