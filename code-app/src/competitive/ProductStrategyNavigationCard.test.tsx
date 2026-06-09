// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductStrategyNavigationCard } from './ProductStrategyNavigationCard';
import { buildExecutiveProductStrategySurfaceState } from './buildExecutiveProductStrategySurfaceState';

const state = buildExecutiveProductStrategySurfaceState({ clock: '2026-06-09T00:00:00.000Z' });
const TO = '/workspaces/executive?surface=product-strategy';

describe('Phase 142I — ProductStrategyNavigationCard', () => {
  it('renders a card with an internal link when a target is provided', () => {
    const { container } = render(<ProductStrategyNavigationCard state={state} to={TO} />);
    expect(screen.getByText('Product Strategy Command Center')).toBeTruthy();
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe(TO);
  });

  it('renders a caveated, link-less card when no target is provided', () => {
    const { container } = render(<ProductStrategyNavigationCard state={state} />);
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText(/not available in this context/i)).toBeTruthy();
  });

  it('uses no unsafe action wording', () => {
    const { container } = render(<ProductStrategyNavigationCard state={state} to={TO} />);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['start ', 'apply', 'enable', 'execute']) {
      expect(text).not.toContain(w);
    }
  });

  it('exposes no button / onClick / external URL', () => {
    const { container } = render(<ProductStrategyNavigationCard state={state} to={TO} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
