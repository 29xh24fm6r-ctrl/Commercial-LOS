// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompetitiveSafetyPosturePanel } from './CompetitiveSafetyPosturePanel';
import { deriveExecutiveProductStrategyDashboard } from './deriveExecutiveProductStrategyDashboard';

const safetyPosture = deriveExecutiveProductStrategyDashboard({ generatedAt: '2026-06-09T00:00:00.000Z' }).safetyPosture;

describe('Phase 142H — CompetitiveSafetyPosturePanel', () => {
  it('renders disabled / forbidden categories', () => {
    render(<CompetitiveSafetyPosturePanel safetyPosture={safetyPosture} />);
    expect(screen.getByText('Final credit approval / decline')).toBeTruthy();
    expect(screen.getByText('Live integrations')).toBeTruthy();
    expect(screen.getByText('Admin apply')).toBeTruthy();
  });

  it('gives every category a reason and future-activation prerequisite', () => {
    render(<CompetitiveSafetyPosturePanel safetyPosture={safetyPosture} />);
    expect(screen.getAllByText(/Future activation requires:/i).length).toBe(safetyPosture.items.length);
  });

  it('exposes no toggles or enable buttons', () => {
    const { container } = render(<CompetitiveSafetyPosturePanel safetyPosture={safetyPosture} />);
    expect(container.querySelectorAll('button, input[type="checkbox"], input[type="radio"]').length).toBe(0);
    expect((container.textContent ?? '').toLowerCase()).not.toMatch(/coming soon|enable now/);
  });
});
