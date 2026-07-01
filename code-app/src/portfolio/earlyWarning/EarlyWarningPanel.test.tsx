// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EarlyWarningPanel } from './EarlyWarningPanel';
import { deriveEarlyWarningQueue } from './earlyWarning';

describe('EarlyWarningPanel', () => {
  it('shows honest absence when nothing needs attention', () => {
    render(<EarlyWarningPanel queue={deriveEarlyWarningQueue([{ loanId: 'A', now: '2026-06-30' }])} />);
    expect(screen.getByLabelText('Early warning')).toHaveAttribute('data-early-warning', 'empty');
  });

  it('renders prioritized alerts with their signals', () => {
    const q = deriveEarlyWarningQueue([
      { loanId: 'A', now: '2026-06-30', pastDueDays: 95, covenantStatus: 'breach' },
      { loanId: 'B', now: '2026-06-30', ratingMigration: 'downgrade' },
    ]);
    render(<EarlyWarningPanel queue={q} />);
    const panel = screen.getByLabelText('Early warning');
    expect(panel).toHaveAttribute('data-early-warning', 'ready');
    // Critical A sorts first.
    const first = panel.querySelector('[data-ew-alert]');
    expect(first?.getAttribute('data-ew-alert')).toBe('A');
    expect(first?.getAttribute('data-ew-priority')).toBe('critical');
    expect(panel.querySelector('[data-ew-signal="covenant"]')).not.toBeNull();
  });
});
