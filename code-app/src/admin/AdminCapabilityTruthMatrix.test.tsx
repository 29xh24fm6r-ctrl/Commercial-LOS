// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminCapabilityTruthMatrix } from './AdminCapabilityTruthMatrix';
import { GOVERNED_WRITES, NOT_WIRED, LOCAL_ONLY_FLOWS, DELIBERATELY_BLOCKED } from '../shared/governance/platformInventory';

describe('AdminCapabilityTruthMatrix', () => {
  it('shows the total count across all four registries in the header', () => {
    render(<AdminCapabilityTruthMatrix />);
    const total = GOVERNED_WRITES.length + NOT_WIRED.length + LOCAL_ONLY_FLOWS.length + DELIBERATELY_BLOCKED.length;
    expect(screen.getByText(new RegExp(`${total} tracked capabilities`))).toBeInTheDocument();
  });

  it('lists a known deliberate blocker while current NOT_WIRED is empty', () => {
    const { container } = render(<AdminCapabilityTruthMatrix />);
    const known = DELIBERATELY_BLOCKED[0]!;
    const row = container.querySelector(`[data-admin-truth-matrix-row="${known.id}"]`);
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain(known.label);
    expect(row?.textContent).toContain('Deliberately blocked');
    expect(NOT_WIRED).toEqual([]);
  });

  it('filters to only NOT_WIRED entries when that filter is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdminCapabilityTruthMatrix />);
    await user.click(container.querySelector('[data-admin-truth-matrix-filter="not-wired"]') as HTMLElement);
    const rows = container.querySelectorAll('[data-admin-truth-matrix-row]');
    expect(rows.length).toBe(NOT_WIRED.length);
  });

  it('filters by search query across label and id', async () => {
    const user = userEvent.setup();
    const known = GOVERNED_WRITES[0]!;
    const { container } = render(<AdminCapabilityTruthMatrix />);
    await user.type(container.querySelector('[data-admin-truth-matrix-search]') as HTMLInputElement, known.id);
    const rows = container.querySelectorAll('[data-admin-truth-matrix-row]');
    expect(rows.length).toBeGreaterThan(0);
    expect(container.querySelector(`[data-admin-truth-matrix-row="${known.id}"]`)).not.toBeNull();
  });

  it('shows an honest empty state when nothing matches the search', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdminCapabilityTruthMatrix />);
    await user.type(container.querySelector('[data-admin-truth-matrix-search]') as HTMLInputElement, 'zzz-no-such-capability-zzz');
    expect(screen.getByText(/No capabilities match this filter/i)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-admin-truth-matrix-row]').length).toBe(0);
  });
});
