// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutiveProductStrategyPanel } from './ExecutiveProductStrategyPanel';
import { deriveExecutiveProductStrategyDashboard } from './deriveExecutiveProductStrategyDashboard';

const state = deriveExecutiveProductStrategyDashboard({ generatedAt: '2026-06-09T00:00:00.000Z' });

describe('Phase 142H — ExecutiveProductStrategyPanel', () => {
  it('renders the executive strategy state and KPIs', () => {
    render(<ExecutiveProductStrategyPanel state={state} />);
    expect(screen.getByText(/Strategy view only/i)).toBeTruthy();
    expect(screen.getByText('Current capability score')).toBeTruthy();
    expect(screen.getByText('Shipped platform capabilities')).toBeTruthy();
  });

  it('renders differentiators, gaps, and roadmap', () => {
    render(<ExecutiveProductStrategyPanel state={state} />);
    expect(screen.getByText('Top differentiators')).toBeTruthy();
    expect(screen.getByText('Top gaps (intentionally governed)')).toBeTruthy();
    expect(screen.getByText(/Roadmap \(governed/)).toBeTruthy();
  });

  it('shows the safety posture', () => {
    render(<ExecutiveProductStrategyPanel state={state} />);
    expect(screen.getByText('Safety posture')).toBeTruthy();
  });

  it('exposes no action buttons, no fetch, no external URLs', () => {
    const { container } = render(<ExecutiveProductStrategyPanel state={state} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['start phase', 'create task', 'apply config', 'enable integration', 'register route', 'export final', 'approve credit', 'waive covenant', 'send outreach']) {
      expect(text).not.toContain(w);
    }
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
