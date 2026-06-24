// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminOperatorActionQueue } from './AdminOperatorActionQueue';

describe('Phase 234 — Admin Operator Action Queue', () => {
  it('renders the read-only operator action queue', () => {
    render(<AdminOperatorActionQueue />);
    expect(
      screen.getByRole('region', { name: /Admin Operator Action Queue/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/grouped operator tasks \(read-only\)/i)).toBeInTheDocument();
  });

  it('shows the operator task groups', () => {
    render(<AdminOperatorActionQueue />);
    const region = screen.getByRole('region', { name: /Admin Operator Action Queue/i });

    for (const label of [
      'Internal CRM + LOS activation',
      'New Deal create',
      'CRM writeback / live persistence',
      'Document checklist generation',
      'Borrower communications',
      'Portfolio boarding',
      'Full-system launch readiness',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('exposes no buttons, forms, inputs, or write controls (read-only)', () => {
    const { container } = render(<AdminOperatorActionQueue />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });
});
